## v0.64.0 — Hardware Recipe System v2 (Importer + Metadata)

## v0.70.6

- Fix Invalid handler: simplify config flow to match koosoli pattern (named ConfigFlow, single_instance, minimal options flow with super().__init__).

## v0.70.5

- Restore root manifest.json for HACS (required for content_in_root downloads).

## v0.70.4

- Fix "Invalid handler": restore options flow with `super().__init__()`, align with koosoli/ESPHomeDesigner.
- Remove root manifest; align manifest (configuration_url, after_dependencies, integration_type, loggers) and hacs.json (render_readme, homeassistant min).

## v0.70.3

- Simplify config flow to minimal one-click add (no form) to fix "Invalid handler" error.

## v0.70.2

- Remove options flow handler to fix "Invalid handler" error when adding integration.

## v0.70.1

- Add `config_flow: true` to manifest to fix UI Add Integration flow.
- Remove YAML config workaround.

## v0.70.0

- Hardware recipes (product polish):
  - Recipe Manager now supports **Export** (download YAML+metadata) and **Duplicate** (clone builtin or user recipes into a new custom recipe).
  - Backend adds:
    - `POST /api/esphome_touch_designer/recipes/clone`
    - `GET /api/esphome_touch_designer/recipes/{recipe_id}/export`
- Inspector polish:
  - Field tooltips from schema descriptions (where available).
  - Recent color swatches for color fields.
  - “Clear section” to remove all modified values in Props/Style/Events.
- Card Library additions:
  - Gauge card (arc + value label, numeric sensor binding).
  - Scene card and Script card (run actions).
  - Chips card (compact multi-entity state display).

- Adds **Import recipe…** flow to convert a raw ESPHome device YAML into a normalized hardware recipe (Option B).
  - Strips common non-hardware top-level blocks (wifi/api/ota/logger/etc.)
  - Ensures an `lvgl:` block exists
  - Injects the `#__LVGL_PAGES__` marker for designer page generation
- Adds backend endpoint: `/api/esphome_touch_designer/recipes/import`
- Adds v2 user recipe storage:
  - `/config/esphome_touch_designer/recipes/user/<slug>/recipe.yaml`
  - `/config/esphome_touch_designer/recipes/user/<slug>/metadata.json`
- Recipe listing supports **builtin + v2 user + legacy** single-file recipes.

## v0.63.0 — Built-in hardware recipe library (postsi/ESPHomeDesigner import)

- Imported the entire hardware device YAML set from postsi/ESPHomeDesigner (frontend/hardware) into built-in recipes.
- Added 15 new built-in recipes under `custom_components/esphome_touch_designer/recipes/builtin/`.
- Updated builtin recipe label map so they appear with friendly names in the UI.

## v0.60.0 — Card Library Phase 2 Enhancements (Lane B)

- Thermostat card: HVAC mode buttons now capability-aware (hvac_modes).
- Media card: mute (when available), volume up/down buttons, and best-effort source dropdown.
- Cover card: tilt controls added when tilt attributes are present.
- Glance and Grid cards: wizard multi-entity picker + per-row/tile tap action.
- Entity/Tile cards: call-service now supports optional service_data YAML.

## 0.59.0
- Card Library Phase 2: Thermostat Card, Media Control Card, Cover Card, Glance Card, Grid Card (2×2), and a Vertical Stack layout helper.
- Palette now automatically groups any template with title prefix "Card Library •" under the Card Library section.

## 0.53.0
- Added Fan Parity control template with optional oscillate/direction/preset controls (capability-aware enable/disable).

## 0.52.0
- Added Cover Parity control template with capability-aware enable/disable for position and tilt.

## 0.51.0
- Added Climate Parity control template (hvac + preset + fan mode dropdowns; capability-aware via wizard caps).

## v0.46.0
- Added Inspector font picker for `props.font` using uploaded .ttf/.otf assets (sets `asset:<file>:<size>`).

## v0.45.0
- Added best-effort UI loop-avoidance using global lock window (etd_ui_lock_until).
- Injects lock set before HA service calls and suppresses HA→UI updates during window.

## v0.42.0
- Implemented LVGL image widget compilation (widgets of type image now emit lvgl image YAML).
- Uses existing asset pipeline: props.src may be asset:<filename> and will compile to ESPHome image resources.

## v0.41.0
- Added cover/media_player/fan control templates with basic Lovelace-like interactions.
- Cover templates can auto-select position slider variant when current_position is available.

## v0.40.0
- Added capability-driven climate template variants (heat-only, heat/cool, full).
- Light sliders now emit service calls on release (reduces feedback loops/spam).

