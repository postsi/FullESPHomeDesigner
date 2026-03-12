"""
Component Sections Design v2: single stored YAML, section states (empty/auto/edited), Reset = current recipe.
"""
from __future__ import annotations

import yaml
from pathlib import Path

from custom_components.esphome_touch_designer.api.views import (
    _stored_sections_from_project,
    _sections_to_yaml,
    _build_recipe_default_sections,
    _build_sections_panel_data_v2,
    _compile_to_esphome_yaml_section_based,
    _section_full_block,
    SECTION_STATE_EMPTY,
    SECTION_STATE_AUTO,
    SECTION_STATE_EDITED,
)
from custom_components.esphome_touch_designer.esphome_sections import SECTION_ORDER
from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_stored_sections_from_esphome_yaml():
    """When project has esphome_yaml, _stored_sections_from_project parses it to sections."""
    yaml_str = "esphome:\n  name: mydev\n\nesp32:\n  variant: esp32\n"
    project = {"esphome_yaml": yaml_str}
    sections = _stored_sections_from_project(project)
    assert "esphome" in sections
    assert "esp32" in sections
    assert "name: mydev" in sections["esphome"] or "name:" in sections["esphome"]
    assert "variant: esp32" in sections["esp32"] or "variant:" in sections["esp32"]


def test_stored_sections_from_legacy_sections():
    """When project has no esphome_yaml but has sections, legacy sections are returned."""
    project = {"sections": {"logger": "  level: DEBUG\n"}}
    sections = _stored_sections_from_project(project)
    assert (sections.get("logger") or "").strip() == "level: DEBUG"
    assert (sections.get("esphome") or "").strip() == ""


def test_sections_to_yaml_roundtrip():
    """_sections_to_yaml builds YAML; parsing it back gives same section keys."""
    sections = {
        "esphome": "  name: test\n  platform: ESP32",
        "logger": "  level: DEBUG",
    }
    out = _sections_to_yaml(sections)
    assert "esphome:" in out and "logger:" in out
    parsed = _stored_sections_from_project({"esphome_yaml": out})
    assert (parsed.get("esphome") or "").strip()
    assert (parsed.get("logger") or "").strip() == "level: DEBUG"


def test_build_recipe_default_sections(jc1060_recipe_text):
    """_build_recipe_default_sections returns recipe content with device slug substituted."""
    device = DeviceProject(
        device_id="d1", slug="my_slug", name="My",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project={},
    )
    defaults = _build_recipe_default_sections(jc1060_recipe_text, device)
    assert "esphome" in defaults
    assert "esp32" in defaults
    # Device slug is substituted into esphome name for display/default
    assert "my_slug" in (defaults.get("esphome") or "")


def test_build_sections_panel_data_v2_states(jc1060_recipe_text):
    """Section states: empty when no content, auto when matches recipe, edited when different."""
    device = DeviceProject(
        device_id="d1", slug="dev", name="Dev",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project={},
    )
    # Project with no esphome_yaml and no sections -> stored_sections from legacy (empty)
    project_empty = {}
    data_empty = _build_sections_panel_data_v2(project_empty, device, jc1060_recipe_text)
    assert data_empty["section_states"].get("esphome") == SECTION_STATE_EMPTY

    # Project with esphome_yaml equal to recipe -> auto
    default_bodies = _build_recipe_default_sections(jc1060_recipe_text, device)
    project_auto = {"esphome_yaml": _sections_to_yaml(default_bodies)}
    data_auto = _build_sections_panel_data_v2(project_auto, device, jc1060_recipe_text)
    for k in ("esphome", "esp32"):
        if (data_auto["sections"].get(k) or "").strip():
            assert data_auto["section_states"].get(k) == SECTION_STATE_AUTO, k

    # Project with one section edited -> that section edited
    edited_sections = dict(default_bodies)
    edited_sections["logger"] = "  level: VERBOSE"
    project_edited = {"esphome_yaml": _sections_to_yaml(edited_sections)}
    data_edited = _build_sections_panel_data_v2(project_edited, device, jc1060_recipe_text)
    assert data_edited["section_states"].get("logger") == SECTION_STATE_EDITED
    assert "compiler_owned" in data_edited and "lvgl" in data_edited["compiler_owned"]


def test_compile_uses_esphome_yaml_when_present(jc1060_recipe_text, default_project):
    """When project has esphome_yaml, compile uses it as base and replaces lvgl with compiler."""
    default_bodies = _build_recipe_default_sections(jc1060_recipe_text, None)
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["esphome_yaml"] = _sections_to_yaml(default_bodies)
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": [{"id": "w1", "type": "label", "x": 0, "y": 0, "w": 100, "h": 30}]}]
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "esphome:" in out and "esp32:" in out
    # LVGL should come from compiler (pages)
    assert "lvgl:" in out
    assert "pages:" in out or "widgets:" in out


def test_compile_esphome_yaml_edited_section_preserved(jc1060_recipe_text, default_project):
    """User-edited section in esphome_yaml is preserved in compile (non-lvgl)."""
    default_bodies = _build_recipe_default_sections(jc1060_recipe_text, None)
    default_bodies["logger"] = "  level: VERBOSE\n  logs: {}"
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["esphome_yaml"] = _sections_to_yaml(default_bodies)
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": []}]
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "VERBOSE" in out
    assert "logs: {}" in out


def test_compile_legacy_sections_still_works(jc1060_recipe_text, default_project):
    """When project has no esphome_yaml but has sections, legacy compile path is used."""
    project = dict(default_project)
    project["device"] = project.get("device") or {}
    project["device"]["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["sections"] = {"logger": _section_full_block("logger", "  level: DEBUG")}
    project["pages"] = [{"page_id": "main", "name": "Main", "widgets": []}]
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "logger:" in out and "DEBUG" in out


def test_sections_save_merge_to_esphome_yaml():
    """SectionsSaveView logic: merging sections dict produces project.esphome_yaml (unit-test helper)."""
    from custom_components.esphome_touch_designer.api.views import _sections_to_yaml
    sections = {
        "esphome": "  name: x\n  platform: ESP32",
        "logger": "  level: INFO",
    }
    yaml_str = _sections_to_yaml(sections)
    project = {"esphome_yaml": yaml_str}
    parsed = _stored_sections_from_project(project)
    assert (parsed.get("esphome") or "").strip()
    assert "INFO" in (parsed.get("logger") or "")
