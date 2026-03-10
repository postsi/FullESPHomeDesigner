"""
Tests for storage module: _default_project and _migrate_project.

No Home Assistant server required; these are pure data-shape and migration logic.
"""
from __future__ import annotations

import pytest


def test_default_project_has_required_keys():
    """_default_project returns dict with model_version, pages, palette, lvgl_config."""
    from custom_components.esphome_touch_designer.storage import _default_project

    proj = _default_project()
    assert proj["model_version"] == 1
    assert isinstance(proj["pages"], list) and len(proj["pages"]) >= 1
    assert proj["pages"][0].get("page_id") == "main"
    assert isinstance(proj["palette"], dict)
    assert "color.bg" in proj["palette"] or "color" in str(proj["palette"])
    assert isinstance(proj["lvgl_config"], dict)
    assert "main" in proj["lvgl_config"]
    assert isinstance(proj["lvgl_config"].get("style_definitions"), list)
    assert isinstance(proj["lvgl_config"].get("theme"), dict)
    assert "top_layer" in proj["lvgl_config"]


def test_migrate_project_none_returns_default():
    """_migrate_project(None) returns default project."""
    from custom_components.esphome_touch_designer.storage import _default_project, _migrate_project

    out = _migrate_project(None)
    assert out == _default_project()


def test_migrate_project_not_dict_returns_default():
    """_migrate_project(not a dict) returns default project."""
    from custom_components.esphome_touch_designer.storage import _default_project, _migrate_project

    assert _migrate_project([]) == _default_project()
    assert _migrate_project("x") == _default_project()


def test_migrate_project_adds_model_version():
    """_migrate_project adds model_version if missing."""
    from custom_components.esphome_touch_designer.storage import _migrate_project

    proj = {"pages": [{"page_id": "main", "name": "Main", "widgets": []}]}
    out = _migrate_project(proj)
    assert out["model_version"] == 1


def test_migrate_project_fixes_empty_pages():
    """_migrate_project replaces empty or non-list pages with default pages."""
    from custom_components.esphome_touch_designer.storage import _default_project, _migrate_project

    proj = {"model_version": 1, "pages": []}
    out = _migrate_project(proj)
    assert isinstance(out["pages"], list) and len(out["pages"]) >= 1
    assert out["pages"][0]["page_id"] == "main"

    proj2 = {"model_version": 1, "pages": "not a list"}
    out2 = _migrate_project(proj2)
    assert isinstance(out2["pages"], list) and len(out2["pages"]) >= 1


def test_migrate_project_fixes_lvgl_config():
    """_migrate_project ensures lvgl_config has main, style_definitions, theme, gradients, top_layer."""
    from custom_components.esphome_touch_designer.storage import _migrate_project

    proj = {"model_version": 1, "pages": [{"page_id": "main", "name": "Main", "widgets": []}], "lvgl_config": {}}
    out = _migrate_project(proj)
    lc = out["lvgl_config"]
    assert isinstance(lc.get("main"), dict)
    assert isinstance(lc.get("style_definitions"), list)
    assert isinstance(lc.get("theme"), dict)
    assert isinstance(lc.get("gradients"), list)
    assert isinstance(lc.get("top_layer"), dict) and "widgets" in lc["top_layer"]


def test_migrate_project_preserves_unknown_fields():
    """_migrate_project preserves keys not part of the known schema."""
    from custom_components.esphome_touch_designer.storage import _migrate_project

    proj = {"model_version": 1, "pages": [{"page_id": "main", "name": "Main", "widgets": []}], "custom_key": "keep"}
    out = _migrate_project(proj)
    assert out.get("custom_key") == "keep"
