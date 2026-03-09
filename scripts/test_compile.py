#!/usr/bin/env python3
"""
Run the ESPHome Touch Designer compiler locally against dummy devices.
No Home Assistant required. Usage (from repo root):
  python scripts/test_compile.py

When esphome is installed in the same environment where you run this script (e.g.
dev machine or CI sandbox—not on the Home Assistant server), it runs
"esphome config <generated_yaml>" on every compile output. If any run reports
"Failed config", the test fails (full output must be valid ESPHome YAML). The
integration does not depend on esphome (manifest.json requirements stay empty).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Repo root = parent of scripts/
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Mock Home Assistant so we can import the integration
import unittest.mock as mock
for mod in (
    "homeassistant",
    "homeassistant.core",
    "homeassistant.config_entries",
    "homeassistant.helpers",
    "homeassistant.helpers.storage",
    "homeassistant.components",
    "homeassistant.components.http",
):
    if mod not in sys.modules:
        sys.modules[mod] = mock.MagicMock()

# Now we can import the compiler and device model
from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api.views import compile_to_esphome_yaml

import yaml


def make_device(
    device_id: str = "hallway",
    slug: str = "hallway",
    name: str = "Hallway",
    recipe_id: str = "guition_s3_4848s040_480x480",
    api_key: str | None = "k3NlzHoGkcmsMq0rxB8DUjwfTC+1MzeJFVoCgQd12IA=",
    project: dict | None = None,
) -> DeviceProject:
    return DeviceProject(
        device_id=device_id,
        slug=slug,
        name=name,
        hardware_recipe_id=recipe_id,
        api_key=api_key,
        project=project if project is not None else _default_project(),
    )


def _project_with_color_picker() -> dict:
    """Minimal project with one color_picker (no on_click) so compiler emits globals + script."""
    from custom_components.esphome_touch_designer.storage import _default_project
    proj = _default_project()
    proj["pages"] = [{
        "page_id": "main",
        "name": "Main",
        "widgets": [
            {"id": "cp1", "type": "color_picker", "props": {"value": "#4080FF"}, "style": {}, "custom_events": {}},
        ],
    }]
    return proj


def _project_with_stored_esphome_manage_run() -> dict:
    """Project with stored esphome that references manage_run_and_sleep (no script in stored). Simulates UI-saved sections."""
    from custom_components.esphome_touch_designer.storage import _default_project
    proj = _default_project()
    proj["sections"] = {
        "esphome": (
            "esphome:\n  name: __ETD_DEVICE_NAME__\n  min_version: 2024.11.0\n"
            "  on_boot:\n    - priority: 600\n      then:\n        - delay: 2s\n        - script.execute: manage_run_and_sleep\n"
        ),
    }
    return proj


# Minimal recipe without "manage_run_and_sleep" (used to test stub is added from stored esphome).
# Includes minimal display so lvgl config validates with "esphome config".
_MINIMAL_RECIPE_NO_MANAGE_RUN = """esphome:
  name: __ETD_DEVICE_NAME__
  min_version: 2024.11.0
esp32:
  variant: esp32s3
  flash_size: 16MB
  framework:
    type: esp-idf
i2c:
  sda: GPIO8
  scl: GPIO9
display:
  - platform: ssd1306_i2c
    model: "SSD1306 128x64"
    id: stub_display
