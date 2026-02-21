# Importing Hardware Recipes

## Built-in recipes
This integration ships with a small curated set of built-in recipes.

## Adding recipes from other repositories
If you have hardware recipes from another project (e.g. your EnhancedESPHomeGUI hardware folder), you can add them without modifying this integration:

1. Copy the YAML recipe files into:
   `/config/esphome_touch_designer/recipes/`

2. Restart Home Assistant (or reload the integration)

3. In the designer hardware picker, select:
   `Custom • <recipe-name>`

### Notes
- Recipe files must be valid ESPHome YAML and should include the compiler markers:
  - `#__LVGL_PAGES__`
  - `#__HA_BINDINGS__`
  - `#__USER_YAML_PRE__`
  - `#__USER_YAML_POST__`

If an imported recipe is missing markers, it will still show up, but the compiler may not inject content correctly.
