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

    # Must have name in the esphome section (before esp32:)
    before_esp32 = out.split("esp32:")[0]
    if "  name:" not in before_esp32 or "hallway" not in before_esp32:
        print("FAIL: esphome section (before esp32:) should contain '  name: \"hallway\"'")
        print("Got (first 600 chars):", repr(out[:600]))
        sys.exit(1)
    # Should not have two top-level "esphome:" (which would mean second overwrites first)
    if out.strip().count("\nesphome:") >= 1 and out.strip().startswith("esphome:"):
        # One at start is fine
        pass
    # Count top-level esphome: (line that starts with esphome: or \n followed by esphome:)
    top_level_esphome = len(re.findall(r"(?:^|\n)esphome:\s*$", out, re.MULTILINE))
    if top_level_esphome > 1:
        print("FAIL: duplicate top-level esphome: (second would overwrite first)")
        sys.exit(1)
    print("OK: split-fail path produces single esphome block with name")
    print("Preview:", out[:500].replace("\n", " ")[:200], "...")


if __name__ == "__main__":
    main()
