# Feature Map

## Backend (HA integration)
- Panel/static serving: `custom_components/esphome_touch_designer/panel.py`, `custom_components/esphome_touch_designer/web/dist/`
- API endpoints: `custom_components/esphome_touch_designer/api/`
- Storage: `custom_components/esphome_touch_designer/storage.py`
- Export/safe-merge: backend export utilities in `api/` and related helpers
- Recipes (builtin): `custom_components/esphome_touch_designer/recipes/`
- Schemas: `custom_components/esphome_touch_designer/schemas/`

## Frontend (React/Vite)
- App shell/routes: `frontend/src/App.tsx` (or equivalent entry)
- Canvas rendering: Konva components under `frontend/src/...`
- Inspector: `frontend/src/.../Inspector*`
- Controls/Templates registry: `frontend/src/controls/index.ts` (cards + HA parity templates)
- Wizard: `frontend/src/.../Wizard*`
- Compile tab: `frontend/src/.../Compile*`

## Cards (Lovelace-style)
- Entity/Tile cards: in controls registry
- Phase 2: thermostat, media control, cover, glance, grid, layout helpers
- Conditional: conditional wrapper card

## Hardware recipes
- Built-in library shipped with integration
- User recipes saved under `/config/esphome_touch_designer/recipes/user/<slug>/`
- Importer normalizes raw device YAML into a recipe + metadata