# Release Notes
## v0.33.0 (2026-02-18)
- Plugin system v1 (filesystem-based):
  - Reads custom control snippets and widget schema overrides from `/config/esphome_touch_designer_plugins/`.
  - Exposed via a backend endpoint so the frontend can merge/offer them without rebuilding the integration.

## v0.32.0 (2026-02-18)
- HA capability introspection v1:
  - Endpoint returns state attributes, supported_features, and available services for a given entity_id.
  - This is the foundation for “Lovelace-equivalent” control templates that adapt to actual device capabilities.

## v0.31.0 (2026-02-18)
- Preview fidelity: first-pass container flex layout preview (`flex_row` / `flex_col`) with gap + padding.
- Fix: LVGL palette drop now calls Canvas `onDropCreate` correctly.

## v0.30.0 (2026-02-18)
- Canvas UX: LVGL widget palette now supports drag-and-drop onto the canvas (similar to HA Controls).
- Drop position becomes the widget’s initial x/y for faster layouting.

## v0.29.0 (2026-02-18)
- Deployment workflow v1:
  - “Export” endpoint writes the compiled YAML into Home Assistant’s `/config/esphome/<slug>.yaml`.
  - This matches the ESPHome add-on’s default config folder, enabling a near one-click deploy from ESPHome UI.

## v0.28.0 (2026-02-18)
- Hardware recipe validator v1:
  - Backend endpoint validates built-in recipe YAML (parse + markers + basic required blocks).
  - Intended to catch obvious “this recipe can’t work” issues before compile/flash.

## v0.27.0 (2026-02-18)
- Assets pipeline v1:
  - Upload/list assets (JSON base64) from the Designer UI.
  - Compiler emits an `image:` section for widgets using `props.src: "asset:<filename>"`.

## v0.26.0 (2026-02-18)
- Schemas: expanded common LVGL style coverage (padding, radius, shadow) for core widgets (container/button/label/image_button).
- Inspector: these now show with typed editors (numbers + colors) and compile to YAML style keys.

## v0.25.0 (2026-02-18)
- Compiler: support multiline YAML fragments in widget properties (emits block scalars `|-`).
  This enables control templates to embed `on_click:` / `on_value:` `then:` blocks cleanly.

## v0.25.0 (2026-02-18)
- Compiler: support multiline YAML fragments in widget properties (emits block scalars `|-`).
  This enables control templates to embed `on_click:` / `on_value:` `then:` blocks cleanly.


## v0.9.0 — Live updates (HA -> LVGL) + HACS compliance

### Live updates
- Added `project.links[]` to express live update wiring from HA state/attributes to LVGL widgets.
- Compiler now attaches `on_value` / `on_state` triggers to generated `homeassistant` sensors to update LVGL widgets live (e.g. `lvgl.slider.update`, `lvgl.label.update`, `lvgl.widget.update`).

### HACS compliance
- Added `hacs.json` in repository root.
- Ensured integration `manifest.json` includes required keys: `documentation`, `issue_tracker`, `codeowners`, and `version`.

### Notes
- Control templates now include a first live update (Light toggle button stays synced with HA state).
- Next: extend templates + links for brightness, cover position, climate setpoint, media volume/title, etc.

## v0.10.0 — Canvas UX: multi-select, snapping grid, undo/redo, z-order

- Canvas now supports **multi-select** (Shift+Click), multi-drag, and multi-resize.
- Added **grid snapping** (configurable grid + toggle). Hold **Alt** to disable snapping for a drag/resize.
- Added **undo/redo** (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+Y) backed by a history stack.
- Added **copy/paste** (Ctrl/Cmd+C/V), duplicate via paste with offset.
- Added **z-order tools**: Bring Front / Send Back.
- Added keyboard **nudge** with arrow keys (Shift = 10px), and Delete/Backspace to remove selected widgets.

## v0.11.0 — Design-time HA entity picker + binding builder

- Added HA backend API endpoints to list entities and fetch entity details for design-time binding.
- Frontend now loads an entity snapshot and provides a searchable **entity picker**.
- Added **Binding Builder** UI to bind the selected widget to HA state/attributes and automatically create `bindings[]` + `links[]` for live updates.
- Compiler unchanged: it already translates `bindings[]` + `links[]` into ESPHome `homeassistant` sensors with LVGL update triggers.

## v0.12.0 — Lovelace-grade control templates + external hardware recipe support

### Controls
- Added **full** Home Assistant control templates:
  - Light: toggle + brightness slider + live feedback
  - Climate: hvac mode buttons + setpoint slider + live feedback
  - Cover: position slider + open/stop/close + live feedback
  - Media Player: title + transport + volume slider + live feedback

### Hardware recipes
- Recipes endpoint now returns **builtin + user recipes**.
- You can drop additional YAML recipes into:
  `/config/esphome_touch_designer/recipes/*.yaml`
  and they will appear as `Custom • <name>` in the recipe picker.

