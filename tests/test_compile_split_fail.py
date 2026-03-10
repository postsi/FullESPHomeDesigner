"""Test the 'split failed' path: recipe has 'esphome:' not at column 0 (e.g. leading space)."""
from __future__ import annotations

import re
from unittest import mock
from pathlib import Path

from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api import views

REPO_ROOT = Path(__file__).resolve().parent.parent

FAKE_RECIPE = """# comment
 esphome:
  min_version: 2024.11.0
  project:
    name: X
esp32:
  variant: esp32s3
"""


def test_compile_split_fail_produces_valid_output():
    """When recipe has leading space before 'esphome:', compile still produces non-empty valid output."""
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

    assert out and out.strip(), "compile should produce non-empty output"
    top_level_esphome = len(re.findall(r"(?:^|\n)esphome:\s*$", out, re.MULTILINE))
    assert top_level_esphome <= 1, "duplicate top-level esphome: (second would overwrite first)"
    # When recipe has leading space before 'esphome:', name injection may vary; we only require valid output shape
