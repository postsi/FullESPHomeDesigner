"""
Pure compiler/recipe helpers: no HA, no device. Maximize coverage of small, testable functions.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from custom_components.esphome_touch_designer.api.views import (
    _safe_id,
    _slugify_entity_id,
    _esphome_safe_page_id,
    _hex_color_for_yaml,
    _yaml_quote,
    _split_esphome_block,
    _section_full_block,
    _section_body_from_value,
    _validate_recipe_text,
    _extract_recipe_metadata_from_text,
    _extract_recipe_metadata,
    _read_recipe_file,
    _default_wifi_yaml,
    _default_logger_yaml,
)


# --- _safe_id ---
def test_safe_id_alphanumeric_unchanged():
    assert _safe_id("abc123") == "abc123"
    assert _safe_id("widget_1") == "widget_1"


def test_safe_id_replaces_invalid():
    assert _safe_id("light.kitchen") == "light_kitchen"
    assert _safe_id("a-b-c") == "a_b_c"


# --- _slugify_entity_id ---
def test_slugify_entity_id():
    assert _slugify_entity_id("light.living_room") == "light_living_room"
    assert _slugify_entity_id("sensor.foo") == "sensor_foo"
    assert _slugify_entity_id("") == "entity"


# --- _esphome_safe_page_id ---
def test_esphome_safe_page_id_main():
    assert _esphome_safe_page_id("main") == "main_page"
    assert _esphome_safe_page_id("main_page") == "main_page"


def test_esphome_safe_page_id_other():
    assert _esphome_safe_page_id("settings") == "settings"
    assert _esphome_safe_page_id("") == "main_page"


# --- _hex_color_for_yaml ---
def test_hex_color_for_yaml_6digit():
    assert _hex_color_for_yaml("#FF0000") == 0xFF0000
    assert _hex_color_for_yaml("#00FF00") == 0x00FF00
    assert _hex_color_for_yaml("#0000FF") == 0x0000FF
    assert _hex_color_for_yaml("#ffffff") == 0xFFFFFF


def test_hex_color_for_yaml_3digit():
    assert _hex_color_for_yaml("#f00") == 0xFF0000
    assert _hex_color_for_yaml("#0f0") == 0x00FF00


def test_hex_color_for_yaml_passthrough():
    assert _hex_color_for_yaml(12345) == 12345
    assert _hex_color_for_yaml("not_a_hex") == "not_a_hex"


# --- _yaml_quote ---
def test_yaml_quote_string():
    assert _yaml_quote("hello") == '"hello"'
    assert '"' in _yaml_quote("x")


def test_yaml_quote_bool():
    assert _yaml_quote(True) == "true"
    assert _yaml_quote(False) == "false"


# --- _split_esphome_block ---
def test_split_esphome_block_normal():
    text = "esphome:\n  name: x\n  min_version: 2024.1\n\nesp32:\n  variant: esp32s3\n"
    block, rest = _split_esphome_block(text)
    assert block.strip().startswith("esphome:")
    assert "name: x" in block
    assert "esp32:" in rest


def test_split_esphome_block_no_esphome():
    text = "esp32:\n  variant: esp32s3\n"
    block, rest = _split_esphome_block(text)
    assert block == ""
    assert rest == text  # returns recipe_text unchanged when no esphome block


def test_split_esphome_block_leading_whitespace():
    text = "  esphome:\n  name: x\n\nesp32:\n"
    block, rest = _split_esphome_block(text)
    assert "esphome:" in block
    assert "esp32:" in rest


# --- _section_full_block / _section_body_from_value ---
def test_section_body_from_value_roundtrip():
    body = "  name: test\n  min_version: 2024.1\n"
    full = _section_full_block("esphome", body)
    extracted = _section_body_from_value(full, "esphome")
    assert "name:" in extracted
    assert "test" in extracted


# --- _validate_recipe_text ---
def test_validate_recipe_text_missing_lvgl():
    issues = _validate_recipe_text("esp32:\n  variant: esp32s3\n")
    assert any("lvgl" in i.lower() for i in issues)


def test_validate_recipe_text_valid_minimal():
    text = "esphome:\n  name: x\nlvgl:\n  #__LVGL_PAGES__\npages: []\ndisplay:\n  - platform: ...\ntouchscreen:\n  - platform: ...\n"
    issues = _validate_recipe_text(text)
    assert not any("lvgl" in i.lower() for i in issues) or "pages" in text


def test_validate_recipe_text_invalid_yaml():
    issues = _validate_recipe_text("esphome:\n  name: [\n")
    assert any("parse" in i.lower() or "yaml" in i.lower() for i in issues)


# --- _extract_recipe_metadata / _extract_recipe_metadata_from_text ---
def test_extract_recipe_metadata_from_text_resolution_from_id():
    meta = _extract_recipe_metadata_from_text("esphome:\n  name: x\n", recipe_id="jc1060p470_esp32p4_1024x600")
    assert meta.get("resolution") == {"width": 1024, "height": 600}


def test_extract_recipe_metadata_from_text_psram():
    meta = _extract_recipe_metadata_from_text("psram:\n  type: quad\n", recipe_id=None)
    assert meta.get("psram") is True


def test_extract_recipe_metadata_from_yaml():
    text = """
esphome:
  name: test
esp32:
  board: esp32-s3-devkitc-1
display:
  - platform: ...
    width: 800
    height: 480
touchscreen:
  - platform: ...
"""
    meta = _extract_recipe_metadata_from_text(text, recipe_id=None)
    assert isinstance(meta.get("resolution"), dict)
    assert meta["resolution"].get("width") == 800
    assert meta["resolution"].get("height") == 480


def test_extract_recipe_metadata_model():
    model = {
        "esphome": {"name": "my_device"},
        "esp32": {"board": "esp32-s3-devkitc-1"},
        "display": [{"width": 320, "height": 240}],
    }
    meta = _extract_recipe_metadata(model, "display:\n  width: 320\n  height: 240\n", label="Test")
    assert meta.get("resolution") == {"width": 320, "height": 240}
    assert meta.get("project_name") == "my_device"
    assert meta.get("board") == "esp32-s3-devkitc-1"


# --- _read_recipe_file ---
def test_read_recipe_file():
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False, encoding="utf-8") as f:
        f.write("esphome:\n  name: from_file\n")
        path = Path(f.name)
    try:
        content = _read_recipe_file(path)
        assert "esphome:" in content
        assert "from_file" in content
    finally:
        path.unlink(missing_ok=True)


# --- _default_wifi_yaml / _default_logger_yaml ---
def test_default_wifi_yaml_contains_expected():
    y = _default_wifi_yaml()
    assert "wifi:" in y
    assert "ssid" in y or "networks" in y


def test_default_logger_yaml_contains_logger():
    y = _default_logger_yaml()
    assert "logger:" in y
