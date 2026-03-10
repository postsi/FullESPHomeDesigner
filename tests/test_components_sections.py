"""
Components section logic: full-block storage, parse, build defaults, compile.
"""
from __future__ import annotations

import yaml
from pathlib import Path

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

REPO_ROOT = Path(__file__).resolve().parent.parent


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
    assert "esphome" in parsed and parsed["esphome"]["name"] == "test1" and "on_boot" in parsed["esphome"]
    extracted = _section_body_from_value(full, "esphome")
    assert extracted.strip().startswith("name:"), extracted[:30]
    assert _section_body_from_value("  name: only", "esphome") == "  name: only"


def test_recipe_parse_and_full_block(jc1060_recipe_text):
    """Parse real recipe; esphome section becomes valid full block."""
    sections = _parse_recipe_into_sections(jc1060_recipe_text)
    assert "esphome" in sections
    body = sections["esphome"]
    assert body.strip().startswith("name:") or "name:" in body
    full = _section_full_block("esphome", body)
    parsed = yaml.safe_load(full)
    assert "esphome" in parsed and "name" in parsed["esphome"] and "on_boot" in parsed["esphome"]


def test_build_default_pieces(jc1060_recipe_text, default_project):
    """Default pieces are full blocks that parse."""
    project = dict(default_project)
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    pieces = _build_default_section_pieces(project, device=None, recipe_text=jc1060_recipe_text)
    assert "esphome" in pieces
    full = pieces["esphome"]
    assert full.strip().startswith("esphome:"), full[:50]
    parsed = yaml.safe_load(full)
    assert parsed["esphome"]["name"] == ETD_DEVICE_NAME_PLACEHOLDER or "test" in str(parsed["esphome"].get("name", ""))


def test_ensure_and_compile(jc1060_recipe_text, default_project):
    """Ensure project sections then compile; output is valid YAML with esphome first."""
    project = dict(default_project)
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    _ensure_project_sections(project, device=None, recipe_text=jc1060_recipe_text)
    sections = project.get("sections") or {}
    assert "esphome" in sections
    assert sections["esphome"].strip().startswith("esphome:"), sections["esphome"][:50]
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "esphome:" in out
    assert "name: \"test_device\"" in out or "name: 'test_device'" in out
    loader = yaml.SafeLoader
    def _tag(loader, node):
        return getattr(node, "value", str(node))
    yaml.add_constructor("!secret", _tag, loader)
    yaml.add_constructor("!lambda", _tag, loader)
    parsed = yaml.load(out, Loader=loader)
    assert "esphome" in parsed and parsed["esphome"]["name"] == "test_device"


def test_legacy_migration(jc1060_recipe_text):
    """Legacy body-only project.sections is migrated to full block."""
    project = {"sections": {"esphome": "  name: legacy\n  min_version: 2024.1.0"}}
    _ensure_project_sections(project, device=None, recipe_text=jc1060_recipe_text)
    full = project["sections"]["esphome"]
    assert full.strip().startswith("esphome:"), full[:50]
    parsed = yaml.safe_load(full)
    assert parsed["esphome"]["name"] in ("legacy", ETD_DEVICE_NAME_PLACEHOLDER)


def test_lvgl_widget_yaml_compiles(jc1060_recipe_text, default_project):
    """LVGL block (config + pages + widgets) compiles to valid YAML and parses correctly."""
    project = dict(default_project)
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["lvgl_config"] = {
        "main": {"disp_bg_color": "#0B0F14", "buffer_size": "100%"},
        "style_definitions": [], "theme": {}, "gradients": [], "top_layer": {"widgets": []},
    }
    project["pages"] = [{
        "page_id": "main", "name": "Main",
        "widgets": [{"id": "w1", "type": "label", "x": 10, "y": 20, "w": 200, "h": 30, "props": {"text": "Hello"}}],
    }]
    _ensure_project_sections(project, device=None, recipe_text=jc1060_recipe_text)
    device = DeviceProject(
        device_id="test", slug="test_device", name="Test",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600", api_key=None, project=project,
    )
    out = _compile_to_esphome_yaml_section_based(device, jc1060_recipe_text)
    assert "lvgl:" in out and "pages:" in out and "buffer_size:" in out
    loader = yaml.SafeLoader
    def _tag(loader, node):
        return getattr(node, "value", str(node))
    yaml.add_constructor("!secret", _tag, loader)
    yaml.add_constructor("!lambda", _tag, loader)
    parsed = yaml.load(out, Loader=loader)
    assert "lvgl" in parsed and "pages" in parsed["lvgl"]
    pages = parsed["lvgl"]["pages"]
    assert isinstance(pages, list) and len(pages) >= 1
    assert "widgets" in pages[0] and len(pages[0]["widgets"]) >= 1
    w = pages[0]["widgets"][0]
    assert w.get("type") == "label" or "label" in str(w)
