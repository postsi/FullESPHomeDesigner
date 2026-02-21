# Cursor Handoff — ESPHome Touch Designer (v0.3.0)

This repo is a fresh HA integration + React/Vite panel. It is the **foundation** for a full drag/drop ESPHome LVGL designer.

Read first:
- `docs/ARCHITECTURE.md`

## What works now
- Create/list/delete devices
- Load and save a per-device **Project Model**
- Add widgets (label/button/arc/slider/dropdown)
- Edit properties in a **schema-driven property inspector**
- Deploy stub YAML into `/config/esphome/<slug>.yaml`

## Build frontend
```bash
cd frontend
npm install
npm run build
```

## Next milestones
1) Add drag/drop canvas with Konva (x/y/w/h editing visually)
2) Hardware recipe loader from `/config/esphome_touch_designer/hardware/`
3) Real compiler emitting ESPHome LVGL YAML
4) Realtime HA websocket preview
5) Controls/macros (Thermometer, Thermostat)

Generated: 2026-02-16 19:11 UTC


v0.4 adds Konva drag/drop canvas.
