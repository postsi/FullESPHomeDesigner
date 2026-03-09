#!/usr/bin/env python3
"""
Test harness for spinbox compilation:
- Native (Std LVGL) spinbox: emits a single spinbox, no injected +/- buttons.
- Spinbox with +/- prebuilt: container with spinbox + two buttons that call
  lvgl.spinbox.decrement / lvgl.spinbox.increment on the spinbox id.
Run from repo root: python scripts/test_spinbox_compile.py
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

from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api.views import compile_to_esphome_yaml


def make_device(project: dict | None = None) -> DeviceProject:
    proj = project if project is not None else _default_project()
    return DeviceProject(
        device_id="test",
        slug="test",
        name="Test",
        hardware_recipe_id="guition_s3_4848s040_480x480",
        api_key="dummy",
        project=proj,
    )


def test_native_spinbox_emits_no_buttons() -> bool:
    """A single native spinbox on the page must not have lvgl.spinbox.decrement/increment (no injected buttons)."""
    project = _default_project()
    project["pages"][0]["widgets"] = [
        {
            "id": "my_spinbox",
            "type": "spinbox",
            "x": 100,
            "y": 200,
            "w": 120,
            "h": 48,
            "props": {
                "value": 15,
                "range_from": 5,
                "range_to": 30,
                "decimal_places": 1,
            },
            "style": {},
        }
    ]
    device = make_device(project)
    out = compile_to_esphome_yaml(device)
    if "- spinbox:" not in out or "id: my_spinbox" not in out:
        print("FAIL: native spinbox test expected '- spinbox:' and 'id: my_spinbox' in output")
        return False
    if "lvgl.spinbox.decrement" in out or "lvgl.spinbox.increment" in out:
        print("FAIL: native spinbox test must not emit decrement/increment (no injected buttons)")
        return False
    print("PASS: native spinbox emits single spinbox, no +/- actions")
    return True


def test_prebuilt_spinbox_with_buttons_emits_decrement_increment() -> bool:
    """Prebuilt 'Spinbox with +/-' structure: container with spinbox + two buttons; buttons have on_click with decrement/increment."""
    root_id = "spinbox_grp_abc"
    spin_id = "spinbox_xyz"
    minus_id = "btn_minus_1"
    plus_id = "btn_plus_1"
    project = _default_project()
    project["pages"][0]["widgets"] = [
        {
            "id": root_id,
            "type": "container",
            "x": 50,
            "y": 100,
            "w": 200,
            "h": 48,
            "props": {},
            "style": {},
        },
        {
            "id": spin_id,
            "type": "spinbox",
            "parent_id": root_id,
            "x": 44,
            "y": 0,
            "w": 112,
            "h": 48,
            "props": {"value": 15, "range_from": 5, "range_to": 30, "decimal_places": 1},
            "style": {"radius": 6},
        },
        {
            "id": minus_id,
            "type": "button",
            "parent_id": root_id,
            "x": 0,
            "y": 0,
            "w": 44,
            "h": 48,
            "props": {"text": "-"},
            "style": {"radius": 6},
            "custom_events": {"on_click": f"then:\n  - lvgl.spinbox.decrement: {spin_id}"},
        },
        {
            "id": plus_id,
            "type": "button",
            "parent_id": root_id,
            "x": 156,
            "y": 0,
            "w": 44,
            "h": 48,
            "props": {"text": "+"},
            "style": {"radius": 6},
            "custom_events": {"on_click": f"then:\n  - lvgl.spinbox.increment: {spin_id}"},
        },
    ]
    device = make_device(project)
    out = compile_to_esphome_yaml(device)
    if "lvgl.spinbox.decrement" not in out:
        print("FAIL: prebuilt spinbox test expected 'lvgl.spinbox.decrement' in output")
        return False
    if "lvgl.spinbox.increment" not in out:
        print("FAIL: prebuilt spinbox test expected 'lvgl.spinbox.increment' in output")
        return False
    if "- spinbox:" not in out or spin_id not in out:
        print("FAIL: prebuilt spinbox test expected spinbox widget with correct id in output")
        return False
    print("PASS: prebuilt spinbox+buttons emits decrement and increment actions")
    return True


def main() -> int:
    print("Spinbox compile test harness\n")
    ok = True
    ok &= test_native_spinbox_emits_no_buttons()
    ok &= test_prebuilt_spinbox_with_buttons_emits_decrement_increment()
    print("\n" + ("All spinbox tests passed." if ok else "Some tests failed."))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
