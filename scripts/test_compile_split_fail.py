#!/usr/bin/env python3
"""Test the 'split failed' path: recipe has 'esphome:' not at column 0 (e.g. leading space)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import unittest.mock as mock
for mod in (
    "homeassistant",
    "homeassistant.core",
    "homeassistant.helpers",
    "homeassistant.helpers.storage",
    "homeassistant.components",
    "homeassistant.components.http",
    "homeassistant.config_entries",
):
    if mod not in sys.modules:
        sys.modules[mod] = mock.MagicMock()

from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api import views

# Recipe with leading space before "esphome:" so _split_esphome_block returns ("", full_text)
FAKE_RECIPE = """# comment
 esphome:
  min_version: 2024.11.0
  project:
    name: X
esp32:
  variant: esp32s3
"""


def main() -> None:
    RECIPES_DIR = views.RECIPES_BUILTIN_DIR
    real_read = Path.read_text

    def patched_read(self, *a, **k):
        if self.parent == RECIPES_DIR and self.suffix == ".yaml":
            return FAKE_RECIPE
        return real_read(self, *a, **k)

    with mock.patch.object(Path, "read_text", patched_read):
        dev = DeviceProject(
            device_id="x",
            slug="hallway",
            name="Hallway",
            hardware_recipe_id="guition_s3_4848s040_480x480",
            api_key=None,
            project=_default_project(),
        )
        out = views.compile_to_esphome_yaml(dev)

    # When recipe has leading space before "esphome:", split may fail; output should still be valid (non-empty, no duplicate esphome)
    if not out or not out.strip():
        print("FAIL: compile should produce non-empty output")
        sys.exit(1)
    # Count top-level esphome: (line that starts with esphome: or \n followed by esphome:)
    top_level_esphome = len(re.findall(r"(?:^|\n)esphome:\s*$", out, re.MULTILINE))
    if top_level_esphome > 1:
        print("FAIL: duplicate top-level esphome: (second would overwrite first)")
        sys.exit(1)
    # Prefer: esphome section with device name before esp32 (best-effort when recipe is malformed)
    before_esp32 = out.split("esp32:")[0]
    if "  name:" in before_esp32 and "hallway" in before_esp32:
        print("OK: split-fail path produces esphome block with name")
    else:
        print("OK: split-fail path produces valid output (name injection may vary)")
    print("Preview:", out[:500].replace("\n", " ")[:200], "...")


if __name__ == "__main__":
    main()
