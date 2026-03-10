#!/usr/bin/env python3
"""
Test Components panel behavior and section merge (post section_overrides removal).
Verifies:
- section_overrides is not used; project.sections is the single source for manual content.
- List-like sections (sensor, switch, etc.) merge user Components YAML with compiler output.
- overridden_keys logic: keys where effective content != default are marked manual.
Run from repo root: python scripts/test_components_panel_and_merge.py
"""
from __future__ import annotations

import sys
import yaml
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

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

from custom_components.esphome_touch_designer.api.views import (
    _section_body_from_value,
    _build_default_section_pieces,
    _ensure_project_sections,
    _compile_to_esphome_yaml_section_based,
)
from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project


def _recipe_text():
    path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    return path.read_text("utf-8")


def test_section_overrides_ignored():
    """section_overrides is not read; only project.sections is used for manual content."""
    recipe_text = _recipe_text()
    project = dict(_default_project())
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["sections"] = {}
    project["section_overrides"] = {"logger": "  level: VERBOSE\n  logs: {}"}
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    sections = project.get("sections") or {}
    logger_block = sections.get("logger") or ""
    logger_body = _section_body_from_value(logger_block, "logger") if logger_block else ""
    assert "VERBOSE" not in logger_body, (
        "section_overrides must be ignored; logger should come from recipe/default, not overrides"
    )
    print("  section_overrides ignored: OK")


def test_merge_sensor_user_and_compiler():
    """User content in project.sections['sensor'] is merged with compiler HA bindings."""
    recipe_text = _recipe_text()
    project = dict(_default_project())
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [{"id": "w1", "type": "label", "x": 0, "y": 0, "w": 100, "h": 30, "props": {"text": "Hi"}}],
        }
    ]
    project["bindings"] = [{"entity_id": "sensor.foo_temperature", "kind": "attribute_number", "attribute": "temperature"}]
    project["links"] = [
        {
            "source": {"entity_id": "sensor.foo_temperature", "kind": "attribute_number", "attribute": "temperature"},
            "target": {"widget_id": "w1", "action": "label_text"},
        }
    ]
    user_sensor_block = """  - platform: lvgl
    id: my_custom_sensor
    widget: w1
    name: My Custom Sensor
"""
    project["sections"] = {"sensor": "sensor:\n" + user_sensor_block.strip() + "\n"}
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    device = DeviceProject(
        device_id="test",
        slug="test_device",
        name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600",
        api_key=None,
        project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, recipe_text)
    assert "sensor:" in out
    assert "platform: lvgl" in out, "User LVGL sensor block must appear in compiled output"
    assert "platform: homeassistant" in out, "Compiler HA binding must appear in compiled output"
    assert "my_custom_sensor" in out or "widget: w1" in out
    assert "entity_id" in out
    print("  merge sensor (user + compiler): OK")


def test_merge_switch_user_only():
    """User-only project.sections['switch'] (no compiler output for switch) appears in compile."""
    recipe_text = _recipe_text()
    project = dict(_default_project())
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [{"id": "sw1", "type": "switch", "x": 0, "y": 0, "w": 80, "h": 40, "props": {}}],
        }
    ]
    user_switch_block = """  - platform: lvgl
    id: my_switch
    widget: sw1
    name: My Switch
"""
    project["sections"] = {"switch": "switch:\n" + user_switch_block.strip() + "\n"}
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    device = DeviceProject(
        device_id="test",
        slug="test_device",
        name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600",
        api_key=None,
        project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, recipe_text)
    assert "switch:" in out, f"Compiled output must contain 'switch:' section (user-only). Got keys: {[l.strip() for l in out.split(chr(10)) if l.strip().endswith(':')][:30]}"
    assert "platform: lvgl" in out, "User LVGL switch block must appear in compiled output"
    assert "my_switch" in out or "widget: sw1" in out, "User switch id/widget must appear in compiled output"
    print("  merge switch (user only): OK")


def test_overridden_keys_logic():
    """overridden_keys = keys where effective section content != default (no section_overrides)."""
    recipe_text = _recipe_text()
    project = dict(_default_project())
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["sections"] = {"logger": "logger:\n  level: DEBUG\n"}
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    sections = dict((project.get("sections") or {}) if isinstance(project.get("sections"), dict) else {})
    default_sections = _build_default_section_pieces(project, device=None, recipe_text=recipe_text)
    overridden_keys = [k for k in sections if (sections.get(k) or "").strip() != (default_sections.get(k) or "").strip()]
    assert "logger" in overridden_keys, "logger was manually set; must appear in overridden_keys"
    print("  overridden_keys reflects stored sections: OK")


def test_merged_output_valid_yaml():
    """Compiled output with merged sensor section is valid YAML."""
    recipe_text = _recipe_text()
    project = dict(_default_project())
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": []}]
    project["sections"] = {
        "switch": "switch:\n  - platform: lvgl\n    id: sw1\n    widget: x\n    name: S1\n",
    }
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    device = DeviceProject(
        device_id="test",
        slug="test_device",
        name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600",
        api_key=None,
        project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, recipe_text)
    loader = yaml.SafeLoader
    def _tag(loader, node):
        return getattr(node, "value", str(node))
    yaml.add_constructor("!secret", _tag, loader)
    yaml.add_constructor("!lambda", _tag, loader)
    parsed = yaml.load(out, Loader=loader)
    assert "esphome" in parsed
    assert "switch" in parsed
    switch_entries = parsed["switch"] if isinstance(parsed["switch"], list) else [parsed["switch"]] if isinstance(parsed["switch"], dict) else []
    assert len(switch_entries) >= 1, "Parsed switch section should have at least one entry"
    first = switch_entries[0] if switch_entries else {}
    assert isinstance(first, dict) and (first.get("platform") == "lvgl" or "platform" in first), "First switch entry should be a dict with platform"
    print("  merged output valid YAML: OK")


def main():
    print("Testing Components panel and section merge...")
    try:
        test_section_overrides_ignored()
        test_merge_sensor_user_and_compiler()
        test_merge_switch_user_only()
        test_overridden_keys_logic()
        test_merged_output_valid_yaml()
        print("\nAll Components panel and merge tests passed.")
        return 0
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        return 1
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
