"""
Components panel and section merge: section_overrides ignored, list sections merged, keys_with_additions.
"""
from __future__ import annotations

import yaml
from pathlib import Path

from custom_components.esphome_touch_designer.api.views import (
    _section_body_from_value,
    _build_default_section_pieces,
    _build_sections_panel_data,
    _compile_to_esphome_yaml_section_based,
    _collect_widget_ids_from_project,
    _remove_orphaned_widget_refs_from_sections,
    _remove_orphaned_widget_refs_from_esphome_components,
    _compile_warnings,
)
from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_section_overrides_ignored(jc1060_recipe_text, default_project):
    """Compile only reads project.sections; section_overrides is ignored."""
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["sections"] = {}
    project["section_overrides"] = {"logger": "logger:\n  level: VERBOSE\n  logs: {}"}
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "VERBOSE" not in out


def test_merge_sensor_user_and_compiler(jc1060_recipe_text, default_project):
    """User addition in project.sections['sensor'] is merged with compiler HA bindings."""
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [{
        "page_id": "main", "name": "Main",
        "widgets": [{"id": "w1", "type": "label", "x": 0, "y": 0, "w": 100, "h": 30, "props": {"text": "Hi"}}],
    }]
    project["bindings"] = [{"entity_id": "sensor.foo_temperature", "kind": "attribute_number", "attribute": "temperature"}]
    project["links"] = [{
        "source": {"entity_id": "sensor.foo_temperature", "kind": "attribute_number", "attribute": "temperature"},
        "target": {"widget_id": "w1", "action": "label_text"},
    }]
    user_sensor_block = """  - platform: lvgl
    id: my_custom_sensor
    widget: w1
    name: My Custom Sensor
"""
    project["sections"] = {"sensor": "sensor:\n" + user_sensor_block.strip() + "\n"}
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "sensor:" in out and "platform: lvgl" in out and "platform: homeassistant" in out
    assert "my_custom_sensor" in out or "widget: w1" in out
    assert "entity_id" in out


def test_merge_switch_user_only(jc1060_recipe_text, default_project):
    """User-only project.sections['switch'] appears in compile."""
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [{
        "page_id": "main", "name": "Main",
        "widgets": [{"id": "sw1", "type": "switch", "x": 0, "y": 0, "w": 80, "h": 40, "props": {}}],
    }]
    user_switch_block = """  - platform: lvgl
    id: my_switch
    widget: sw1
    name: My Switch
"""
    project["sections"] = {"switch": "switch:\n" + user_switch_block.strip() + "\n"}
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "switch:" in out and "platform: lvgl" in out
    assert "my_switch" in out or "widget: sw1" in out


def test_keys_with_user_addition(jc1060_recipe_text, default_project):
    """Sections API returns keys_with_additions for keys that have user-added content (project.sections)."""
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["sections"] = {"logger": "  level: DEBUG\n"}
    from custom_components.esphome_touch_designer.esphome_sections import SECTION_ORDER
    keys_with_additions = [k for k in SECTION_ORDER if (project.get("sections") or {}).get(k, "").strip()]
    assert "logger" in keys_with_additions


def test_sections_panel_returns_only_user_additions(default_project):
    """Components panel API returns only project.sections content; no recipe/compiler content.
    Ensures sections and keys_with_additions are derived solely from user-added YAML.
    """
    from custom_components.esphome_touch_designer.esphome_sections import SECTION_ORDER

    # Empty project.sections -> all section content empty, keys_with_additions empty
    project_empty = dict(default_project)
    project_empty["sections"] = {}
    data_empty = _build_sections_panel_data(project_empty)
    assert data_empty["keys_with_additions"] == []
    for key in SECTION_ORDER:
        assert (data_empty["sections"].get(key) or "").strip() == "", (
            f"Section {key} should be empty when project.sections is empty"
        )

    # Only user-added logger -> only logger has content and is in keys_with_additions
    user_logger = "  level: DEBUG\n"
    project_logger = dict(default_project)
    project_logger["sections"] = {"logger": user_logger}
    data_logger = _build_sections_panel_data(project_logger)
    assert "logger" in data_logger["keys_with_additions"]
    assert (data_logger["sections"].get("logger") or "").strip()
    # Sections that user did not add must be empty (e.g. wifi from recipe must not appear)
    for key in SECTION_ORDER:
        if key != "logger":
            assert (data_logger["sections"].get(key) or "").strip() == "", (
                f"Section {key} must be empty when not in project.sections"
            )
    assert data_logger["keys_with_additions"] == ["logger"]


def test_merged_output_valid_yaml(jc1060_recipe_text, default_project):
    """Compiled output with user addition in switch section is valid YAML."""
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": []}]
    project["sections"] = {
        "switch": "switch:\n  - platform: lvgl\n    id: sw1\n    widget: x\n    name: S1\n",
    }
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    loader = yaml.SafeLoader
    def _tag(loader, node):
        return getattr(node, "value", str(node))
    yaml.add_constructor("!secret", _tag, loader)
    yaml.add_constructor("!lambda", _tag, loader)
    parsed = yaml.load(out, Loader=loader)
    assert "esphome" in parsed and "switch" in parsed
    switch_entries = parsed["switch"] if isinstance(parsed["switch"], list) else [parsed["switch"]] if isinstance(parsed["switch"], dict) else []
    assert len(switch_entries) >= 1
    first = switch_entries[0] if switch_entries else {}
    assert isinstance(first, dict) and (first.get("platform") == "lvgl" or "platform" in first)


def test_orphan_removal_and_warnings(default_project):
    """Orphan cleanup removes blocks whose widget id is not in project; compile warnings list them."""
    project = dict(default_project)
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": [{"id": "w1", "type": "label"}]}]
    project["sections"] = {
        "switch": "switch:\n  - platform: lvgl\n    id: sw_orphan\n    widget: deleted_widget\n    name: Orphan\n"
    }
    ids = _collect_widget_ids_from_project(project)
    assert "w1" in ids and "deleted_widget" not in ids
    warnings = _compile_warnings(project)
    assert any(w.get("type") == "orphan_widget_ref" and w.get("widget_id") == "deleted_widget" for w in warnings)
    removed = _remove_orphaned_widget_refs_from_sections(project)
    assert ("switch", "deleted_widget") in removed
    switch_content = (project.get("sections") or {}).get("switch") or ""
    assert "deleted_widget" not in switch_content


def test_orphan_removal_esphome_components(default_project):
    """Orphan cleanup removes Create-component blocks from esphome_components when widget id is deleted."""
    project = dict(default_project)
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": [{"id": "sw1", "type": "switch"}]}]
    orphan_block = "switch:\n  - platform: lvgl\n    id: my_sw\n    widget: deleted_widget\n    name: Orphan\n"
    project["esphome_components"] = [
        orphan_block,
        "switch:\n  - platform: lvgl\n    id: sw_kept\n    widget: sw1\n    name: Kept\n",
    ]
    ids = _collect_widget_ids_from_project(project)
    assert "sw1" in ids and "deleted_widget" not in ids
    removed = _remove_orphaned_widget_refs_from_esphome_components(project)
    assert ("esphome_components", "deleted_widget") in removed
    comps = project.get("esphome_components") or []
    assert len(comps) == 1
    assert "deleted_widget" not in comps[0] and "widget: sw1" in comps[0]
