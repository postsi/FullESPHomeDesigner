# ESPHome Touch Designer (v0.71.25)

A Lovelace-style UI designer for ESP32 LVGL touch screens. Compiles designs into ESPHome YAML and deploys through Home Assistant.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CURSOR_HANDOFF.md](docs/CURSOR_HANDOFF.md), [docs/WIDGET_SIMULATOR_BINDINGS.md](docs/WIDGET_SIMULATOR_BINDINGS.md) (canvas/simulator and HA binding matrix), and [docs/COMPONENTS_AND_CREATE_COMPONENT.md](docs/COMPONENTS_AND_CREATE_COMPONENT.md) (Components panel and Create component from Binding Builder).

## Install via HACS (custom repository)

1. In HACS, go to **Integrations** → **⋮** (menu) → **Custom repositories**
2. Add: `https://github.com/postsi/FullESPHomeDesigner`
3. Category: **Integration**
4. Search for "ESPHome Touch Designer" and install
5. Restart Home Assistant

## Deploy straight into HA (no HACS)

To install or update the integration directly from this repo (e.g. after a local build, without going through HACS):

1. **Prerequisites:** Home Assistant reachable via SSH (e.g. **SSH & Web Terminal** add-on). On HA OS, the config path is `/config`.

2. **One-time:** Ensure the frontend is built and you can SSH into your HA host:
   ```bash
   cd frontend && npm install && npm run build
   ```

3. **Deploy:**
   ```bash
   HA_HOST=homeassistant.local ./scripts/deploy_to_ha.sh
   ```
   Or with IP and user:
   ```bash
   HA_HOST=192.168.1.10 HA_SSH_USER=root ./scripts/deploy_to_ha.sh
   ```

4. **Reload:** In HA go to **Developer Tools** → **YAML** → **Reload**: *ESPHome Touch Designer*, or restart Home Assistant.

Optional env: `HA_CONFIG_PATH` (default `/config`), `SKIP_BUILD=1` (skip `npm run build`), `RSYNC_OPTS` (e.g. `--delete` to remove stale files on the host).

