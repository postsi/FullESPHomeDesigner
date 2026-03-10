"""
Shared pytest configuration and fixtures for ESPHome Touch Designer tests.

Mocks Home Assistant so the integration can be imported without a running HA server.
All backend tests run against compiler/storage logic only; no deployment required.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Repo root: parent of tests/
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Mock Home Assistant before any integration import
import unittest.mock as mock  # noqa: E402

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


@pytest.fixture
def default_project():
    """Default project dict (one page, empty widgets)."""
    from custom_components.esphome_touch_designer.storage import _default_project
    return _default_project()


@pytest.fixture
def jc1060_recipe_text():
    """Full text of the jc1060 builtin recipe."""
    path = REPO_ROOT / "custom_components/esphome_touch_designer/recipes/builtin/jc1060p470_esp32p4_1024x600.yaml"
    return path.read_text("utf-8")


@pytest.fixture
def make_device(default_project):
    """Factory for DeviceProject with optional overrides."""

    def _make(
        device_id: str = "hallway",
        slug: str = "hallway",
        name: str = "Hallway",
        recipe_id: str = "guition_s3_4848s040_480x480",
        api_key: str | None = "k3NlzHoGkcmsMq0rxB8DUjwfTC+1MzeJFVoCgQd12IA=",
        project: dict | None = None,
    ):
        from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
        return DeviceProject(
            device_id=device_id,
            slug=slug,
            name=name,
            hardware_recipe_id=recipe_id,
            api_key=api_key,
            project=project if project is not None else _default_project(),
        )

    return _make


@pytest.fixture
def repo_root():
    """Repo root path (same as REPO_ROOT in conftest)."""
    return REPO_ROOT
