# Testing

All tests run **without** deploying the custom integration on a Home Assistant server.

## Run everything (recommended)

From repo root:

```bash
./scripts/run_all_tests.sh
```

This runs:

1. **Python (pytest)** — `pytest tests/` — compiler, storage, sections, merge, safe-merge, widget/binding checks.
2. **Frontend (Vitest)** — `cd frontend && npm run test` — arc geometry, arc indicator color, prebuilt spinbox.

Install Python test deps first (optional for esphome config validation):

```bash
pip install -r scripts/requirements.txt
```

## Backend (Python)

- **Runner:** pytest. No Home Assistant runtime required; HA modules are mocked in `tests/conftest.py`.
- **Location:** `tests/` — all `test_*.py` files.
- **Run:** `python3 -m pytest tests/ -v` from repo root.

**What’s covered:**

- **test_compile.py** — Compiler E2E: empty device, jc1060 recipe, no API key, color picker, stored esphome + manage_run_and_sleep. YAML validation; optional `esphome config` when `esphome` is on PATH.
- **test_spinbox_compile.py** — Native spinbox (no +/- buttons) and prebuilt spinbox with +/- buttons.
- **test_action_yaml.py** — Preview event_snippets (auto/edited/empty), parse !lambda/!secret, compile uses stored override.
- **test_components_sections.py** — Section helpers, recipe parse, default pieces, ensure+compile, legacy migration, LVGL widget YAML.
- **test_components_panel_and_merge.py** — section_overrides ignored, merge sensor/switch, overridden_keys, orphan removal and warnings.
- **test_compile_split_fail.py** — Malformed recipe (leading space before `esphome:`) still yields valid output.
- **test_widget_binding_verification.py** — Canvas covers all compilable types; App liveOverrides handle all display actions; bindingConfig widget types ⊆ compilable.
- **test_storage.py** — `_default_project` and `_migrate_project` (defaults, migration, unknown fields).
- **test_safe_merge_markers.py** — Export safe-merge marker behaviour (insert, replace, duplicate/order errors).
- **test_compiler_helpers.py** — Pure helpers: `_safe_id`, `_slugify_entity_id`, `_esphome_safe_page_id`, `_hex_color_for_yaml`, `_yaml_quote`, `_split_esphome_block`, `_section_full_block`/`_section_body_from_value`, `_validate_recipe_text`, `_extract_recipe_metadata` / `_extract_recipe_metadata_from_text`, `_read_recipe_file`, `_default_wifi_yaml`, `_default_logger_yaml`.
- **test_compile_widgets_and_bindings.py** — Compile with one widget per type (label, button, switch, slider, bar, arc, dropdown, led, checkbox) and with display bindings (label_text, arc_value, bar_value, widget_checked) so `_compile_ha_bindings` and `_emit_widget_from_schema` paths are exercised.

To add a backend test: add a `test_*.py` module under `tests/` and use fixtures from `tests/conftest.py` (`make_device`, `default_project`, `jc1060_recipe_text`) as needed.

## Frontend

- **Runner:** Vitest. No HA server; tests are unit tests (arc geometry, indicator color, prebuilt widgets).
- **Location:** `frontend/src/**/*.test.ts` (and `*.test.tsx`).
- **Run:** `cd frontend && npm run test`.

Tests include:

- Arc drawing (rotation, start/end angles, pointerAngleToValue).
- Arc indicator color (defaults, indicator.bg_color).
- Prebuilt spinbox with +/- buttons structure.
- **bindings/bindingConfig.test.ts** — `domainFromEntityId`, `getDisplayActionsForType`, `getEventsForType`, `getServicesForDomain`, and coverage of `DISPLAY_ACTIONS_BY_WIDGET_TYPE` / `EVENTS_BY_WIDGET_TYPE`.
- **bindings/matchingActions.test.ts** — `getMatchingActionBindings` (light brightness, climate temperature, switch toggle, dropdown HVAC mode), and constants (`INPUT_WIDGET_TYPES`, `OPTION_SELECT_WIDGET_TYPES`, `CLICK_TOGGLE_WIDGET_TYPES`, `SELECT_OPTION_TEXT_SENTINEL`).

Before changing arc or binding behaviour, run `npm run test` and fix any failures.

## Widget/binding consistency

The Python test `test_widget_binding_verification.py` ensures:

- Every type in `COMPILABLE_WIDGET_TYPES` (backend) has a render branch in `Canvas.tsx`.
- Every display action used in `bindingConfig.ts` is handled in `App.tsx` `liveOverrides`.
- Every widget type in `DISPLAY_ACTIONS_BY_WIDGET_TYPE` / `EVENTS_BY_WIDGET_TYPE` is in `COMPILABLE_WIDGET_TYPES`.

When adding a new widget type or display action, update both backend and frontend so this test still passes.

## Built-in self-check (UI)

When the integration is loaded in HA, use the UI self-check/diagnostics to validate:

- Recipe discovery
- Deterministic compile (compile twice, diff = 0)
- Safe-merge marker validation

## Recommended golden projects

Maintain a few representative projects for regression:

- Minimal page + label
- entity_card + tile_card
- Thermostat/media/cover cards
- Grid/glance cards
- Conditional card

For each: compile output stable (byte-identical), export preview/diff correct, export write uses safe-merge markers only.

## Manual smoke checklist (before a release)

1. Panel loads with no console errors
2. Drag/drop basic widgets works
3. Inspector edits reflect on canvas
4. Compile tab updates live while editing
5. Export preview shows diff
6. Export writes only inside marker block
7. Recipe manager: import/clone/export/delete works
8. Cards: drop → wizard → bindings behave
