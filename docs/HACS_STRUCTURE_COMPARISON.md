# HACS Structure Comparison

## Standard structure (blueprint, HACS docs)

```
custom_components/<domain>/
├── __init__.py
├── config_flow.py
├── manifest.json
├── ... (other integration files)
README.md
hacs.json
```

- **No** manifest.json at repo root
- **No** content_in_root (default: integration lives in custom_components/)
- **No** zip_release for basic installs

## Our structure (before fix)

```
manifest.json          ← ANOMALY: not in standard, confuses HACS
custom_components/esphome_touch_designer/
├── __init__.py
├── config_flow.py
├── manifest.json
├── ...
README.md
hacs.json
```

**Problems:**
1. **Root manifest.json** – With `content_in_root: true`, HACS treats the repo root as the integration directory and copies it. Our integration files live in `custom_components/esphome_touch_designer/`, so root only has `manifest.json`, `hacs.json`, `frontend/`, `docs/`, etc. HACS would copy that instead of the real integration, so `config_flow.py` never gets installed.
2. **content_in_root: true** – Used when the integration is at the root. Our layout is the standard one, so this should be false or omitted.
3. **zip_release** – Was added as a workaround instead of fixing the layout.

## Fix

1. Remove root `manifest.json`
2. Remove `content_in_root` and `zip_release` (use standard layout)
3. Keep `custom_components/esphome_touch_designer/` as-is
