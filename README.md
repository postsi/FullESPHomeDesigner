# ESPHome Touch Designer (v0.70.0)

A Lovelace-style UI designer for ESP32 LVGL touch screens. Compiles designs into ESPHome YAML and deploys through Home Assistant.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CURSOR_HANDOFF.md](docs/CURSOR_HANDOFF.md).

## Install via HACS (custom repository)

1. In HACS, go to **Integrations** → **⋮** (menu) → **Custom repositories**
2. Add: `https://github.com/postsi/FullESPHomeDesigner`
3. Category: **Integration**
4. Search for "ESPHome Touch Designer" and install
5. Restart Home Assistant

## Configure via configuration.yaml

If Home Assistant says the integration must be added via config.yaml (e.g. when not yet in the brands repo), add this to your `configuration.yaml`:

```yaml
esphome_touch_designer: {}
```

Then restart Home Assistant. The panel will appear in the sidebar.
