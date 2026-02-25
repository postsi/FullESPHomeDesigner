#!/usr/bin/env python3
"""
Run the ESPHome Touch Designer compiler locally against dummy devices.
No Home Assistant required. Usage (from repo root):
  python scripts/test_compile.py
"""
from __future__ import annotations

import sys
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


def validate(yaml_text: str, device_slug: str = "hallway") -> list[str]:
    errors = []
    lines = yaml_text.strip().splitlines()

    if "#__HA_BINDINGS__" in yaml_text:
        errors.append("Output contains literal #__HA_BINDINGS__")

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


def main() -> None:
    print("Testing compiler (no HA)...")
    cases = [
        ("empty screen", make_device()),
        ("jc1060 recipe", make_device(recipe_id="jc1060p470_esp32p4_1024x600", slug="test_jc")),
        ("no api key", make_device(api_key=None)),
    ]
    all_ok = True
    for label, device in cases:
        print(f"\n--- {label} ---")
        try:
            out = compile_to_esphome_yaml(device)
            errs = validate(out, device.slug)
            if errs:
                print("VALIDATION FAILED:")
                for e in errs:
                    print(f"  - {e}")
                all_ok = False
            else:
                print("OK (valid YAML, esphome first, name present, no marker)")
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
