"""
Compile coverage: multiple widget types and HA display bindings (label_text, arc_value, bar_value, widget_checked).

Ensures _emit_widget_from_schema and _compile_ha_bindings branches are exercised without HA deployment.
"""
from __future__ import annotations

from custom_components.esphome_touch_designer.storage import _default_project
from custom_components.esphome_touch_designer.api.views import compile_to_esphome_yaml


def _minimal_project_with_widget(widget: dict) -> dict:
    proj = _default_project()
    proj["pages"] = [{"page_id": "main", "name": "Main", "widgets": [widget]}]
    proj.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    return proj


def _minimal_widget(wid: str, wtype: str, **kwargs) -> dict:
    d = {"id": wid, "type": wtype, "x": 0, "y": 0, "w": 100, "h": 40, "props": kwargs.get("props", {}), "style": {}}
    if kwargs:
        d.update({k: v for k, v in kwargs.items() if k != "props" and k in ("props", "style", "custom_events")})
    return d


def test_compile_label(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("l1", "label", props={"text": "Hi"}))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- label:" in out or "label:" in out
    assert "id: l1" in out


def test_compile_button(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("b1", "button", props={"text": "Tap"}))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- button:" in out or "button:" in out
    assert "id: b1" in out


def test_compile_switch(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("sw1", "switch"))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- switch:" in out or "switch:" in out
    assert "id: sw1" in out


def test_compile_slider(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("sl1", "slider", props={"value": 50, "range_from": 0, "range_to": 100}))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- slider:" in out or "slider:" in out
    assert "id: sl1" in out


def test_compile_bar(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("bar1", "bar", props={"value": 60, "range_from": 0, "range_to": 100}))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- bar:" in out or "bar:" in out
    assert "id: bar1" in out


def test_compile_arc(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("a1", "arc", props={"value": 50, "range_from": 0, "range_to": 100}))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- arc:" in out or "arc:" in out
    assert "id: a1" in out


def test_compile_dropdown(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("dd1", "dropdown", props={"options": "A\nB\nC"}))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- dropdown:" in out or "dropdown:" in out
    assert "id: dd1" in out


def test_compile_binding_label_text(jc1060_recipe_text, make_device):
    """Display binding label_text: sensor + lvgl.label.update (or button.update) in output."""
    proj = _minimal_project_with_widget(_minimal_widget("l1", "label", props={"text": "Hi"}))
    proj["bindings"] = [{"entity_id": "sensor.temp", "kind": "state", "attribute": ""}]
    proj["links"] = [{
        "source": {"entity_id": "sensor.temp", "kind": "state", "attribute": ""},
        "target": {"widget_id": "l1", "action": "label_text"},
    }]
    proj.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "platform: homeassistant" in out
    assert "sensor.temp" in out
    assert "lvgl.label.update" in out or "lvgl.button.update" in out


def test_compile_binding_arc_value(jc1060_recipe_text, make_device):
    """Display binding arc_value: sensor + lvgl.arc.update in output."""
    proj = _minimal_project_with_widget(_minimal_widget("a1", "arc", props={"value": 50, "range_from": 0, "range_to": 100}))
    proj["bindings"] = [{"entity_id": "sensor.humidity", "kind": "attribute_number", "attribute": "humidity"}]
    proj["links"] = [{
        "source": {"entity_id": "sensor.humidity", "kind": "attribute_number", "attribute": "humidity"},
        "target": {"widget_id": "a1", "action": "arc_value"},
    }]
    proj.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "platform: homeassistant" in out
    assert "lvgl.arc.update" in out
    assert "id: a1" in out


def test_compile_binding_bar_value(jc1060_recipe_text, make_device):
    """Display binding bar_value: sensor + lvgl.bar.update in output."""
    proj = _minimal_project_with_widget(_minimal_widget("bar1", "bar", props={"value": 0, "range_from": 0, "range_to": 100}))
    proj["bindings"] = [{"entity_id": "light.desk", "kind": "attribute_number", "attribute": "brightness"}]
    proj["links"] = [{
        "source": {"entity_id": "light.desk", "kind": "attribute_number", "attribute": "brightness"},
        "target": {"widget_id": "bar1", "action": "bar_value", "scale": 0.392},  # 0-255 -> 0-100
    }]
    proj.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "platform: homeassistant" in out
    assert "lvgl.bar.update" in out
    assert "id: bar1" in out


def test_compile_binding_widget_checked(jc1060_recipe_text, make_device):
    """Display binding widget_checked: binary_sensor + lvgl.switch.update (or similar) in output."""
    proj = _minimal_project_with_widget(_minimal_widget("sw1", "switch"))
    proj["bindings"] = [{"entity_id": "switch.plug", "kind": "binary", "attribute": ""}]
    proj["links"] = [{
        "source": {"entity_id": "switch.plug", "kind": "binary", "attribute": ""},
        "target": {"widget_id": "sw1", "action": "widget_checked"},
    }]
    proj.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "platform: homeassistant" in out or "binary_sensor:" in out
    assert "lvgl.switch.update" in out or "switch" in out
    assert "id: sw1" in out


def test_compile_led(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("led1", "led"))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- led:" in out or "led:" in out
    assert "id: led1" in out


def test_compile_checkbox(jc1060_recipe_text, make_device):
    proj = _minimal_project_with_widget(_minimal_widget("ch1", "checkbox"))
    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="t")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "- checkbox:" in out or "checkbox:" in out
    assert "id: ch1" in out
