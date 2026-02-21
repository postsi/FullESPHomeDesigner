# Invariants (Must Not Break)

These are the non-negotiable guarantees for the project. If you change code, ensure these remain true.

## 1) Deterministic compile
- Same project input -> identical YAML output.
- Stable ordering for pages, widgets, assets, bindings.
- Stable IDs: no randomness during compile.

## 2) Safe merge export
Export to `/config/esphome/<slug>.yaml` MUST:
- Only modify content inside:

  `# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---`
  `# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---`

- Abort safely with a clear error if:
  - markers are duplicated
  - markers are malformed
  - marker order is invalid

## 3) No silent failures
- Backend errors should be visible in HA logs AND surfaced in UI where relevant.
- Frontend should use error boundaries; show actionable messages.

## 4) Binding stability
- Handle HA entity states: `unknown`, `unavailable`, `none`.
- Binding loop suppression must prevent feedback loops.
- Debounce/throttle prevents update storms.

## 5) Recipe integrity
- Every hardware recipe MUST include an LVGL insertion marker (e.g. `#__LVGL_PAGES__`).
- Importer “normalization” must not produce invalid ESPHome YAML.
- Validation must warn users when recipe is incomplete or risky (PSRAM, missing display, etc.).

## 6) Backward compatibility
- Legacy recipe folder format remains readable.
- Existing stored projects must load; migrations must be explicit if schema changes.
