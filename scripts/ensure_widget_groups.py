#!/usr/bin/env python3
"""
Ensure every LVGL widget schema has:
- groups as object form { "GroupName": { "section": "props"|"style"|"events"|part, "keys": [...] } }
- Every key in props, style, events (and any part sections like knob, indicator) appears in exactly one group.
Run from repo root: python3 scripts/ensure_widget_groups.py
"""
import json
import os
from pathlib import Path

SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "custom_components" / "esphome_touch_designer" / "schemas" / "widgets"

# Widget-specific: section -> list of keys that should have a dedicated group name (first group for that section)
WIDGET_SPECIFIC_GROUPS = {
    "arc": [("Arc", "props", ["rotation", "bg_start_angle", "bg_end_angle", "knob_offset", "mode"]),
            ("Value & range", "props", ["min", "max", "value", "adjustable"]),
            ("Knob", "knob", None), ("Indicator", "indicator", None)],
    "bar": [("Value & range", "props", ["min", "max", "value", "start_value", "mode"]),
            ("Knob", "knob", None), ("Indicator", "indicator", None)],
    "slider": [("Value & range", "props", ["min", "max", "value", "start_value", "mode"]),
               ("Knob", "knob", None), ("Indicator", "indicator", None)],
    "spinner": [("Spinner", "props", ["time", "arc_length"]), ("Indicator", "indicator", None)],
    "switch": [("Switch", "props", ["state"])],
    "checkbox": [("Checkbox", "props", ["text", "checked"])],
    "dropdown": [("Dropdown", "props", ["options", "selected_index"])],
    "roller": [("Roller", "props", ["options", "selected"])],
    "label": [("Label", "props", ["text", "font"])],
    "button": [("Button", "props", ["text", "font", "checkable"])],
    "image": [("Image", "props", ["src", "opa"])],
    "led": [("LED", "props", ["color", "brightness"])],
    "qrcode": [("QR code", "props", ["text", "size", "light_color", "dark_color"])],
    "textarea": [("Textarea", "props", ["text", "placeholder_text", "one_line", "max_length"])],
    "keyboard": [("Keyboard", "props", ["mode", "textarea_id"])],
    "spinbox": [("Spinbox", "props", ["min", "max", "value", "step", "range_from", "range_to", "digits", "decimal_places", "selected_digit"])],
    "canvas": [("Canvas", "props", ["transparent", "clip_corner"])],
    "line": [("Line", "props", ["points", "line_width", "line_color", "line_rounded"])],
    "animimg": [("Animimg", "props", ["duration", "repeat_count", "src"])],
}

def all_prop_keys(schema):
    """Return set of (section, key) for all defined fields."""
    out = set()
    for section in ("props", "style", "events"):
        for k in (schema.get(section) or {}).keys():
            out.add((section, k))
    for part_name, part_fields in schema.items():
        if part_name in ("type", "title", "esphome", "groups", "props", "style", "events"):
            continue
        if isinstance(part_fields, dict) and part_fields and any(
            isinstance(v, dict) and ("type" in v or "default" in v) for v in part_fields.values()
        ):
            for k in part_fields.keys():
                out.add((part_name, k))
    return out

def build_groups(schema, wtype):
    """Build groups object so every (section, key) is in exactly one group."""
    all_keys = all_prop_keys(schema)
    assigned = set()
    groups = {}
    specific = WIDGET_SPECIFIC_GROUPS.get(wtype, [])

    for group_name, section, keys in specific:
        if keys is None:
            keys = list((schema.get(section) or {}).keys())
        for k in keys:
            if (section, k) in all_keys and (section, k) not in assigned:
                if group_name not in groups:
                    groups[group_name] = {"section": section, "keys": []}
                groups[group_name]["keys"].append(k)
                assigned.add((section, k))

    # Common: align, hidden, clickable, scrollable, scrollbar_mode, scroll_dir, opacity, group
    common_props = ["align", "hidden", "clickable", "scrollable", "scrollbar_mode", "scroll_dir", "opacity", "group"]
    common_keys = [( "props", k) for k in common_props if ("props", k) in all_keys and ("props", k) not in assigned]
    if common_keys:
        groups["Common"] = {"section": "props", "keys": [k for _, k in common_keys]}
        for _, k in common_keys:
            assigned.add(("props", k))

    # Remaining props
    remaining_props = [(s, k) for (s, k) in all_keys if s == "props" and (s, k) not in assigned]
    if remaining_props:
        groups["Props"] = {"section": "props", "keys": [k for _, k in remaining_props]}
        for t in remaining_props:
            assigned.add(t)

    # Style
    style_keys = [k for (s, k) in all_keys if s == "style"]
    if style_keys:
        groups["Style"] = {"section": "style", "keys": style_keys}
        for k in style_keys:
            assigned.add(("style", k))

    # Events
    event_keys = [k for (s, k) in all_keys if s == "events"]
    if event_keys:
        groups["Events"] = {"section": "events", "keys": event_keys}
        for k in event_keys:
            assigned.add(("events", k))

    # Remaining part sections (e.g. knob, indicator, cursor, dropdown_list)
    for part_name, part_fields in schema.items():
        if part_name in ("type", "title", "esphome", "groups", "props", "style", "events"):
            continue
        if not isinstance(part_fields, dict) or not part_fields:
            continue
        if not any(isinstance(v, dict) and ("type" in v or "default" in v) for v in part_fields.values()):
            continue
        part_keys = [k for k in part_fields.keys() if (part_name, k) not in assigned]
        if part_keys:
            label = part_name.replace("_", " ").title()
            groups[label] = {"section": part_name, "keys": part_keys}

    return groups

def main():
    for path in sorted(SCHEMAS_DIR.glob("*.json")):
        with open(path, "r", encoding="utf-8") as f:
            schema = json.load(f)
        wtype = schema.get("type", path.stem)
        groups = build_groups(schema, wtype)
        if not groups:
            continue
        schema["groups"] = groups
        with open(path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2, ensure_ascii=False)
        print(path.name, "->", list(groups.keys()))

if __name__ == "__main__":
    main()