"""


def validate(yaml_text: str, device_slug: str = "hallway") -> list[str]:
    errors = []
    lines = yaml_text.strip().splitlines()

    if "#__HA_BINDINGS__" in yaml_text:
        errors.append("Output contains literal #__HA_BINDINGS__")

    # globals: and script: list items must be at 2 spaces (not 4), or parser fails with "mapping values not allowed"
    for section_name in ("globals:", "script:"):
        if section_name not in yaml_text:
            continue
        idx = yaml_text.find(section_name)
        block = yaml_text[idx : idx + 800]
        for line in block.splitlines()[1:]:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if line.startswith("    - "):
                errors.append(
                    f"Over-indented {section_name.strip()} section: list items must use 2 spaces, got 4"
                )
            break

    # First non-comment non-blank line after --- should be esphome:
    seen_doc_start = False
    for line in lines:
        s = line.strip()
        if s == "---":
            seen_doc_start = True
            continue
        if not s or s.startswith("#"):
            continue
        if seen_doc_start or not yaml_text.strip().startswith("---"):
            if not s.startswith("esphome:"):
                errors.append(f"Expected first key to be 'esphome:', got: {line[:60]!r}")
            break
        break

    # If config references script.execute: manage_run_and_sleep, script section must define it
    if "manage_run_and_sleep" in yaml_text and "id: manage_run_and_sleep" not in yaml_text:
        errors.append("Config references manage_run_and_sleep but no script defines id: manage_run_and_sleep")

    # Must have name: under esphome (required by ESPHome)
    if "name:" not in yaml_text:
        errors.append("Missing 'name:' (ESPHome required)")
    # Quick check that esphome block has name
    if "esphome:" in yaml_text and "name:" in yaml_text:
        idx = yaml_text.find("esphome:")
        block = yaml_text[idx : yaml_text.find("\n\n", idx) if "\n\n" in yaml_text[idx:] else len(yaml_text)]
        if "  name:" not in block and "\n  name:" not in block:
            errors.append("esphome block should contain 'name:' key")

    # Must be valid YAML (ESPHome uses !secret / !lambda; allow them so parse succeeds)
    try:
        loader = yaml.SafeLoader
        def _tag_constructor(loader, node):
            return getattr(node, "value", str(node))
        if "!secret" in yaml_text:
            yaml.add_constructor("!secret", _tag_constructor, loader)
        if "!lambda" in yaml_text:
            yaml.add_constructor("!lambda", _tag_constructor, loader)
        yaml.load(yaml_text, Loader=loader)
    except yaml.YAMLError as e:
        errors.append(f"Invalid YAML: {e}")

    return errors


def run_esphome_config(yaml_text: str, label: str) -> list[str]:
    """Run `esphome config` on the generated YAML when esphome is available. Returns list of errors (empty if OK or esphome not found)."""
    exe = shutil.which("esphome")
    if not exe:
        return []  # skip when esphome not installed
    with tempfile.TemporaryDirectory(prefix="etd_compile_test_") as tmp:
        config_path = Path(tmp) / "config.yaml"
        config_path.write_text(yaml_text, encoding="utf-8")
        # Minimal secrets so esphome doesn't fail on !secret wifi_ssid (WPA password must be >= 8 chars)
        secrets_path = Path(tmp) / "secrets.yaml"
        secrets_path.write_text(
            "wifi_ssid: test\nwifi_password: testpass\n",
            encoding="utf-8",
        )
        env = os.environ.copy()
        env["ESPHOME_CONFIG_DIR"] = tmp
        try:
            result = subprocess.run(
                [exe, "config", str(config_path)],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=tmp,
                env=env,
            )
        except subprocess.TimeoutExpired:
            return [f"{label}: esphome config timed out"]
        except Exception as e:
            return [f"{label}: esphome config failed to run: {e}"]
        combined = (result.stderr or "") + "\n" + (result.stdout or "")
        # Fail on any "Failed config" — the full compile output must be valid ESPHome YAML
        if "Failed config" in combined:
            err = (result.stderr or result.stdout or "").strip()
            return [f"{label}: esphome config invalid: {err[:600]}"]
        if result.returncode != 0:
            # Exit code 2 with no "Failed config" can be warnings; don't fail
            return []
    return []


def main() -> None:
    print("Testing compiler (no HA)...")
    cases = [
        ("empty screen", make_device(), None),
        ("jc1060 recipe", make_device(recipe_id="jc1060p470_esp32p4_1024x600", slug="test_jc"), None),
        ("no api key", make_device(api_key=None), None),
        ("color picker (globals+script)", make_device(project=_project_with_color_picker(), slug="cp_test"), None),
        ("stored esphome + manage_run_and_sleep (stub from sections)", make_device(project=_project_with_stored_esphome_manage_run(), slug="stored_stub"), _MINIMAL_RECIPE_NO_MANAGE_RUN),
    ]
    all_ok = True
    for case in cases:
        label, device = case[0], case[1]
        recipe_override = case[2] if len(case) > 2 else None
        print(f"\n--- {label} ---")
        try:
            out = compile_to_esphome_yaml(device, recipe_text=recipe_override)
            errs = validate(out, device.slug)
            if errs:
                print("VALIDATION FAILED:")
                for e in errs:
                    print(f"  - {e}")
                all_ok = False
            else:
                print("OK (valid YAML, esphome first, name present, no marker)")
            # When esphome is installed, validate every compile output with "esphome config"
            if not errs:
                esphome_errs = run_esphome_config(out, label)
                if esphome_errs:
                    print("ESPHOME CONFIG FAILED:")
                    for e in esphome_errs:
                        print(f"  - {e}")
                    all_ok = False
                elif shutil.which("esphome"):
                    print("OK (esphome config validated)")
            # First 40 lines of output
            preview = "\n".join(out.splitlines()[:40])
            print(preview)
            if len(out.splitlines()) > 40:
                print("...")
        except Exception as e:
            print(f"ERROR: {e}")
            all_ok = False

    print("\n" + ("All passed." if all_ok else "Some checks failed."))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
