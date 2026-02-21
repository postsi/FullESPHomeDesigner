
# AI_TASK_PATTERNS.md
## Canonical Implementation Patterns for ESPHome Touch Designer

This document provides **repeatable patterns** AI assistants should follow
when implementing new features.

These patterns prevent architectural drift and ensure consistency.

---

# Pattern 1 — Add a New LVGL Widget Capability

### Goal
Expose a new LVGL property or feature in the designer.

### Steps
1. Extend widget schema:
   `schemas/widgets/<widget>.json`

2. Add property definition:
   - type
   - default
   - editor label
   - mapping under `esphome.props` or `esphome.style`

3. Only modify compiler if transformation is required.

### NEVER
- Hardcode property into React UI.
- Inject YAML directly.

Schemas define the language.

---

# Pattern 2 — Add a New Home Assistant Control

Controls are **macros**, not widgets.

### Steps
1. Add template in:
   `frontend/src/controls/index.ts`

2. Control must generate:
   - widgets[]
   - bindings[]
   - links[]

3. Use existing LVGL widgets only.

### Example Output
- Toggle button
- Slider
- Status label

---

# Pattern 3 — Add Live Reactive Behaviour

Reactive behaviour uses:

```
homeassistant.* sensors
 → triggers
 → lvgl.*.update actions
```

### Steps
1. Add binding (data source).
2. Add link (UI reaction).
3. Compiler emits trigger.

### NEVER
- Add polling timers.
- Query HA directly from frontend.

---

# Pattern 4 — Add Hardware Device Support

### Steps
1. Create recipe YAML in:
   `recipes/builtin/`

2. Include markers:

```
#__LVGL_PAGES__
#__HA_BINDINGS__
```

3. Do NOT modify recipes dynamically.

---

# Pattern 5 — Extend Compiler Behaviour

Compiler must remain:

- deterministic
- stateless
- idempotent

### Valid reasons:
- new schema mapping
- new link action
- new control output

### Invalid reasons:
- UI convenience logic
- device-specific hacks

---

# Pattern 6 — Add New HA Domain Support

1. Extend domain presets:
   `frontend/src/bindings/domains.ts`

2. Add recommended bindings.

3. Optionally create control template.

Domains are data definitions — not runtime logic.

---

# Pattern 7 — Documentation Update (MANDATORY)

Whenever architecture changes:

Update:

- ARCHITECTURE.md
- CONTRIBUTING_AI.md
- RELEASE_NOTES.md
- AI_TASK_PATTERNS.md

---

# Pattern 8 — Safe AI Workflow

Before coding, AI should ask:

1. Is this a schema change?
2. Is this a compiler change?
3. Is this a control macro?
4. Is this UI-only?

If none apply → redesign approach.

---

END OF AI_TASK_PATTERNS.md


# Pattern 9 — Add or Modify Canvas Editing Behaviour

### Rule
Canvas must remain a pure editor:
- It may keep short-lived interaction refs (drag start positions, transformer refs)
- All persistent state lives in the project model

### Steps
1. Add interaction in `Canvas.tsx`
2. Apply changes via a single bulk patch callback (`onChangeMany`) so history commits are correct
3. Add keyboard shortcuts in `App.tsx` only

---


# Pattern 10 — Add or Improve Entity Picker / Binding Builder

### Goal
Improve design-time binding UX without breaking the compiler model.

### Steps
1. Add backend endpoint in `custom_components/.../api/views.py` using `hass.states.async_all()`.
2. Add frontend API wrapper in `frontend/src/lib/api.ts`.
3. Build UI that generates only **project.bindings[]** and **project.links[]**.
4. Never introduce runtime polling in firmware; design-time refresh/polling is acceptable.

---


# Pattern 11 — Add / Improve Lovelace-Equivalent HA Controls

### Goal
Build a control that behaves like a Lovelace card but compiles into LVGL + ESPHome actions.

### Rules
- A control MUST generate: widgets[] + bindings[] + links[]
- Use `homeassistant.action` for all commands.
- Use links for live updates (no polling firmware loops).

### Steps
1. Identify entity_id + relevant attributes
2. Add bindings for attributes/state
3. Add links mapping attributes/state -> widget properties
4. Add widget events calling HA services
5. Update docs and release notes

---


## Pattern: Palette drag → Canvas drop (v0.16.0)
- Drag payload: `application/x-esphome-widget-type` set to the schema `type` string.
- Canvas drop handler translates client coords into canvas coords using container bounding rect.
- Create widget with default size (120x48) and empty props/style/events.

---

## Pattern: Group / Ungroup (v0.18.0)

### Goal
Allow users to group widgets into a `container` so layouts can be moved/managed as a unit, while still compiling to valid nested LVGL YAML.

### Key implementation details
- Project model uses `parent_id` on child widgets.
- Child widget `x/y` are **relative to the parent**.
- Compiler builds a tree and emits nested `widgets:` blocks.

### Group algorithm
1. Ensure selection has the same `parent_id`.
2. Compute bounding box of selected widgets in **absolute** coordinates.
3. Create a new `container` at that bounding box (in parent space).
4. Re-parent each selected widget, converting `x/y` to container-relative.

### Ungroup algorithm
1. Select a `container`.
2. Convert each child `x/y` back into parent space (absolute → parent-relative).
3. Remove the container.

---

## Pattern: Editor shortcuts (v0.19.0)

- Undo: Ctrl/Cmd+Z
- Redo: Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
- Copy: Ctrl/Cmd+C
- Paste: Ctrl/Cmd+V
- Delete: Del / Backspace
- Group: Ctrl/Cmd+G
- Ungroup: Ctrl/Cmd+Shift+G
- Z-order: Ctrl/Cmd+[ and Ctrl/Cmd+]
