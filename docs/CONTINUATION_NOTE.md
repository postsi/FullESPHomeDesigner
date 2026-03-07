# Continuation note for new chat

**Copy the section below into a new Cursor chat when you want to continue work on this project.**

---

## Project: ESPHome Touch Designer

**Current version:** v0.70.142 (see `custom_components/esphome_touch_designer/manifest.json`, `frontend/package.json`, `README.md`).

**Repo:** ESPHome Touch Designer – Home Assistant integration for designing LVGL UIs for ESPHome devices. Frontend is React + Konva; backend is Python (Home Assistant custom component). Compiles a JSON project into ESPHome YAML.

### Recently completed (this session)

- **Full widget YAML preview:** Widget Inspector → YAML tab now shows the exact compiler output for the selected widget (all props e.g. arc min_value/max_value/start_angle, style, and action bindings like on_release → climate.set_temperature). Backend: `_preview_widget_yaml()` and `POST /api/esphome_touch_designer/preview-widget-yaml` in `custom_components/esphome_touch_designer/api/views.py`. Frontend calls `previewWidgetYaml()` from `frontend/src/lib/api.ts` and displays result in the YAML tab; includes Loading, Retry on error, and "Refresh preview" button.
- **Custom YAML system (Level 1 & 2):** Level 1 = Widget YAML tab with generated preview + Custom Events (on_click, on_value, etc.) stored in `widget.custom_events`; Level 2 = Components panel (toolbar button) to add custom sensors, intervals, scripts etc. via `project.user_components`. Compiler merges `user_components` and emits `widget.custom_events` in views.py.
- **Custom cards:** Right-click context menu on Card Library custom cards to delete them (`deleteCard` API).
- **Prebuilt widgets:** Native ESPHome bindings (WiFi signal, IP, HA connection, clock, date/time, nav bar/back button with lvgl.page.*). Prebuilts return `esphome_components`; compiler deduplicates and injects.
- **Cursor rule:** `.cursor/rules/version-and-release.mdc` – always run the full release workflow after code changes (bump version in manifest.json, package.json, README.md, RELEASE_NOTES.md; `npm run build` in frontend; commit, push, tag vX.YY.ZZ, `gh release create`).

### Key paths

- **Backend (compiler, API):** `custom_components/esphome_touch_designer/api/views.py`
- **Frontend app:** `frontend/src/App.tsx`
- **Prebuilt widgets:** `frontend/src/prebuiltWidgets/index.ts`
- **API client:** `frontend/src/lib/api.ts`
- **Release notes:** `docs/RELEASE_NOTES.md`
- **This note:** `docs/CONTINUATION_NOTE.md`

### Release workflow (do after code changes)

1. Bump version in `manifest.json`, `frontend/package.json`, `README.md` (first line), and add heading in `docs/RELEASE_NOTES.md`.
2. `cd frontend && npm run build`
3. `git add -A && git commit -m "vX.YY.ZZ: description" && git push origin main`
4. `git tag vX.YY.ZZ && git push origin vX.YY.ZZ`
5. `gh release create vX.YY.ZZ --title "vX.YY.ZZ: ..." --notes "..."`

### What to say in the new chat

You can paste this file or say something like:

> "I'm working on ESPHome Touch Designer (v0.70.142). See docs/CONTINUATION_NOTE.md for context. [Then describe your new task.]"

---

*Last updated: after v0.70.142 release.*
