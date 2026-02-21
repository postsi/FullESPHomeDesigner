# Hardware recipes

Hardware recipes are reusable ESPHome YAML fragments that define the **board/display/touch** configuration
for a specific touchscreen device. The designer compiles your LVGL UI and HA bindings, then inserts them
into the selected recipe.

## Built-in recipes

This integration ships with a small set of built-in recipes under:

- `custom_components/esphome_touch_designer/recipes/builtin/`

These are intended to get you started quickly.


### Included device profiles (imported from postsi/ESPHomeDesigner)

The following built-in recipes are now bundled (one per device YAML in the referenced hardware directory):

- `elecrow_7inch_800x480`
- `guition_jc4827w543_480x272`
- `guition_jc8048w535_320x480`
- `guition_jc8048w550_800x480`
- `guition_s3_4848s040_480x480`
- `jc1060p470_esp32p4_1024x600`
- `lilygo_tdisplays3_170x320`
- `sunton_2432s028_240x320`
- `sunton_2432s028r_240x320`
- `sunton_4827s032r_480x280`
- `sunton_8048s050_800x480`
- `sunton_8048s070_800x480`
- `waveshare_s3_touch_lcd_4.3_800x480`
- `waveshare_s3_touch_lcd_7_800x480`
- `waveshare_universal_epaper_7.5v2_800x480`

These are copied into `recipes/builtin/` so you can select them immediately without managing `/config` recipe files.

## User recipes (recommended)

For personal-use flexibility (and to avoid editing the integration itself), you can add your own recipes in:

- `/config/esphome_touch_designer/recipes/*.yaml`

They will automatically appear in the UI’s hardware recipe picker.

### Importing known-good board profiles

You mentioned these hardware profiles as a baseline source:

- https://github.com/postsi/ESPHomeDesigner/tree/main/custom_components/esphome_designer/frontend/hardware

Workflow:

1. Copy the YAML recipe(s) you want from that repository.
2. Place them into: `/config/esphome_touch_designer/recipes/`
3. Reload the integration (or restart HA).
4. The recipes should appear in the hardware recipe list.

## Recipe validation

The API includes a best-effort validator endpoint used by the UI:

- `POST /api/esphome_touch_designer/recipes/validate`

It checks for common issues (missing markers, YAML parse errors, missing `api:` etc.).


## Import a device YAML as a recipe (v0.64+)

In the Designer UI (Compile tab), use **Import recipe…** to paste a full ESPHome device YAML. The designer will normalize it into a hardware recipe and save it under `/config/esphome_touch_designer/recipes/user/<slug>/`.
