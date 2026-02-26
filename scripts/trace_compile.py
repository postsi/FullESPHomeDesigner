#!/usr/bin/env python3
"""Trace compile path with repo recipe to verify diagnosis."""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import unittest.mock as mock
for m in (
    "homeassistant",
    "homeassistant.core",
    "homeassistant.helpers",
    "homeassistant.helpers.storage",
    "homeassistant.components",
    "homeassistant.components.http",
    "homeassistant.config_entries",
):
    if m not in sys.modules:
        sys.modules[m] = mock.MagicMock()

from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api.views import (
    compile_to_esphome_yaml,
    _split_esphome_block,
    RECIPES_BUILTIN_DIR,
)

# Load recipe exactly as compiler does
recipe_path = RECIPES_BUILTIN_DIR / "guition_s3_4848s040_480x480.yaml"
recipe_text = recipe_path.read_text("utf-8")
# Minimal merged: recipe with pages marker replaced (structure unchanged)
merged = recipe_text.replace("#__LVGL_PAGES__", "pages: []")

esphome_block, rest = _split_esphome_block(merged)
print("_split_esphome_block result:")
print("  esphome_block is empty:", not esphome_block.strip())
print("  esphome_block first 120 chars:", repr(esphome_block[:120]) if esphome_block else "N/A")
print("  rest starts with:", repr(rest[:80]) if rest else "N/A")

# Full compile
dev = DeviceProject(
    device_id="x",
    slug="hallway",
    name="Hallway",
    hardware_recipe_id="guition_s3_4848s040_480x480",
    api_key="k",
    project=_default_project(),
)
out = compile_to_esphome_yaml(dev)
has_name = "esphome:" in out and "  name:" in out
idx = out.find("esphome:")
snippet = out[idx : idx + 120]
print("\nFull compile output snippet after first 'esphome:':")
print(repr(snippet))
print("\nHas '  name:' after esphome in output:", has_name)
