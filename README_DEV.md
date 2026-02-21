# Developer Quickstart (for Cursor)

## Build frontend
```bash
cd frontend
npm ci
npm run build
```

Confirm build output exists at:
`custom_components/esphome_touch_designer/web/dist/`

## Install into HA
Copy `custom_components/esphome_touch_designer/` into your HA `/config/custom_components/`.

Restart HA.

## Use
Open the Designer panel from HA sidebar.
