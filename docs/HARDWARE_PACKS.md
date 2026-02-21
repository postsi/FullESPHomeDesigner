# Hardware Recipe Packs

The designer now supports external hardware packs.

## Locations

Built-in:
custom_components/esphome_touch_designer/recipes/builtin/

User recipes:
/config/esphome_touch_designer/recipes/

Recipe packs:
/config/esphome_touch_designer/recipe_packs/<pack_name>/*.yaml

## Importing EnhancedESPHomeGUI hardware

Copy the contents of:

EnhancedESPHomeGUI/custom_components/esphome_designer/frontend/hardware

into:

/config/esphome_touch_designer/recipe_packs/enhanced_gui/

Restart Home Assistant.

Devices will appear automatically in the hardware selector.

## Included built-in examples
- waveshare_esp32_p4_wifi6_touch_lcd_4c_720x720.yaml (720x720 round)
