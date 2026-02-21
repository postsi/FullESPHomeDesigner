# Cursor Onboarding

This repository contains a Home Assistant (HA) custom integration that provides an in-HA drag/drop LVGL UI designer for ESPHome touch devices.

## Where to start

1. Read `docs/PROJECT_CONTEXT.md` (what we’re building + rules of the road).
2. Read `docs/INVARIANTS.md` (must-not-break guarantees).
3. Read `docs/DEV_WORKFLOW.md` (how to build + run in HA).
4. Use `docs/FEATURE_MAP.md` to locate cards/templates and where they’re implemented.

## Repo layout (high level)

- `custom_components/esphome_touch_designer/`
  - HA integration (backend)
  - serves the panel + static frontend assets
  - provides REST endpoints used by the frontend
  - owns storage + export to `/config/esphome/<slug>.yaml` (safe-merge markers)
- `frontend/`
  - React + Vite app (the Designer UI)
  - source of all UI: canvas, inspector, wizard, cards/templates
  - must be built into `custom_components/esphome_touch_designer/web/dist/`
- `docs/`
  - architecture, roadmap, decisions, and the Cursor onboarding pack

## Key concepts

- **Project**: stored in HA storage; represents pages/widgets/bindings.
- **Hardware recipe**: device YAML “base” that contains an LVGL insertion marker.
- **Cards**: container macros built from LVGL widgets + bindings (Lovelace-style).
- **Deterministic compile**: same project -> identical YAML output (byte stable).
- **Safe merge export**: only replace content inside designer marker block in target YAML.

## Most common Cursor tasks

- Add/modify a card: see `frontend/src/controls` and `docs/FEATURE_MAP.md`.
- Change compile/export behavior: see backend `api/` and `storage.py` / export utilities.
- Add new hardware recipes: see `custom_components/.../recipes` and `docs/HARDWARE_RECIPES.md`.
