

## v0.42.0
- LVGL page compiler now supports image widgets (type=image) and passes through src.
- Image assets are handled by the backend asset compiler (asset:<filename> -> ESPHome image:).


## v0.41.0
- Expanded HA control templates to cover cover/media_player/fan domains.
- Added simple capability-based variant selection for cover position controls.


## v0.40.0
- Added climate control variants selected via entity capabilities (hvac_modes).
- Adjusted slider control templates to prefer on_release to reduce service spam and HA/UI feedback.

# ESPHome Touch Designer — Architecture (Cursor Deep Context Guide)

This document explains **how the entire system works end‑to‑end**, why design decisions were made,
and how future contributors (including AI coding assistants like Cursor) should extend the project.

---

# 1. Project Goal (Mental Model)

The system provides:

> **A Lovelace‑like UI designer for ESP32 LVGL touch screens that compiles directly into ESPHome YAML and deploys through Home Assistant.**

Key principles:

- GUI‑first workflow
- Home Assistant native integration
- ESPHome remains the runtime + firmware builder
- LVGL is the rendering engine
- HA entities behave like Lovelace controls

This project is NOT:
- a Lovelace replacement
- an ESPHome fork
- a runtime dashboard engine

It is a **design → compile → deploy toolchain**.

---

# 2. High‑Level Architecture

```
User (HA UI)
     │
     ▼
React Designer (Custom Integration Panel)
     │
     ▼
Project Model (JSON)
     │
     ▼
Compiler (Python backend)
     │
     ▼
ESPHome YAML
     │
     ▼
ESPHome Builder Add‑on
     │
     ▼
ESP32 + LVGL Runtime
     │
     ▼
Home Assistant API (live state + actions)
```

There are **four independent layers**:

| Layer | Responsibility |
|------|---------------|
| Designer UI | Visual editing |
| Project Model | Source of truth |
| Compiler | Deterministic YAML generation |
| Runtime | ESPHome + LVGL execution |

---

# 3. The Project Model (MOST IMPORTANT CONCEPT)

Everything revolves around the project JSON.

Example conceptual structure:

```json
{
  "device": {...},
  "pages": [...],
  "bindings": [...],
  "links": [...],
  "advanced": {...}
}
```

This model is **the single source of truth**.

Never derive state from generated YAML.

---

## 3.1 Pages & Widgets

Pages contain LVGL widgets.

Widgets are editor objects — not YAML.

Example:

```json
{
  "id": "temp_label",
  "type": "label",
  "x": 20,
  "y": 40,
  "props": {
    "text": "21°C"
  }
}
```

Widgets are compiled using schema definitions.

---

# 4. Schema System (Extensibility Engine)

Schemas live in:

```
custom_components/.../schemas/widgets/*.json
```

Schemas define:

- editable properties
- UI inspector fields
- ESPHome YAML mapping

Example:

```json
"esphome": {
  "root_key": "label",
  "props": { "text": "text" }
}
```

Meaning:

Editor property → YAML property.

### WHY THIS EXISTS

Without schemas:
- every widget requires compiler code

With schemas:
- adding widgets = editing JSON only

Cursor should ALWAYS extend schemas first.

---

# 5. Hardware Recipes

Hardware recipes describe physical display devices.

They contain:

- display driver
- touch controller
- pins
- PSRAM config
- board settings

They include markers:

```
#__LVGL_PAGES__
#__HA_BINDINGS__
#__USER_YAML_PRE__
#__USER_YAML_POST__
```

Compiler injects generated content at these markers.

Recipes are NEVER modified at runtime.

---

# 6. Compiler Architecture

Compiler steps:

## Step 1 — Load Recipe
Base hardware YAML.

## Step 2 — Apply User Injection
Advanced user YAML merged safely.

## Step 3 — Compile HA Bindings
Generate:

```
text_sensor:
sensor:
binary_sensor:
```

using `platform: homeassistant`.

## Step 4 — Attach Live Update Triggers
Generated from `project.links[]`.

