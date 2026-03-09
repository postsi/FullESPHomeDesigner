# Colour picker → Home Assistant light

When you bind a colour picker to a light with **"Set button colour"**, the device sends the chosen RGB to Home Assistant when you tap **Apply**. ESPHome's `homeassistant.action` cannot send a list (e.g. `rgb_color: [r,g,b]`) in the service payload, so the integration provides a **custom service** that accepts scalar values and calls `light.turn_on` for you.

## No script required

The **ESPHome Touch Designer** integration registers the service **`esphome_touch_designer.set_light_rgb`**. The device calls it with:

- `entity_id` – light entity (e.g. `light.shed_leds`)
- `red`, `green`, `blue` – 0–255 (sent as scalars from the device)

The integration then calls `light.turn_on` with `entity_id` and `rgb_color: [red, green, blue]` inside Home Assistant. You do **not** need to create any script or automation.
