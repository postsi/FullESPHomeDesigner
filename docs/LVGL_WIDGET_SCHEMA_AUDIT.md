# LVGL Widget Schema Audit

This document tracks which widget schemas have been audited against LVGL/ESPHome so that all relevant properties are exposed in the Properties inspector.

## Audit status

### Fully extended (LVGL-specific props + style parts + groups)

| Widget | Additions | Groups |
|--------|-----------|--------|
| **arc** | rotation, bg_start_angle, bg_end_angle, knob_offset, mode; **knob** and **indicator** style parts (so Knob/Indicator show in inspector) | Arc, Value & range, Common, Style, Knob, Indicator |
| **bar** | mode (NORMAL/SYMMETRICAL/RANGE), start_value | Value & range, Common, Style |
| **slider** | mode (NORMAL/SYMMETRICAL/RANGE), start_value | Value & range, Common, Style |

### Grouping added (widget-specific groups, props already present)

| Widget | Groups added |
|--------|--------------|
| **switch** | Switch (state) |
| **checkbox** | Checkbox (text, checked) |
| **dropdown** | Dropdown (options, selected_index) |
| **spinner** | Spinner (time, arc_length) |
| **label** | Label (text, font) |
| **button** | Button (text, font, checkable) |

### Not yet audited (still flat Common + Style only)

- **animimg** – duration, repeat_count, etc. (ESPHome: duration, src[])
- **buttonmatrix** – rows/items structure (complex)
- **calendar** – schema uses `"groups": ["data"]` (array format; Inspector expects object)
- **canvas** – transparent, clip_corner (ESPHome)
- **chart** – schema uses `"groups": ["visualization"]`
- **colorwheel** – schema uses `"groups": ["inputs"]`
- **container** – layout, flex, gap (ESPHome layouts)
- **image** – src, clip_corner, etc.
- **image_button** – schema uses `"groups": ["inputs"]`
- **keyboard** – mode, textarea (target)
- **led** – color, brightness
- **line** – points, line_width, line_color, line_rounded
- **list** – schema uses `"groups": ["containers"]`
- **meter** – scales (complex YAML)
- **msgboxes** – title, body, buttons, close_button
- **obj** – base object (no extra props)
- **qrcode** – size, light_color, dark_color, text
- **roller** – options, selected_index, visible_row_count
- **spinbox** – range_from, range_to, digits, decimal_places, value
- **table** – schema uses `"groups": ["data"]`
- **tabview** – tabs, position, tab_style
- **textarea** – text, placeholder_text, one_line, max_length, etc.
- **tileview** – tiles (complex)

## Reference

- **LVGL widgets:** https://docs.lvgl.io/9.1/widgets/
- **ESPHome LVGL widgets:** https://esphome.io/components/lvgl/widgets.html
- **Schema format:** `custom_components/esphome_touch_designer/schemas/widgets/*.json`
- **Inspector:** Uses `schema.groups` when present (object form: `{ "GroupName": { "section": "props"|"style"|"events", "keys": ["key1", ...] } }`). Collapsible sections per group. If `groups` is missing or wrong format, falls back to flat Props / Style / Events.

## Script

- `scripts/ensure_widget_groups.py` – Run from repo root to normalize every widget schema: `groups` in object form and every key in props/style/events (and part sections) assigned to a group. Extend `WIDGET_SPECIFIC_GROUPS` for new widget-specific group names.
