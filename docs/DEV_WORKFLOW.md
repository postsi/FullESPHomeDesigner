# Developer Workflow (HA + Frontend)

## Prereqs
- Node.js (LTS) + npm
- Home Assistant dev instance (or your live instance for personal use)

## Build frontend into HA-served folder

From repo root:

```bash
cd frontend
npm ci
npm run build
```

The build MUST output to:

`custom_components/esphome_touch_designer/web/dist/`

If your build outputs elsewhere, update the Vite config/build script so HA always serves the latest build.

## Install into Home Assistant

Copy the integration folder into HA config:

```text
/config/custom_components/esphome_touch_designer/
```

Then restart Home Assistant.

## Open the Designer

HA sidebar should show the panel entry for the designer (created by the integration).

## Typical edit loop

1. Edit frontend code in `frontend/src/...`
2. Rebuild (`npm run build`)
3. Hard refresh the browser (and/or clear cache if you changed assets)
4. If you changed backend Python, restart HA.

## Export loop (recommended)

1. Use **Compile** tab (live compile)
2. Use **Deployment** preview/diff
3. Export (safe merge markers enforced)

## Where recipes live

- Built-in: inside integration under `custom_components/.../recipes/...`
- User (v2): `/config/esphome_touch_designer/recipes/user/<slug>/`
- Legacy (supported): `/config/esphome_touch_designer/recipes/*.yaml`
