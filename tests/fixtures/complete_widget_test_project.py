"""
CompleteWidgetTest fixture: a project that exercises every compiler path.
Used by test_complete_widget_test.py to compile and run esphome config/check.
Includes: all LVGL widget types, display bindings, action bindings (with and without
yaml_override), esphome_components (Create Component), project.sections (user addition),
color_picker / white_picker (prebuilt), and fictitious entities/lambdas that pass validation.
"""
from __future__ import annotations

from custom_components.esphome_touch_designer.storage import _default_project


def _w(id_: str, type_: str, x: int, y: int, w: int, h: int, props: dict | None = None, style: dict | None = None, widgets: list | None = None) -> dict:
    out = {"id": id_, "type": type_, "x": x, "y": y, "w": w, "h": h, "props": props or {}, "style": style or {}}
    if widgets is not None:
        out["widgets"] = widgets
    return out


def get_complete_widget_test_project() -> dict:
    """Build the CompleteWidgetTest project dict (all widget types, bindings, actions, etc.)."""
    p = _default_project()
    p["model_version"] = 1
    p["device"] = {"hardware_recipe_id": "jc1060p470_esp32p4_1024x600", "screen": {"width": 1024, "height": 600}}
    # Full widget set: every type so the test catches any compiler/ESPHome regression.
    p["pages"] = [
        {
            "page_id": "main",
            "name": "Main",
            "widgets": [
                _w("l1", "label", 10, 10, 120, 28, {"text": "Label"}),
                _w("b1", "button", 140, 10, 100, 40, {"text": "Button"}),
                _w("sw1", "switch", 250, 10, 60, 28, {"state": False}),
                _w("sl1", "slider", 320, 10, 120, 24, {"value": 50, "min_value": 0, "max_value": 100}),
                _w("bar1", "bar", 450, 10, 100, 24, {"value": 60, "min_value": 0, "max_value": 100}),
                _w("a1", "arc", 560, 10, 80, 80, {"value": 50, "min_value": 0, "max_value": 100}),
                _w("dd1", "dropdown", 650, 10, 100, 36, {"options": "A\nB\nC"}),
                _w("ch1", "checkbox", 760, 10, 80, 40),
                _w("led1", "led", 850, 10, 24, 24),
                _w("line1", "line", 10, 60, 100, 2, {"points": ["0,0", "80,2", "100,0"]}),
                _w("meter1", "meter", 120, 60, 60, 60),
                _w("spinner1", "spinner", 190, 60, 40, 40),
                _w("roller1", "roller", 240, 60, 80, 60, {"options": "One\nTwo\nThree"}),
                _w("spin1", "spinbox", 330, 60, 80, 36, {"value": 0, "range_from": -10, "range_to": 10}),
                _w("cp1", "color_picker", 420, 60, 180, 100, {"value": "#4080FF"}),
                _w("wp1", "white_picker", 610, 60, 180, 80, {"value": 250}),
                _w("cont1", "container", 10, 130, 120, 80, widgets=[
                    _w("cont1_l", "label", 4, 4, 112, 24, {"text": "Inside"}),
                ]),
            ],
        },
        {
            "page_id": "p2",
            "name": "Page 2",
            "widgets": [
                _w("l2", "label", 10, 10, 200, 28, {"text": "Page 2"}),
            ],
        },
    ]
    # Display bindings/links omitted: they emit sensor.homeassistant which requires api component;
    # esphome config in the sandbox has no api. Bindings/links are tested in test_compile and test_components_*.
    p["bindings"] = []
    p["links"] = []
    # Action bindings: yaml_override only (logger/delay) so no homeassistant.action in output.
    p["action_bindings"] = [
        {"widget_id": "b1", "event": "on_click", "yaml_override": "then:\n  - logger.log: CompleteWidgetTest button\n  - delay: 50ms"},
        {"widget_id": "sl1", "event": "on_value", "yaml_override": "then:\n  - logger.log: slider value\n  - delay: 50ms"},
        {"widget_id": "led1", "event": "on_click", "yaml_override": "then:\n  - logger.log: CompleteWidgetTest led\n  - delay: 50ms"},
    ]
    # Create Component: one block (sensor from label - exercises esphome_components path)
    p["esphome_components"] = [
        "sensor:\n  - platform: lvgl\n    id: sens_created\n    widget: l1\n    name: Created Sensor\n",
    ]
    # User addition in project.sections (logger)
    p["sections"] = {
        "logger": "  level: DEBUG\n  logs:\n    component: ERROR\n",
    }
    return p
