# ESPHome Touch Designer — Project Context (Authoritative)

## Goal
Build a Home Assistant custom integration (HACS compatible) that provides a drag/drop LVGL UI designer for ESPHome touchscreen devices.

The integration:
- Runs fully inside Home Assistant (backend integration + web UI panel).
- Stores projects/devices in HA storage.
- Exports deterministic ESPHome YAML into `/config/esphome/<slug>.yaml`.
- Uses safe merge markers so user YAML outside the block is preserved:
  - `# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---`
  - `# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---`

Frontend:
- React + Vite
- Konva canvas rendering (approximate LVGL preview)

Design principles:
- Schema-driven Inspector showing typed editors and validation.
- Templates/cards compile to LVGL widgets + HA bindings.
- Extensible via schemas/plugins.

## “Bullet Proof” Definition (Personal-use target)
Bullet proof means **all three** are satisfied:

1. **No data loss**
   - Projects must not silently corrupt.
   - Storage validation + migrations exist.
   - Project JSON export/import works (backup/restore).

2. **Deterministic & safe YAML export**
   - Same project → byte-identical YAML output.
   - Export only modifies content inside safe markers.
   - Duplicate/malformed markers abort safely with clear error.
   - YAML preview exists (Compile tab) before writing.

3. **Reliable HA binding engine**
   - Gracefully handles `unknown/unavailable/none` and HA reconnect.
   - Entity rename/remove does not crash the UI.
   - Loop suppression exists and is diagnosable.

## Development strategy (dual-lane)
We run two lanes:

- **Lane A — Stability Core (non-negotiable for release)**
  Deterministic export, binding robustness, project integrity, crash resistance, diagnostics.

- **Lane B — Feature Expansion**
  Card Library Phase 2+ and UX improvements. These continue, but must not bypass Lane A guarantees.

A “physical release” (tag/HACS) is only done once Lane A is complete, even if Lane B continues.

## Baseline
Current authoritative baseline for this chat thread:
- v0.57.1-built (prior)
- Current work product: v0.58.0 (Lane A implementation)


## Current baseline

- Baseline zip: v0.70.0
- Cursor onboarding: see `docs/CURSOR_ONBOARDING.md`
- Invariants: see `docs/INVARIANTS.md`
