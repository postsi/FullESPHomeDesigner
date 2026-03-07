# ESPHome top-level YAML keys (allowable section names)

There is no single official “list of all allowable ESPHome keywords” published by ESPHome. Keys are defined per component in the source. This list is derived from the [ESPHome Components Index](https://esphome.io/components/index.html) (each component’s URL path gives a top-level key) and from built-in recipes in this repo.

Use this for the **section-based Components panel** and **canonical compile order**. You can start with a **curated subset** (e.g. keys used in recipes + compiler) and expand over time.

---

## UI categories (expand/collapse)

For the Components panel, use **two-level expand/collapse**:

1. **Category** (e.g. "Device & platform") — user expands to see which sections exist.
2. **Section** (e.g. `wifi`, `sensor`) — user expands to see/edit that section’s YAML.

That keeps the list scannable: ~10–12 category headers instead of 80+ section names. Section keys are grouped by how users think about the config.

| Category | Section keys (order preserved for compile) |
|----------|--------------------------------------------|
| **Device & platform** | `esphome`, `esp32`, `esp8266`, `rp2040`, `libretiny`, `host`, `nrf52`, `esp32_hosted`, `psram`, `esp_ldo`, `deep_sleep`, `preferences` |
| **Configuration** | `packages`, `substitutions`, `external_components` |
| **Network** | `wifi`, `ethernet`, `openthread`, `network`, `api`, `ota`, `logger`, `mdns`, `captive_portal`, `web_server`, `mqtt`, `espnow`, `http_request`, `wireguard`, `statsd`, `udp`, `packet_transport`, `zigbee` |
| **Bluetooth** | `esp32_ble_beacon`, `ble_client`, `esp32_ble_tracker`, `esp32_ble_server`, `bluetooth_proxy`, `ble_nus`, `esp32_improv`, `improv_serial` |
| **Busses & interfaces** | `one_wire`, `canbus`, `i2c`, `spi`, `uart`, `i2s_audio`, `opentherm`, `tinyusb`, `usb_cdc_acm`, `usb_host`, `usb_uart` |
| **Display & touch** | `display`, `touchscreen`, `font`, `image`, `graph`, `qr_code`, `animation`, `online_image`, `display_menu`, `output`, `light`, `lvgl` |
| **Automation & logic** | `globals`, `interval`, `time`, `script`, `json`, `mapping`, `xxtea`, `copy`, `demo`, `factory_reset`, `event` |
| **Sensors & entities** | `sensor`, `text_sensor`, `binary_sensor`, `switch`, `button`, `number`, `select`, `lock`, `cover`, `fan`, `climate`, `media_player`, `alarm_control_panel`, `datetime`, `valve`, `water_heater`, `text` |
| **Audio** | `audio_adc`, `audio_dac`, `microphone`, `speaker` |
| **Debug & monitoring** | `debug`, `logger`, `syslog`, `prometheus`, `safe_mode`, `web_server`, `esp32_camera_web_server`, `update` |
| **I/O expanders** | `ch422g`, `ch423`, `max6956`, `mcp230xx`, `pca6416a`, `pca9554`, `pcf8574`, `pi4ioe5v6408`, `sn74hc165`, `sn74hc595`, `sx1509`, `tca9548a`, `tca9555`, `weikai`, `xl9535` |
| **Other** | `infrared`, `remote_receiver`, `remote_transmitter`, `rf_bridge`, `modbus_controller`, `esp32_camera`, `gps`, `sun`, `tuya`, `power_supply`, `servo`, `stepper`, `matrix_keypad`, `rtttl`, `sml`, `vbus`, `sprinkler`, `status_led`, `key_collector`, `fingerprint_grow`, `hlk_fm22x`, `exposure_notifications`, `zwave_proxy`, `cc1101`, `sim800l`, `sx126x`, `sx127x`, `ezo_pmp`, `grove_tb6612fng`, `lightwaverf`, `micronova`, `pipsolar`, `uponor_smatrix`, `sun_gtil2`, `at581x`, `dfrobot_sen0395`, `pn7150`, `pn7160`, `wiegand`, `ir_rf_proxy`, `micro_wake_word`, `voice_assistant`, `dfplayer`, `emc2101`, `seeed_mr60bha2`, `seeed_mr60fda2`, `seeed_mr24hpc1`, `pylontech`, … (any remaining keys) |

**UI behaviour**

- **Category level**: Show category label + count of sections that have content (e.g. "Network (5)"). Expand to show section rows.
- **Section level**: Show section key (e.g. `wifi`) + optional "edited" badge if `section_overrides[key]` is set. Expand to show the YAML textarea (effective content).
- **Order**: Within the panel, list categories in the table order above. Within a category, list sections in the order shown (same as canonical compile order where applicable).
- **Empty sections**: Either hide sections with no content and no override, or show them greyed/collapsed so the user can "add" by editing. Hiding keeps the list shorter; showing makes discoverability easier.

**Data**: Store a single flat list or map of section keys → content; categories are presentation-only (derived from the table above in the frontend or from a shared constant).

---

## By category (from esphome.io/components)

### Configuration
- `esphome` — Core config (name, build, on_boot, etc.)
- `packages`
- `substitutions`
- `external_components`

### Platform (microcontroller)
- `esp32`
- `esp8266`
- `rp2040`
- `libretiny` — BK72xx, RTL87xx, LN882x
- `host`
- `nrf52`
- `esp32_hosted` — e.g. ESP32-C6 WiFi co-processor

### Microcontroller peripherals
- `psram`
- `deep_sleep`
- `esp_ldo` — ESP32-P4 LDO regulator
- `preferences` — (seen in recipes; flash_write_interval etc.)

### Core / automation
- `captive_portal`
- `copy`
- `demo`
- `globals`
- `esp32_improv` — Improv via BLE
- `improv_serial`
- `interval`
- `json`
- `mapping`
- `xxtea`
- `script`
- `factory_reset`

### Network hardware
- `wifi`
- `ethernet`
- `openthread`

### Network / protocols
- `network`
- `api` — Native HA API
- `mqtt`
- `espnow`
- `http_request`
- `mdns`
- `wireguard`
- `statsd`
- `udp`
- `packet_transport`
- `zigbee`

### Bluetooth / BLE
- `esp32_ble_beacon`
- `ble_client`
- `esp32_ble_tracker`
- `esp32_ble_server`
- `bluetooth_proxy`
- `ble_nus` — Nordic UART Service

### Management / monitoring
- `debug`
- `logger`
- `syslog`
- `prometheus`
- `safe_mode`
- `web_server`
- `esp32_camera_web_server`

### OTA / updates
- `ota`
- `update`

### Busses / interfaces
- `one_wire`
- `canbus`
- `i2c`
- `i2s_audio`
- `opentherm`
- `spi`
- `uart`
- `tinyusb`
- `usb_cdc_acm`
- `usb_host`
- `usb_uart`

### I/O expanders / multiplexers (optional in section list)
- `ch422g`, `ch423`, `max6956`, `mcp230xx`, `mcp23Sxx`, `pca6416a`, `pca9554`, `pcf8574`, `pi4ioe5v6408`, `sn74hc165`, `sn74hc595`, `sx1509`, `tca9548a`, `tca9555`, `weikai`, `xl9535`

### Entity / component types (main ones for LVGL + HA)
- `sensor`
- `text_sensor`
- `binary_sensor`
- `switch`
- `light`
- `output`
- `button`
- `number`
- `select`
- `lock`
- `cover`
- `fan`
- `climate`
- `media_player`
- `alarm_control_panel`
- `datetime`
- `valve`
- `water_heater`
- `text` — LVGL text input entity

### Display / UI
- `display`
- `font`
- `image`
- `graph`
- `qr_code`
- `animation`
- `online_image`
- `display_menu`
- `lvgl`
- `touchscreen`

### Time / automation
- `time`

### Audio
- `audio_adc`
- `audio_dac`
- `microphone`
- `speaker`

### Other common
- `event`
- `infrared`
- `remote_receiver`
- `remote_transmitter`
- `rf_bridge`
- `servo`
- `stepper`
- `matrix_keypad`
- `rtttl`
- `power_supply`
- `modbus_controller`
- `esp32_camera`
- `gps`
- `sun`
- `tuya`
- `sml`
- `vbus`
- `sprinkler`
- `status_led`
- `key_collector`
- `fingerprint_grow`
- `hlk_fm22x`
- `exposure_notifications`
- `zwave_proxy`
- `cc1101`
- `sim800l`
- `sx126x`
- `sx127x`
- … (and other component-specific keys from the index)

---

## Suggested canonical order for “bolt sections” compile

Use this order when emitting the final YAML (only emit sections that have content).

```text
esphome
esp32
esp32_hosted
esp8266
rp2040
libretiny
host
nrf52
psram
esp_ldo
deep_sleep
preferences
packages
substitutions
external_components
api
wifi
ethernet
openthread
network
ota
logger
mdns
captive_portal
web_server
mqtt
espnow
http_request
wireguard
statsd
udp
debug
syslog
prometheus
safe_mode
one_wire
canbus
i2c
spi
uart
tinyusb
usb_cdc_acm
usb_host
usb_uart
i2s_audio
opentherm
globals
interval
time
script
json
mapping
xxtea
copy
demo
font
image
output
light
display
touchscreen
sensor
text_sensor
binary_sensor
switch
button
number
select
lock
cover
fan
climate
media_player
alarm_control_panel
datetime
valve
water_heater
text
event
lvgl
```

Order is a suggestion; ESPHome generally reads the whole file before validation. Keeping a consistent order helps diffs and readability. Adjust (e.g. put `lvgl` after `display`/`touchscreen`) to match recipe conventions.

---

## Source

- [ESPHome Components Index](https://esphome.io/components/index.html)
- Built-in recipes in `custom_components/esphome_touch_designer/recipes/builtin/`

To extend: add the key to the canonical list and, if the compiler should provide a default for it, add recipe or compiler support for that section.
