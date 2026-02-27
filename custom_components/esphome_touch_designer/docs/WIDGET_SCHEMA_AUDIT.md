# Widget Schema Audit: Missing ESPHome LVGL Properties

Comparison of our widget schemas against ESPHome LVGL docs and [esphome.io/components/lvgl/widgets](https://esphome.io/components/lvgl/widgets.html). The list is intended to be exhaustive.

---

## Properties we currently have

### Props (common)

- align, hidden, clickable, scrollable, scrollbar_mode, scroll_dir, opacity, group
- checkable (button, checkbox, switch, etc.)
- Widget-specific: text, font, options, selected_index, value, min, max, step, etc.

### Style (common)

- bg_color, text_color, border_width, border_color, radius
- pad_top, pad_bottom, pad_left, pad_right
- shadow_width, shadow_color
- clip_corner (canvas/image)

### Layout

- x, y, width, height (via canvas/editor)

---

## 1. Style properties (all widgets)

ESPHome LVGL `STYLE_PROPS` defines these. Our schemas only include a subset.

### Missing from our schemas (style section)

| Property | ESPHome values | Widgets affected | Notes |
|----------|----------------|------------------|-------|
| **text_align** | LEFT, CENTER, RIGHT, AUTO | button, label, checkbox, dropdown, textarea, spinbox, roller, bar | **Critical** – controls text position within widget. We wrongly use `align` for this in the canvas. |
| text_decor | NONE, UNDERLINE, STRIKETHROUGH | label, button, textarea, etc. | Text decoration |
| text_letter_space | int | text widgets | Letter spacing |
| text_line_space | int | text widgets | Line spacing |
| text_opa | opacity | text widgets | Text opacity |
| bg_opa | opacity | all | Background opacity |
| bg_grad | gradient id | all | Background gradient |
| bg_grad_color | color | all | Gradient end color |
| bg_grad_dir | NONE, HOR, VER | all | Gradient direction |
| bg_main_stop, bg_grad_stop | 0–255 | all | Gradient stops |
| bg_image_src, bg_image_opa, bg_image_recolor, bg_image_tiled | | all | Background image |
| border_opa | opacity | all | Border opacity |
| border_post | bool | all | Border draw order |
| border_side | NONE, TOP, BOTTOM, LEFT, RIGHT, INTERNAL | all | Which borders to show |
| outline_color, outline_opa, outline_pad, outline_width | | all | Outline (outside border) |
| shadow_ofs_x, shadow_ofs_y | int | all | Shadow offset |
| shadow_opa, shadow_spread | | all | Shadow opacity/spread |
| pad_all | padding | all | Shorthand for pad_top/right/bottom/left |
| clip_corner | bool | all | Clip content to radius |
| opa | opacity | all | Overall opacity |
| min_width, max_width, min_height, max_height | px or % | all | Size limits |
| transform_angle, transform_zoom | | all | Transform |
| translate_x, translate_y | | all | Position offset |

### Arc-specific (arc widget style)

| Property | Notes |
|----------|-------|
| arc_opa, arc_color, arc_rounded, arc_width | Arc track styling |

---

## 2. Object flags (props – behavior)

ESPHome `OBJ_FLAGS`. We have: align, hidden, clickable, scrollable, scrollbar_mode, scroll_dir, opacity, group, checkable.

### Missing flags

| Flag | Notes |
|------|-------|
| click_focusable | Add focused state when clicked |
| scroll_elastic | Elastic scroll inside |
| scroll_momentum | Scroll continues when "thrown" |
| scroll_one | Scroll only on snappable children |
| scroll_chain_hor, scroll_chain_ver, scroll_chain | Propagate scroll to parent |
| scroll_on_focus | Auto-scroll to make focused widget visible |
| scroll_with_arrow | Allow scrolling with arrow keys |
| snappable | Parent snap target |
| press_lock | Keep pressed when finger slides off |
| event_bubble | Propagate events to parent |
| gesture_bubble | Propagate gestures to parent |
| adv_hittest | Better hit test (rounded corners) |
| ignore_layout | Ignore parent layout |
| floating | Don't scroll with parent, ignore layout |
| overflow_visible | Don't clip children |
| layout_1, layout_2, widget_1, widget_2 | Custom layout flags |
| user_1, user_2, user_3, user_4 | Custom user flags |

---

## 3. Layout / positioning

| Property | Notes |
|----------|-------|
| align_to | Align widget relative to another (id, align, x, y) – we don't have this |

---

## 4. State-based styling

ESPHome widgets support **state** (pressed, focused, checked, disabled, edited, scrolled, etc.) with different styles per state. Our schemas only define a single style block per widget.

| State | Notes |
|-------|-------|
| pressed, focused, checked, disabled, edited, scrolled, focus_key | We don't support state-specific styles |
| user_1, user_2, user_3, user_4 | Custom states |

Example from ESPHome: `button` with `pressed: { border_color: 0xFF0000 }`, `checked: { border_color: 0xFFFF00 }`, `focused: { border_color: 0x00FF00 }`.

---

## 5. Widget parts (sub-parts with separate styles)

ESPHome supports styling **parts** of widgets (main, indicator, knob, cursor, items, selected, scrollbar). Our schemas only style the main part.

| Part | Widgets |
|------|---------|
| main | All (default) |
| indicator | slider, bar, arc, checkbox |
| knob | slider, bar, arc |
| cursor | spinbox, textarea |
| items | roller, dropdown, list |
| selected | roller, dropdown |
| scrollbar | scrollable widgets |

---

## 6. Widget-specific (by type)

### Label

- **recolor** – parse color codes in text (e.g. `#FF0000 red#`)
- **long_mode** – WRAP, DOT, SCROLL, SCROLL_CIRCULAR, CLIP

### Button

- All common; we have text, font, checkable. **text_align** missing in style.

### Spinbox (ESPHome example has `text_align: center`)

- **text_align** – we don't have this
- **range_from, range_to, digits, decimal_places, selected_digit** – we have min/max/value/step; ESPHome uses different naming

### Slider / Bar / Arc

- **knob** part: width, height, radius, bg_color, etc. – we have some; may be incomplete
- **indicator** part: bg_opa, bg_color, arc_color, etc.

### Image

- **clip_corner** – we have this in canvas.json; check image.json

### Dropdown / Roller

- **dropdown_list** / **items** part: selected styles

### Button matrix

- **rows** structure, **control** (checkable, popover, disabled, recolor), **width** per button

### Led

- **color**, **brightness** – check if we map these

---

## 7. Semantic fix: align vs text_align

- **align** (widget prop) = widget position on parent (TOP_LEFT, CENTER, etc.). Affects x/y interpretation.
- **text_align** (style) = text alignment within the widget (LEFT, CENTER, RIGHT, AUTO). No vertical text align in LVGL; use widget **align** (e.g. CENTER, LEFT_MID) so canvas and device match.

---

## 8. Priority order for implementation

1. **text_align** (style) – add to button, label, checkbox, dropdown, textarea, spinbox, roller, bar. Fix canvas to use it for text layout instead of align.
2. **align** – ensure canvas uses it only for widget position (already fixed in backend).
3. **Common style props** – bg_opa, border_side, outline_*, shadow_ofs_*.
4. **Object flags** – click_focusable, scroll_on_focus, overflow_visible.
5. **align_to** – for relative positioning.
6. **Other style props** – gradients, transforms, etc.
7. **State-based styling** – pressed, focused, checked, etc.
8. **Widget parts** – knob, indicator, cursor, items, selected.
9. **Widget-specific** – recolor, long_mode (label), etc.

---

## 9. Widgets we have (32)

animimg, arc, bar, button, buttonmatrix, calendar, canvas, chart, checkbox, colorwheel, container, dropdown, image, image_button, keyboard, label, led, line, list, meter, msgboxes, obj, qrcode, roller, slider, spinbox, spinner, switch, tabview, table, textarea, tileview

All should be checked against ESPHome LVGL widget-specific schemas in `esphome/components/lvgl/widgets/*.py` for any widget-specific properties we might have missed.

---

## 10. Full scope (v0.71+): LVGL parity and editor UX

**Design goal:** Expose every LVGL/ESPHome property (including sub-parts and top-level config), use them for canvas drawing where relevant, and match device screen as closely as possible.

### LVGL Settings (top-level) – IMPLEMENTED

- **Entry:** "LVGL settings" button in main nav (toolbar). Opens a dedicated mini-editor modal.
- **Tabs:** Main | Style definitions | Theme | Gradients.
- **Main:** `disp_bg_color`, `buffer_size`. Persisted in `project.lvgl_config.main`; emitted under `lvgl:` in compile.
- **Style definitions:** List of named styles (`id` + optional style props). Stored in `project.lvgl_config.style_definitions`; emitted as `lvgl: style_definitions: - id: ...`. Widgets can reference via `styles: id` (to be wired in widget schema when needed).
- **Theme:** Default styles per widget type (e.g. `button`, `arc`). Stored in `project.lvgl_config.theme`; emitted as `lvgl: theme: button: ...`. JSON key-value per type in the modal.
- **Gradients:** List of `id`, `direction`, `stops` (color + position). Stored in `project.lvgl_config.gradients`; emitted as `lvgl: gradients:`.
- **Main LVGL config (item 10):** `disp_bg_color`, `buffer_size` are in the Main tab. Other main config (touchscreens, encoders, keypads, etc.) can be added to the same tab or a separate "Input" section later.

### Pages and top layer – IMPLEMENTED

- **Page options:** Backend emits `layout` and `skip` per page when set in the page object. Frontend can add these to page metadata when we add a page-settings UI.
- **top_layer:** `project.lvgl_config.top_layer.widgets` is emitted as `lvgl: top_layer: - id: top_layer widgets: ...`. Adding widgets to top_layer will require UI (e.g. a separate "Always on top" page or a checkbox on widgets).

### Still to do (schema + canvas + backend)

- **Common schema:** All missing style props and object flags (see §§1–2); canvas to use `text_align`, padding, shadow offset, etc.
- **Widget schemas:** Full props/parts for every widget (§§5–6); canvas to use new props when drawing.
- **align_to:** Widget-relative positioning (id, align, x, y) in schema and emit.
- **State-based styling:** Per-widget or per-part state blocks (pressed, focused, checked, etc.) in schema and emit; optional canvas preview.
- **Layouts:** `layout:` on containers/pages in schema and emit; canvas can approximate or ignore.
- **SIZE_CONTENT / % width height:** Schema and editor support; backend emit.
- **Font reference:** `text_font` options (built-in + custom id) in schema and emit.
- **Full event set:** All widget triggers (on_value, on_short_click, on_long_press, etc.) in schema and bindable.
- **Animated transitions:** Where applicable (e.g. tabview select animated, page change animation) in schema and emit.
