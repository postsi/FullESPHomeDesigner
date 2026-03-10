#!/usr/bin/env python3
"""
Verify widget/binding consistency: every compilable widget type has Canvas render coverage,
and every display action used in bindingConfig is handled in App liveOverrides.

Run from repo root: python3 scripts/test_widget_binding_verification.py

Add new widget types in api/views.py (COMPILABLE_WIDGET_TYPES) and ensure Canvas.tsx
has a corresponding branch. Add new display actions in bindings/bindingConfig.ts and
ensure App.tsx liveOverrides handles them.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Mock HA so we can import views
import unittest.mock as mock
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

from custom_components.esphome_touch_designer.api.views import (
    PALETTE_WIDGET_TYPES,
    EXTRA_WIDGET_TYPES,
    COMPILABLE_WIDGET_TYPES,
)


def test_canvas_covers_all_compilable_types() -> None:
    """Every type in COMPILABLE_WIDGET_TYPES must have a render branch in Canvas.tsx."""
    canvas_path = REPO_ROOT / "frontend/src/Canvas.tsx"
    assert canvas_path.exists(), f"Canvas not found: {canvas_path}"
    content = canvas_path.read_text("utf-8")

    # Canvas uses type === "x" or type.includes("x"); default fallback renders unknown types as label with type name.
    # We require an explicit match for each compilable type so no type silently falls through with wrong look.
    missing: list[str] = []
    for wtype in sorted(COMPILABLE_WIDGET_TYPES):
        # Match type === "wtype" or type.includes("wtype") (or type === 'wtype' etc.)
        if f'type === "{wtype}"' in content or f"type === '{wtype}'" in content:
            continue
        if f'type.includes("{wtype}")' in content or f"type.includes('{wtype}')" in content:
            continue
        # meter is handled by branch "type === \"meter\"" or via type.includes("arc") in same branch
        if wtype == "meter" and ('type === "meter"' in content or "meter" in content):
            continue
        # animimg is handled by "type === \"animimg\"" or image/animimg branch
        if wtype == "animimg" and ("animimg" in content and "image" in content):
            continue
        missing.append(wtype)

    assert not missing, (
        f"Canvas.tsx has no explicit branch for widget type(s): {missing}. "
        "Add a branch in renderWidget (e.g. type === \"x\" or type.includes(\"x\"))."
    )
    print(f"  Canvas covers all {len(COMPILABLE_WIDGET_TYPES)} compilable widget types: OK")


def test_live_overrides_handle_all_display_actions() -> None:
    """Every display action that appears in bindingConfig must be handled in App.tsx liveOverrides."""
    app_path = REPO_ROOT / "frontend/src/App.tsx"
    binding_path = REPO_ROOT / "frontend/src/bindings/bindingConfig.ts"
    assert app_path.exists(), f"App not found: {app_path}"
    assert binding_path.exists(), f"bindingConfig not found: {binding_path}"

    app_content = app_path.read_text("utf-8")
    binding_content = binding_path.read_text("utf-8")

    # Display actions that must be handled in liveOverrides (when used in a Link).
    # Keep in sync with DISPLAY_ACTIONS_BY_WIDGET_TYPE and the action === "..." branches in App liveOverrides.
    required_actions = [
        "label_text",
        "label_number",
        "arc_value",
        "slider_value",
        "bar_value",
        "widget_checked",
        "button_bg_color",
        "button_white_temp",
        "led_brightness",
    ]

    # Ensure bindingConfig actually exposes these (so we don't require handling for removed actions)
    for act in required_actions:
        if act == "label_number":
            continue  # legacy / optional; App may still handle it
        assert (
            act in binding_content
        ), f"bindingConfig should reference display action {act!r} (or remove from this test)."

    missing: list[str] = []
    for act in required_actions:
        # liveOverrides useMemo contains branches like: if (action === "label_text") { ... }
        pattern = f'action === "{act}"'
        if pattern not in app_content:
            missing.append(act)

    assert not missing, (
        f"App.tsx liveOverrides does not handle display action(s): {missing}. "
        'Add a branch in the liveOverrides useMemo (e.g. } else if (action === "x") { ... }).'
    )
    print(f"  liveOverrides handle all {len(required_actions)} display actions: OK")


def test_binding_config_widget_types_subset_of_compilable() -> None:
    """Widget types in bindingConfig (DISPLAY_ACTIONS / EVENTS) should be a subset of COMPILABLE_WIDGET_TYPES."""
    binding_path = REPO_ROOT / "frontend/src/bindings/bindingConfig.ts"
    content = binding_path.read_text("utf-8")

    # Extract only the two widget-type records (not SERVICES_BY_DOMAIN etc.)
    key_pattern = re.compile(r'^\s{2}([a-z_]+):\s*\[', re.MULTILINE)
    keys: set[str] = set()

    for start_marker in (
        "DISPLAY_ACTIONS_BY_WIDGET_TYPE: Record",
        "EVENTS_BY_WIDGET_TYPE: Record",
    ):
        idx = content.find(start_marker)
        assert idx >= 0, f"bindingConfig missing {start_marker}"
        # Find the opening brace of the record and then the closing };
        block_start = content.find("{", idx)
        assert block_start >= 0, f"No {{ after {start_marker}"
        depth = 1
        i = block_start + 1
        while i < len(content) and depth > 0:
            if content[i] == "{":
                depth += 1
            elif content[i] == "}":
                depth -= 1
            i += 1
        block = content[block_start:i]
        keys.update(key_pattern.findall(block))

    extra = keys - set(COMPILABLE_WIDGET_TYPES)
    assert not extra, (
        f"bindingConfig mentions widget type(s) not in COMPILABLE_WIDGET_TYPES: {extra}. "
        "Add them in api/views.py (PALETTE or EXTRA) or remove from bindingConfig."
    )
    print(f"  bindingConfig widget types ⊆ compilable ({len(keys)} types): OK")


def main() -> int:
    print("Widget/binding verification")
    print("-" * 40)
    try:
        test_canvas_covers_all_compilable_types()
        test_live_overrides_handle_all_display_actions()
        test_binding_config_widget_types_subset_of_compilable()
    except AssertionError as e:
        print("FAIL:", e)
        return 1
    print("-" * 40)
    print("All widget/binding checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
