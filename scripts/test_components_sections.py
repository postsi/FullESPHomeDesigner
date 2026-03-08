#!/usr/bin/env python3
"""
Test Components section logic: full-block storage, parse, build defaults, compile.
Run from repo root: python scripts/test_components_sections.py
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
    _section_full_block,
    _section_body_from_value,
    _parse_recipe_into_sections,
    _build_default_section_pieces,
    _ensure_project_sections,
    _compile_to_esphome_yaml_section_based,
    ETD_DEVICE_NAME_PLACEHOLDER,
)
from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project


def test_section_helpers():
    """Full block roundtrip and parse."""
    body = """  name: test1
  min_version: 2024.11.0
  project:
    name: "x"
    version: "1.0"
  on_boot:
    priority: 600"""
    full = _section_full_block("esphome", body)
    assert full.startswith("esphome:\n"), full[:20]
    assert "  name: test1" in full
    parsed = yaml.safe_load(full)
    assert "esphome" in parsed
    assert parsed["esphome"]["name"] == "test1"
    assert "on_boot" in parsed["esphome"]
    extracted = _section_body_from_value(full, "esphome")
    assert extracted.strip().startswith("name:"), extracted[:30]
    legacy_body = "  name: only"
    assert _section_body_from_value(legacy_body, "esphome") == legacy_body
    print("  section helpers: OK")


def test_recipe_parse_and_full_block():
    """Parse real recipe; esphome section becomes valid full block."""
    recipe_path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    recipe_text = recipe_path.read_text("utf-8")
    sections = _parse_recipe_into_sections(recipe_text)
    assert "esphome" in sections
    body = sections["esphome"]
    assert body.strip().startswith("name:") or "name:" in body
    full = _section_full_block("esphome", body)
    parsed = yaml.safe_load(full)
    assert "esphome" in parsed
    assert "name" in parsed["esphome"]
    assert "on_boot" in parsed["esphome"]
    print("  recipe parse + full block: OK")


def test_build_default_pieces():
    """Default pieces are full blocks that parse."""
    recipe_path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    recipe_text = recipe_path.read_text("utf-8")
    project = dict(_default_project())
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    pieces = _build_default_section_pieces(project, device=None, recipe_text=recipe_text)
    assert "esphome" in pieces
    full = pieces["esphome"]
    assert full.strip().startswith("esphome:"), full[:50]
    parsed = yaml.safe_load(full)
    assert parsed["esphome"]["name"] == ETD_DEVICE_NAME_PLACEHOLDER or "test" in str(parsed["esphome"].get("name", ""))
    print("  build_default_section_pieces: OK")


def test_ensure_and_compile():
    """Ensure project sections then compile; output is valid YAML with esphome first."""
    recipe_path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    recipe_text = recipe_path.read_text("utf-8")
    project = dict(_default_project())
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    sections = project.get("sections") or {}
    assert "esphome" in sections
    assert sections["esphome"].strip().startswith("esphome:"), sections["esphome"][:50]
    device = DeviceProject(
        device_id="test",
        slug="test_device",
        name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600",
        api_key=None,
        project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, recipe_text)
    assert "esphome:" in out
    assert "name: \"test_device\"" in out or "name: 'test_device'" in out
    # Output contains !secret so use loader that allows it (same as test_compile.py)
    loader = yaml.SafeLoader
    def _tag(loader, node):
        return getattr(node, "value", str(node))
    yaml.add_constructor("!secret", _tag, loader)
    yaml.add_constructor("!lambda", _tag, loader)
    parsed = yaml.load(out, Loader=loader)
    assert "esphome" in parsed
    assert parsed["esphome"]["name"] == "test_device"
    print("  ensure_project_sections + compile: OK")


def test_legacy_migration():
    """Legacy body-only project.sections is migrated to full block."""
    recipe_path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    recipe_text = recipe_path.read_text("utf-8")
    project = {"sections": {"esphome": "  name: legacy\n  min_version: 2024.1.0"}}
    _ensure_project_sections(project, device=None, recipe_text=recipe_text)
    full = project["sections"]["esphome"]
    assert full.strip().startswith("esphome:"), full[:50]
    parsed = yaml.safe_load(full)
    assert parsed["esphome"]["name"] == "legacy"
    print("  legacy migration: OK")


def test_lvgl_widget_yaml_compiles():
    """LVGL block (config + pages + widgets) compiles to valid YAML and parses correctly."""
    recipe_path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    recipe_text = recipe_path.read_text("utf-8")
    project = dict(_default_project())
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    # Ensure lvgl_config emits config (buffer_size, disp_bg_color) and one page with one widget
    project["lvgl_config"] = {
        "main": {"disp_bg_color": "#0B0F14", "buffer_size": "100%"},
        "style_definitions": [],
        "theme": {},
        "gradients": [],
        "top_layer": {"widgets": []},
    }
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [
                {"id": "w1", "type": "label", "x": 10, "y": 20, "w": 200, "h": 30, "props": {"text": "Hello"}},
            ],
        }
    ]
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
    assert "lvgl:" in out, "Compiled YAML should contain lvgl: block"
    assert "pages:" in out, "LVGL block should contain pages:"
    assert "buffer_size:" in out, "LVGL config should contain buffer_size"
    # Parse full output (!secret/!lambda)
    loader = yaml.SafeLoader
    def _tag(loader, node):
        return getattr(node, "value", str(node))
    yaml.add_constructor("!secret", _tag, loader)
    yaml.add_constructor("!lambda", _tag, loader)
    parsed = yaml.load(out, Loader=loader)
    assert "lvgl" in parsed, "Parsed doc should have top-level lvgl key"
    lvgl = parsed["lvgl"]
    assert isinstance(lvgl, dict), "lvgl should be a dict"
    assert "pages" in lvgl, "lvgl should have pages key"
    pages = lvgl["pages"]
    assert isinstance(pages, list) and len(pages) >= 1, "lvgl.pages should be a non-empty list"
    first_page = pages[0]
    assert "widgets" in first_page, "First page should have widgets"
    widgets = first_page["widgets"]
    assert isinstance(widgets, list), "widgets should be a list"
    # We expect at least one widget (our label)
    assert len(widgets) >= 1, "Page should contain at least one widget"
    w = widgets[0]
    assert w.get("type") == "label" or "label" in str(w), "First widget should be a label"
    print("  lvgl widget YAML compile: OK")


def main():
    print("Testing Components section logic...")
    try:
        test_section_helpers()
        test_recipe_parse_and_full_block()
        test_build_default_pieces()
        test_ensure_and_compile()
        test_legacy_migration()
        test_lvgl_widget_yaml_compiles()
        print("\nAll component section tests passed.")
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