Example:

```
on_value:
  then:
    - lvgl.label.update:
```

## Step 5 — Compile LVGL Pages
Widgets → LVGL YAML.

## Step 6 — Write YAML
Saved into:

```
/config/esphome/
```

ESPHome Builder handles flashing.

---

# 7. Bindings vs Links (CRITICAL DISTINCTION)

## Bindings = DATA INPUT

Fetch HA state into ESPHome.

```
HA → ESPHome sensor
```

## Links = UI REACTION

Define what updates when data changes.

```
ESPHome sensor → LVGL widget
```

This separation enables:

- multiple widgets bound to one entity
- formatting/scaling
- reusable controls

---

# 8. Live Update System

Live updates use ESPHome triggers:

| Sensor Type | Trigger |
|------------|--------|
| sensor | on_value |
| text_sensor | on_value |
| binary_sensor | on_state |

Compiler emits LVGL update actions:

- lvgl.widget.update
- lvgl.slider.update
- lvgl.arc.update
- lvgl.label.update

This produces real‑time UI syncing equivalent to Lovelace.

---

# 9. Control Templates (Lovelace Analogue)

Controls are macro generators.

They create:

- widgets
- bindings
- links

Example:

Light control generates:

- button widget
- binary binding
- checked-state link

Controls are NOT widgets.

They are **design-time generators**.

---

# 10. Why ESPHome is the Runtime

ESPHome provides:

- OTA flashing
- HA API integration
- LVGL runtime
- device lifecycle management

This project deliberately avoids creating a custom firmware runtime.

---

# 11. HACS Integration Model

The integration is a HA Custom Integration.

Responsibilities:

- host React UI panel
- store project data
- run compiler
- expose API endpoints

HACS only installs the designer — not firmware.

---

# 12. Extension Rules (IMPORTANT FOR CURSOR)

When adding features:

### DO:
✅ extend schemas  
✅ add compiler transforms  
✅ add control templates  

### DO NOT:
❌ modify generated YAML manually  
❌ hardcode device logic into UI  
❌ bypass project model

---

# 13. Future Architecture Direction

Planned evolution:

1. Capability detection (`supported_features`)
2. Entity picker via HA websocket API (v0.24 implements a simple REST snapshot + datalist; websocket can replace it later)
3. Automatic control adaptation
4. Theme system
5. Layout auto‑flow
6. Multi‑page navigation model

## v0.24 Notes (Entity picker + lint)

- The integration exposes `/api/esphome_touch_designer/entities` which returns a compact snapshot of `hass.states.async_all()`.
- The frontend fetches that list once on load and uses it for:
  - the **Control Template wizard** (HTML `datalist` with domain filtering)
  - the **Project lint** panel (warn if bindings reference entities not present in the current snapshot)
- Lint is intentionally **advisory-only**: it does not block saving/compiling.

---

# 14. Key Insight

This system behaves like:

```
Figma
  → React editor
  → Compiler
  → Embedded runtime (LVGL)
```

NOT like Lovelace internally.

Lovelace = runtime UI  
Touch Designer = firmware UI compiler.

---

# 15. How Cursor Should Work With This Repo

Cursor should treat:

- schemas = UI language definition
- project model = AST
- compiler = code generator

Any feature request should map to one of:

1. schema change
2. compiler transform
3. control template
4. runtime binding

If a change touches more than one layer,
it must preserve this separation.

---

END OF ARCHITECTURE


---

# Version Evolution (AI Context Timeline)

This section helps AI assistants understand how the architecture evolved.

## v0.8
- Introduced HA bindings model
- ESPHome homeassistant sensors generated automatically

## v0.9
- Added live update system (links)
- LVGL widgets update via triggers
- Established Lovelace-like reactive behaviour

## v0.9.1
- Added deep architecture documentation for AI reasoning

## v0.9.2
- Introduced CONTRIBUTING_AI.md
- Formalised AI development rules and layer separation

Future versions must append entries here when architecture changes.