### Notes
- These templates are first-pass Lovelace equivalents; capability-gating (supported_features) and richer styling comes next.


## v0.13.0 — Hardware Recipe Packs

- Added automatic hardware recipe pack loader.
- Supports Built-in, User, and Pack recipes.
- Compatible with EnhancedESPHomeGUI hardware directory.
- Recipes auto-discovered under /config/esphome_touch_designer/recipe_packs/.

## v0.14.0 — Built-in hardware recipe: Waveshare ESP32-P4-WIFI6-Touch-LCD-4C

- Added built-in hardware recipe for Waveshare ESP32-P4-WIFI6-Touch-LCD-4C (720x720) with known-good pins and baseline DSI timings.
- Notes clarify ESPHome mipi_dsi usage via `model: CUSTOM`.

## v0.15.0 — Schema-first property handling: omit nulls + inspector clear + selection fixes

- **Compiler**: omits `null` / `None` values instead of emitting YAML like `text: null`.
  - This is important because ESPHome config validation often rejects `null` values.
- **Widget creation**: defaults are applied only when explicitly provided and non-null.
- **Inspector**: added a **clear** button per field to remove the property from the widget (so it stops being emitted).
- **Canvas selection plumbing**: fixed mismatches between `selectedWidgetIds` and older `selectedWidgetId` references.
  - Clicking a widget selects it; Shift+Click toggles it.
  - Clicking the empty canvas clears selection.


## v0.16.0 (2026-02-17)

### Canvas widget previews
- Canvas now renders **lightweight previews** for common widgets (currently: `label`, `button`, `slider/bar`, `arc/gauge`).
  - Still *not* a pixel-perfect LVGL renderer; the YAML compiler remains the source of truth.
  - The goal is to make layout work practical before we add a more faithful LVGL-style engine.

### No breaking changes
- Existing projects should load unchanged.


## v0.17.0 (2026-02-17)

### Style-aware Konva previews
- Canvas previews now respect common **style** properties (background, border, opacity, font size, text colour), using `style.*` as authoritative.
- Per-widget preview adornments (e.g. slider track/fill/knob colours) now read from `style.*` when present.

### Multi-page projects
- Projects can now contain **multiple pages**.
- Added a page selector + **Add page** button.
- Canvas and widget operations now apply to the currently selected page.

## v0.18.0 (2026-02-18)

- Added a richer widget schema pack (expanded LVGL widgets) and tightened compiler validation.

## v0.19.0 (2026-02-18)

- Added copy/paste improvements and first-pass container grouping/ungrouping.

## v0.20.0 (2026-02-18)

- Inspector: color picker + numeric sliders where min/max are known.
- Schema typing improvements for common color fields.

## v0.21.0 (2026-02-18)

- Palette: drag/drop **Home Assistant control templates** (macros) onto the canvas.
  - Drop inserts multiple widgets plus appends to `project.bindings[]` and `project.links[]`.
- Canvas: container preview can optionally **clip children** via `container.props.clip_children` (designer-only).

## v0.22.0 (2026-02-18)

- Added a **post-drop wizard** for Home Assistant Control Templates.
  - When you drag a HA Control onto the canvas, the designer now prompts for `entity_id` (and an optional label override) before inserting the macro.
- Minor UX improvements to reduce common "entity_id missing" mistakes during template usage.

## v0.24.0 (2026-02-18)

- Template wizard now provides an **entity picker** (HTML datalist) populated from Home Assistant at design time.
  - Picker is **domain-filtered** using the template id convention (e.g. `ha_light_*` → `light.*`).
- Added a **Project lint** panel in the Editor toolbar.
  - Flags common issues like: missing/dangling `links[].target.widget_id`, empty `entity_id` in bindings/links, and entity IDs not present in the current HA snapshot.
- Version bumps for HACS compliance (`manifest.json`, frontend package version).

## v0.35.0 (2026-02-19)

- Control template wizard now displays **entity capabilities** (domain, supported_features, select attributes) from HA.
- Added **plugin controls** loading from `/config/esphome_touch_designer_plugins/controls/*.json` and surfaces them in the “Home Assistant Controls” palette.
  - Plugin controls are inserted using the same post-drop wizard and will attempt placeholder substitution (best-effort).

## v0.36.0 (2026-02-19)

- Added **capability-driven variants** for HA control templates (first pass).
  - Light controls can now auto-select a better variant based on `supported_color_modes`.
  - Wizard includes a **Variant** selector (Auto / Toggle only / Toggle+Brightness / +Color Temp).

## v0.37.0 (2026-02-19)

