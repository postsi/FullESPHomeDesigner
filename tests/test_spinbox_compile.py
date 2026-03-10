"""
Spinbox compilation: native (single spinbox, no +/- buttons) and prebuilt with +/- buttons.
"""
from __future__ import annotations

from custom_components.esphome_touch_designer.storage import _default_project
from custom_components.esphome_touch_designer.api.views import compile_to_esphome_yaml


def make_device(project=None):
    from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
    proj = project if project is not None else _default_project()
    return DeviceProject(
        device_id="test",
        slug="test",
        name="Test",
        hardware_recipe_id="guition_s3_4848s040_480x480",
        api_key="dummy",
        project=proj,
    )


def test_native_spinbox_emits_no_buttons():
    """A single native spinbox must not have lvgl.spinbox.decrement/increment (no injected buttons)."""
    project = _default_project()
    project["pages"][0]["widgets"] = [
        {
            "id": "my_spinbox",
            "type": "spinbox",
            "x": 100, "y": 200, "w": 120, "h": 48,
            "props": {"value": 15, "range_from": 5, "range_to": 30, "decimal_places": 1},
            "style": {},
        }
    ]
    device = make_device(project)
    out = compile_to_esphome_yaml(device)
    assert "- spinbox:" in out and "id: my_spinbox" in out
    assert "lvgl.spinbox.decrement" not in out and "lvgl.spinbox.increment" not in out


def test_prebuilt_spinbox_with_buttons_emits_decrement_increment():
    """Prebuilt Spinbox with +/-: container with spinbox + two buttons; buttons have decrement/increment."""
    root_id, spin_id = "spinbox_grp_abc", "spinbox_xyz"
    minus_id, plus_id = "btn_minus_1", "btn_plus_1"
    project = _default_project()
    project["pages"][0]["widgets"] = [
        {"id": root_id, "type": "container", "x": 50, "y": 100, "w": 200, "h": 48, "props": {}, "style": {}},
        {"id": spin_id, "type": "spinbox", "parent_id": root_id, "x": 44, "y": 0, "w": 112, "h": 48,
         "props": {"value": 15, "range_from": 5, "range_to": 30, "decimal_places": 1}, "style": {"radius": 6}},
        {"id": minus_id, "type": "button", "parent_id": root_id, "x": 0, "y": 0, "w": 44, "h": 48,
         "props": {"text": "-"}, "style": {"radius": 6},
         "custom_events": {"on_click": f"then:\n  - lvgl.spinbox.decrement: {spin_id}"}},
        {"id": plus_id, "type": "button", "parent_id": root_id, "x": 156, "y": 0, "w": 44, "h": 48,
         "props": {"text": "+"}, "style": {"radius": 6},
         "custom_events": {"on_click": f"then:\n  - lvgl.spinbox.increment: {spin_id}"}},
    ]
    device = make_device(project)
    out = compile_to_esphome_yaml(device)
    assert "lvgl.spinbox.decrement" in out and "lvgl.spinbox.increment" in out
    assert "- spinbox:" in out and spin_id in out