---


## v0.9.3
- Added AI_TASK_PATTERNS.md defining canonical implementation workflows for AI contributors.


## v0.10.0
- Canvas editor upgraded: multi-select, grid snapping, undo/redo history, and z-order controls.


## v0.11.0
- Added design-time HA entity listing API + UI binding builder to generate bindings/links from an entity picker.


## v0.12.0
- Added full HA domain control templates (light/climate/cover/media_player) that generate widgets + bindings + links + actions.
- Added support for user-provided hardware recipes in `/config/esphome_touch_designer/recipes`.


## v0.13.0
- Added hardware recipe pack system enabling external hardware libraries (e.g. EnhancedESPHomeGUI) without duplication.


## v0.14.0
- Added built-in hardware recipe for Waveshare ESP32-P4-WIFI6-Touch-LCD-4C (720x720).

## v0.15.0
- Compiler now omits null/None values when emitting YAML (prevents `text: null` style errors).
- New widgets only apply defaults when explicitly provided and non-null.
- Inspector adds a per-field **clear** action that removes the property from the stored model.
- Fixed Canvas selection plumbing (single + Shift additive + click-empty to clear) to consistently use `selectedWidgetIds`.

## v0.16.0
- Canvas now renders **lightweight visual previews** for some LVGL widgets (label/button/slider/arc).
  - This is not intended to be a pixel-perfect LVGL renderer.
  - The compiler remains the authoritative mapping to ESPHome YAML.

## v0.17.0
- Canvas previews are now **style-aware**: common schema style properties (bg/border/opacity/font/text colour) influence the Konva render.
- Added **multi-page** support at the project-model UX level (page selector + add page). The compiler model already supported pages; the UI now exposes them.

## v0.18.0
- Added **containers + grouping**: selected widgets can be grouped into a `container` and later ungrouped.
- Introduced a parent/child model using `parent_id` with **relative coordinates** for children.
- Compiler now emits **nested LVGL YAML** (child widgets under `widgets:`) for container hierarchies.
- Added basic **z-order controls** (bring forward / send backward) for selected widgets.

## v0.19.0
- Added **undo/redo** controls and keyboard shortcuts.
- Added **copy/paste** for widgets (Ctrl/Cmd+C, Ctrl/Cmd+V) and a Delete shortcut.

## v0.20.0
- Improved the property inspector widgets: **color picker** support (schema type `color`) and **range sliders** for bounded numeric properties.
- Updated widget schemas so common `*_color` properties are typed as `color` (improves editing UX without changing compilation output).

## Designer drag/drop payloads (v0.21)

The canvas supports HTML5 drag/drop using custom MIME types:

- `application/x-esphome-widget-type`: a single LVGL widget type (e.g. `label`, `button`).
- `application/x-esphome-control-template`: a multi-widget macro (e.g. `ha_light_full`).

On drop, the frontend converts the payload to a `onDropCreate(payload, x, y)` call:

- Raw widget types are inserted as a single widget on the active page.
- Control templates expand to multiple widgets and also append to `project.bindings[]` and `project.links[]`.

## Container clipping in preview (v0.21)

LVGL supports a variety of layout and clipping behaviours. Until we have a faithful LVGL renderer in the designer, the preview supports a single designer-only flag:

- `container.props.clip_children: true|false`

When true, the Konva preview clips the container's children to the container rectangle.

This flag is **not** emitted to ESPHome YAML (it is intentionally not mapped in the widget schema's `esphome.props`).

## Control template post-drop wizard (v0.22)

To reduce user error (most templates require a valid `entity_id`), v0.22 changes template drop behaviour:

- Dropping a payload of the form `tmpl:<template_id>` no longer expands immediately.
- Instead the designer opens a lightweight modal (wizard) asking for:
  - `entity_id` (string)
  - `label` (optional override used by templates that render a title)

On confirmation, the wizard:

1) Calls the template's `build()` function using the entered `entity_id` and the drop coordinates.
2) Remaps all widget ids to fresh unique ids.
3) Remaps any `links[].target.widget_id` that referenced the template's original widget ids.
4) Appends `widgets`, `bindings`, and `links` into the active page/project.

