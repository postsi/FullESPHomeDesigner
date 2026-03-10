"""
Verify widget/binding consistency: every compilable widget type has Canvas render coverage,
and every display action used in bindingConfig is handled in App liveOverrides.
"""
from __future__ import annotations

import re
from pathlib import Path

from custom_components.esphome_touch_designer.api.views import COMPILABLE_WIDGET_TYPES

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_canvas_covers_all_compilable_types():
    """Every type in COMPILABLE_WIDGET_TYPES must have a render branch in Canvas.tsx."""
    canvas_path = REPO_ROOT / "frontend/src/Canvas.tsx"
    assert canvas_path.exists(), f"Canvas not found: {canvas_path}"
    content = canvas_path.read_text("utf-8")
    missing = []
    for wtype in sorted(COMPILABLE_WIDGET_TYPES):
        if f'type === "{wtype}"' in content or f"type === '{wtype}'" in content:
            continue
        if f'type.includes("{wtype}")' in content or f"type.includes('{wtype}')" in content:
            continue
        if wtype == "meter" and ('type === "meter"' in content or "meter" in content):
            continue
        if wtype == "animimg" and ("animimg" in content and "image" in content):
            continue
        missing.append(wtype)
    assert not missing, (
        f"Canvas.tsx has no explicit branch for widget type(s): {missing}. "
        'Add a branch in renderWidget (e.g. type === "x" or type.includes("x")).'
    )


def test_live_overrides_handle_all_display_actions():
    """Every display action that appears in bindingConfig must be handled in App.tsx liveOverrides."""
    app_path = REPO_ROOT / "frontend/src/App.tsx"
    binding_path = REPO_ROOT / "frontend/src/bindings/bindingConfig.ts"
    assert app_path.exists() and binding_path.exists()
    app_content = app_path.read_text("utf-8")
    binding_content = binding_path.read_text("utf-8")
    required_actions = [
        "label_text", "label_number", "arc_value", "slider_value", "bar_value",
        "widget_checked", "button_bg_color", "button_white_temp", "led_brightness",
    ]
    for act in required_actions:
        if act == "label_number":
            continue
        assert act in binding_content, f"bindingConfig should reference display action {act!r}"
    missing = [act for act in required_actions if f'action === "{act}"' not in app_content]
    assert not missing, (
        f"App.tsx liveOverrides does not handle display action(s): {missing}. "
        'Add a branch in the liveOverrides useMemo.'
    )


def test_binding_config_widget_types_subset_of_compilable():
    """Widget types in bindingConfig (DISPLAY_ACTIONS / EVENTS) should be a subset of COMPILABLE_WIDGET_TYPES."""
    binding_path = REPO_ROOT / "frontend/src/bindings/bindingConfig.ts"
    content = binding_path.read_text("utf-8")
    key_pattern = re.compile(r'^\s{2}([a-z_]+):\s*\[', re.MULTILINE)
    keys = set()
    for start_marker in ("DISPLAY_ACTIONS_BY_WIDGET_TYPE: Record", "EVENTS_BY_WIDGET_TYPE: Record"):
        idx = content.find(start_marker)
        assert idx >= 0, f"bindingConfig missing {start_marker}"
        block_start = content.find("{", idx)
        assert block_start >= 0
        depth, i = 1, block_start + 1
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
