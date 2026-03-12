"""
Run the ESPHome Touch Designer compiler locally against dummy devices.
No Home Assistant required. When esphome is installed, runs 'esphome config'
on compile output to validate.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import yaml

from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api.views import compile_to_esphome_yaml

REPO_ROOT = Path(__file__).resolve().parent.parent


def _project_with_color_picker():
    proj = _default_project()
    proj["pages"] = [{
        "page_id": "main",
        "name": "Main",
        "widgets": [
            {"id": "cp1", "type": "color_picker", "props": {"value": "#4080FF"}, "style": {}, "custom_events": {}},
        ],
    }]
    return proj


def _project_with_stored_esphome_manage_run():
    proj = _default_project()
    proj["sections"] = {
        "esphome": (
            "esphome:\n  name: __ETD_DEVICE_NAME__\n  min_version: 2024.11.0\n"
            "  on_boot:\n    - priority: 600\n      then:\n        - delay: 2s\n        - script.execute: manage_run_and_sleep\n"
        ),
    }
    return proj


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
    if "manage_run_and_sleep" in yaml_text and "id: manage_run_and_sleep" not in yaml_text:
        errors.append("Config references manage_run_and_sleep but no script defines id: manage_run_and_sleep")
    if "name:" not in yaml_text:
        errors.append("Missing 'name:' (ESPHome required)")
    if "esphome:" in yaml_text and "name:" in yaml_text:
        idx = yaml_text.find("esphome:")
        block = yaml_text[idx : yaml_text.find("\n\n", idx) if "\n\n" in yaml_text[idx:] else len(yaml_text)]
        if "  name:" not in block and "\n  name:" not in block:
            errors.append("esphome block should contain 'name:' key")
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
    exe = shutil.which("esphome")
    if not exe:
        return []
    with tempfile.TemporaryDirectory(prefix="etd_compile_test_") as tmp:
        config_path = Path(tmp) / "config.yaml"
        config_path.write_text(yaml_text, encoding="utf-8")
        secrets_path = Path(tmp) / "secrets.yaml"
        secrets_path.write_text("wifi_ssid: test\nwifi_password: testpass\n", encoding="utf-8")
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
        if "Failed config" in combined:
            err = (result.stderr or result.stdout or "").strip()
            return [f"{label}: esphome config invalid: {err[:600]}"]
        if result.returncode != 0:
            return []
    return []


def test_compile_empty_screen(make_device):
    dev = make_device()
    out = compile_to_esphome_yaml(dev)
    assert not validate(out, dev.slug)
    if shutil.which("esphome"):
        assert not run_esphome_config(out, "empty screen")


def test_compile_jc1060_recipe(make_device):
    dev = make_device(recipe_id="jc1060p470_esp32p4_1024x600", slug="test_jc")
    out = compile_to_esphome_yaml(dev)
    assert not validate(out, dev.slug)
    if shutil.which("esphome"):
        assert not run_esphome_config(out, "jc1060 recipe")


def test_compile_no_api_key(make_device):
    dev = make_device(api_key=None)
    out = compile_to_esphome_yaml(dev)
    assert not validate(out, dev.slug)
    if shutil.which("esphome"):
        assert not run_esphome_config(out, "no api key")


def test_compile_color_picker(make_device):
    dev = make_device(project=_project_with_color_picker(), slug="cp_test")
    out = compile_to_esphome_yaml(dev)
    assert not validate(out, dev.slug)
    if shutil.which("esphome"):
        assert not run_esphome_config(out, "color picker")


def test_compile_stored_esphome_manage_run_and_sleep(make_device):
    dev = make_device(project=_project_with_stored_esphome_manage_run(), slug="stored_stub")
    out = compile_to_esphome_yaml(dev, recipe_text=_MINIMAL_RECIPE_NO_MANAGE_RUN)
    assert not validate(out, dev.slug)
    if shutil.which("esphome"):
        assert not run_esphome_config(out, "stored esphome manage_run_and_sleep")


def test_compile_esphome_section_mixed_indent_produces_valid_yaml(make_device):
    """Regression: when stored esphome section has first line with no indent and rest with 2 spaces,
    the emit logic must not over-indent subsequent lines (would produce invalid YAML:
    '  name: x\\n    min_version: y' instead of '  name: x\\n  min_version: y')."""
    proj = _default_project()
    proj["sections"] = {
        "esphome": (
            "esphome:\n"
            "name: __ETD_DEVICE_NAME__\n"  # no leading spaces - triggers old bug
            "  min_version: 2024.11.0\n"
            "  project:\n    name: test\n    version: 1\n"
        ),
    }
    dev = make_device(project=proj, slug="hallway", recipe_id="sunton_2432s028r_320x240")
    out = compile_to_esphome_yaml(dev, recipe_text=_MINIMAL_RECIPE_NO_MANAGE_RUN)
    assert not validate(out, dev.slug), validate(out, dev.slug)
    parsed = yaml.safe_load(out)
    assert "esphome" in parsed
    esp = parsed["esphome"]
    assert esp.get("name") == "hallway"
    assert esp.get("min_version") == "2024.11.0"