### v0.25.0
Multiline string emission:
- Any widget prop/style/event value containing newlines is emitted as a YAML block scalar `|-`.
- This is primarily used for LVGL widget `events` fields that contain ESPHome action YAML.

### v0.25.0
Multiline string emission:
- Any widget prop/style/event value containing newlines is emitted as a YAML block scalar `|-`.
- This is primarily used for LVGL widget `events` fields that contain ESPHome action YAML.

### v0.26.0
Schema expansion strategy:
- We add commonly requested LVGL style keys incrementally to the widget schema JSON.
- The frontend Inspector is schema-driven, so new keys automatically appear without UI code changes.

### v0.27.0
Assets v1:
- Stored under `/config/esphome_touch_designer_assets/` on the HA host.
- Reference in widgets via `props.src: "asset:<filename>"`.
- Compiler emits `image:` entries with `file:` pointing at that folder and stable `id:` values.

### v0.28.0
Recipe validation:
- POST `/api/esphome_touch_designer/recipes/validate` with `{recipe_id}` returns `issues[]`.
- Validation is best-effort; it does not compile firmware, it checks YAML structure and recommended markers.

### v0.29.0
Export:
- POST `/api/esphome_touch_designer/devices/<id>/export` writes `/config/esphome/<slug>.yaml`.
- This is intentionally simple (no ESPHome compile trigger yet); it makes ESPHome UI deploy trivial.

### v0.30.0
Canvas drag/drop:
- MIME `application/x-esphome-touch-designer-widget` carries `{type}`.
- Canvas drop handler creates a default widget at the drop point.

### v0.31.0
Layout preview:
- Containers may set `props.layout: flex_row|flex_col` and optional `props.gap`.
- Canvas computes derived child x/y positions at render-time for preview only (compiler still uses stored geometry).

### v0.32.0
HA capability endpoint:
- GET `/api/esphome_touch_designer/ha/entities/<entity_id>/capabilities`
- Returns {attributes, supported_features, services}. Frontend can use this to tailor templates.

### v0.33.0
Plugins:
- Folder: `/config/esphome_touch_designer_plugins/`
  - `controls/*.json`: macro/snippet definitions (widgets/bindings/links/actions)
  - `widgets/*.json`: widget schema additions/overrides
- Endpoint: GET `/api/esphome_touch_designer/plugins`


### UI loop avoidance (v0.45.0)
The compiler emits a `globals:` variable `etd_ui_lock_until` and injects a short lock window (default 500ms) before Home Assistant service calls from UI events. HA-driven updates skip LVGL updates while the lock is active to reduce feedback loops.


## CURRENT STATE

- v0.53 baseline: HA control templates, multi-page projects, assets pipeline v1, deployment/export with safe merge markers, and schema-driven inspector.
- v0.57.1: Adds parity templates (switch/lock/alarm/select/number + input_* helpers) and Card Library v1 (entity_card + tile_card) as container macros.

## NEXT STEPS

- Card Library Phase 2: thermostat card, media control card, cover card, glance/grid card, and layout helper cards.
- Extend schema coverage for LVGL properties and advanced sections (validation + defaults).
- Improve deterministic YAML export (stable ordering, stable IDs for reproducible builds).
- Hardware recipe validation v2 + import/export UX polish.


## Code Map

- Backend integration root: `custom_components/esphome_touch_designer/`
- Frontend source: `frontend/`
- Built frontend served by HA: `custom_components/esphome_touch_designer/web/dist/`
- Backend APIs: `custom_components/esphome_touch_designer/api/`
- Storage: `custom_components/esphome_touch_designer/storage.py`
- Recipes: `custom_components/esphome_touch_designer/recipes/` (builtin) and `/config/esphome_touch_designer/recipes/user/` (user)