- Added **best-effort hardening** for high-frequency widget events (first pass).
  - `on_value` / `on_press` / `on_release` actions that call `homeassistant.action` get a small, compiler-inserted delay to reduce service-call spam while dragging.
- Added starter **example projects** under `custom_components/esphome_touch_designer/examples/`.

## v0.38.0 (2026-02-19)

- Added a **font asset pipeline (first pass)**.
  - Upload `.ttf` / `.otf` via Assets.
  - Set `props.font` on labels/buttons to: `asset:MyFont.ttf:24`.
  - Compiler emits an ESPHome `font:` section and rewrites widget font references to generated font ids.

## v0.39.0 (2026-02-19)

- Export now supports **safe merges** into existing ESPHome YAML files.
  - Generated YAML is wrapped in markers:
    - `# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---`
    - `# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---`
  - On export, if those markers exist, only the generated block is replaced and user YAML outside is preserved.

## v0.43.0
- Enhanced `ha_media_basic` control: prev/next, mute, and volume slider uses `on_release` to avoid spamming.
- Added new `ha_cover_tilt` control template (best-effort mapping to cover tilt services).

## v0.44.0
- Template Wizard: added capability-based auto selection for `cover` (tilt vs basic) and `media_player` (rich vs basic).


## v0.47.0
- Added loop-avoidance globals (global + per-entity) and wrapped HA→UI updates to reduce feedback loops.
- UI-originated events that call `homeassistant.action` now set lock windows and include a tiny delay to reduce burst spam.


## v0.48.0
- Added `ha_media_player_rich` control template (title + artist + transport + volume).
- Media player volume slider uses on_release to reduce HA service call spam.

## v0.49.0
- Improved HA↔UI loop-avoidance:
  - Added per-link (entity + widget) lock globals (`etd_lock_<entity>_<widget>`).
  - HA→UI update actions are now gated per widget, not just per entity.
  - UI events that call `homeassistant.action` now set per-link locks for the originating widget.

## v0.50.0
- Template Wizard: added an expandable **Raw capabilities** JSON dump to make it easier to debug templates and build Lovelace-parity controls.


## v0.54.0
- Added HA control templates: ha_switch_parity, ha_lock_parity, ha_alarm_parity.
- Wizard auto-selects templates by entity domain via ha_auto.

## v0.55.0
- Added templates: ha_select_parity, ha_number_parity.

## v0.56.0
- Added helper templates: ha_input_boolean, ha_input_number, ha_input_select, ha_input_text.

## v0.57.0
- Added Card Library v1: entity_card and tile_card.

## v0.57.1
- Documentation refresh (CURRENT STATE / NEXT STEPS) and HACS version alignment.


## v0.61.0 — Phase 2 card wizard options
- Thermostat card: min/max/step controls (prefilled from capabilities when available)
- Media card: toggles for transport/volume/mute/source + optional default source
- Cover card: optional tilt controls (if supported)
- Glance card: row count variants (2/3/4/6)
- Grid card: size variants (2×2 / 3×2 / 3×3) + dynamic entity slots

## v0.62.0 — Verification + Layout Tools + Hardware Recipe Workflow

- Adds **Self-check** (verification suite) in the Compile view (compile determinism + safe-merge marker checks).
- Adds layout tools: **Align (L/C/R/T/M/B)** and **Distribute (H/V)** toolbar above canvas.
- Adds keyboard nudging: **Arrow keys** (grid step), **Shift+Arrow** (1px), **Alt+Arrow** (5px). Also **Ctrl+Alt+Arrows** for quick align.
- Documents user hardware recipe workflow in `docs/HARDWARE_RECIPES.md`.

## v0.67.0

- Product polish: Deployment preview (diff) + guarded export + basic ESPHome dashboard link.
- Conditional Card: show/hide container based on a simple condition expression.
- Inspector polish: search, modified-only filter, reset-to-default.

## v0.68.0

- Product-mode hardware recipe UX: select a recipe per device, show extracted metadata (platform/board/resolution/touch/backlight/psram), and show preflight validation warnings inline.
- Recipe validation endpoint now returns best-effort extracted metadata to support the UI.
- Deployment preview diff viewer upgraded with inline diff rendering, add/remove line highlighting, and a **Copy diff** button.
- Conditional Card wizard: simple, guided builder for common conditions (string equals/not-equals/contains, numeric comparisons).

## v0.69.0

- Adds **Recipe Manager** UI (Compile tab): list custom recipes, rename (label), delete, and show on-disk storage path.
- Backend adds recipe management endpoints:
  - `PATCH /api/esphome_touch_designer/recipes/user/{recipe_id}` (rename)
  - `DELETE /api/esphome_touch_designer/recipes/user/{recipe_id}` (delete)
- Legacy v1 recipes now support an optional sidecar label file (`<id>.metadata.json`).

