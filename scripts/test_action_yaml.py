#!/usr/bin/env python3
"""
Test action YAML: widget preview event_snippets (auto/edited/empty) and compile uses stored override.
Run from repo root: python scripts/test_action_yaml.py
"""
from __future__ import annotations

import sys
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
    _preview_widget_yaml,
    _compile_to_esphome_yaml_section_based,
    _parse_yaml_syntax,
)
from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project


def test_preview_event_snippets_auto():
    """With action_binding and no yaml_override, event_snippets has source 'auto' and generated yaml."""
    project = dict(_default_project())
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [
                {"id": "btn1", "type": "button", "x": 0, "y": 0, "w": 100, "h": 40, "props": {"text": "Tap"}},
            ],
        }
    ]
    project["action_bindings"] = [
        {
            "widget_id": "btn1",
            "event": "on_click",
            "call": {"domain": "light", "service": "toggle", "entity_id": "light.living", "data": {"entity_id": "light.living"}},
        },
    ]
    result = _preview_widget_yaml(project, "btn1", 0)
    assert result is not None
    yaml_str, event_snippets = result
    assert "on_click" in event_snippets
    sn = event_snippets["on_click"]
    assert sn.get("source") == "auto"
    assert isinstance(sn.get("yaml"), str) and len(sn["yaml"].strip()) > 0
    assert "light" in sn["yaml"] or "toggle" in sn["yaml"] or "homeassistant" in sn["yaml"].lower()
    print("  preview event_snippets auto: OK")


def test_preview_event_snippets_edited():
    """With yaml_override set, event_snippets has source 'edited' and yaml equals override."""
    project = dict(_default_project())
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [
                {"id": "btn1", "type": "button", "x": 0, "y": 0, "w": 100, "h": 40, "props": {"text": "Tap"}},
            ],
        }
    ]
    custom_yaml = "then:\n  - logger.log: custom_action"
    project["action_bindings"] = [
        {
            "widget_id": "btn1",
            "event": "on_click",
            "call": {"domain": "light", "service": "toggle", "entity_id": "light.living", "data": {}},
            "yaml_override": custom_yaml,
        },
    ]
    result = _preview_widget_yaml(project, "btn1", 0)
    assert result is not None
    _, event_snippets = result
    assert event_snippets.get("on_click", {}).get("source") == "edited"
    assert "logger.log" in event_snippets.get("on_click", {}).get("yaml", "")
    assert "custom_action" in event_snippets.get("on_click", {}).get("yaml", "")
    print("  preview event_snippets edited: OK")


def test_preview_event_snippets_empty():
    """Event with no binding has source 'empty' and empty yaml."""
    project = dict(_default_project())
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [
                {"id": "btn1", "type": "button", "x": 0, "y": 0, "w": 100, "h": 40, "props": {"text": "Tap"}},
            ],
        }
    ]
    project["action_bindings"] = []
    result = _preview_widget_yaml(project, "btn1", 0)
    assert result is not None
    _, event_snippets = result
    assert event_snippets.get("on_click", {}).get("source") == "empty"
    assert (event_snippets.get("on_click", {}).get("yaml") or "").strip() == ""
    print("  preview event_snippets empty: OK")


def test_parse_widget_yaml_with_lambda_and_secret():
    """Widget action YAML with !lambda, !secret, and comments parses successfully."""
    yaml_with_lambda = """then:
  # Test 2
  - lambda: id(etd_ui_lock_until) = millis() + 500;
  - delay: 150ms
  - homeassistant.action:
      action: climate.set_temperature
      data:
        entity_id: "climate.grimwood_all_thermostats"
        temperature: !lambda return (float)x;
"""
    _parse_yaml_syntax(yaml_with_lambda)
    print("  parse widget YAML (!lambda + comment): OK")

    yaml_with_secret = """then:
  - homeassistant.service:
      service: light.turn_on
      data:
        entity_id: !secret light_id
        brightness: 128
"""
    _parse_yaml_syntax(yaml_with_secret)
    print("  parse widget YAML (!secret): OK")


def test_compile_uses_stored_override():
    """Full compile uses yaml_override for the widget event (stored block in output)."""
    recipe_path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    recipe_text = recipe_path.read_text("utf-8")
    project = dict(_default_project())
    project.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    project["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [
                {"id": "btn1", "type": "button", "x": 10, "y": 20, "w": 120, "h": 50, "props": {"text": "Tap"}},
            ],
        }
    ]
    project["action_bindings"] = [
        {
            "widget_id": "btn1",
            "event": "on_click",
            "call": {"domain": "light", "service": "toggle", "entity_id": "light.room", "data": {}},
            "yaml_override": "then:\n  - logger.log: stored_override_used",
        },
    ]
    from custom_components.esphome_touch_designer.api.views import _ensure_project_sections
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
    assert "lvgl:" in out
    assert "stored_override_used" in out
    assert "logger.log" in out
    print("  compile uses stored override: OK")


def main():
    print("Testing action YAML (preview + compile + parse)...")
    try:
        test_parse_widget_yaml_with_lambda_and_secret()
        test_preview_event_snippets_auto()
        test_preview_event_snippets_edited()
        test_preview_event_snippets_empty()
        test_compile_uses_stored_override()
        print("\nAll action YAML tests passed.")
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
