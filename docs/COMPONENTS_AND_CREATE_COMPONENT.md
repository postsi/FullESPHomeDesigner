# Components Panel and Create Component

## Components panel

The **ESPHome Components** panel shows top-level ESPHome YAML sections (e.g. `sensor`, `switch`, `logger`, `lvgl`). All manual section content lives in **`project.sections`** (no legacy `section_overrides`).

- **Empty** — No content; recipe/compiler did not emit this section. You can add YAML to override.
- **Recipe** — Content comes from the hardware recipe (e.g. `esphome`, `wifi`, `display`).
- **Auto** — Content added by the app from bindings, prebuilts, or scripts (e.g. HA sensors, intervals).
- **Manual** — You have stored or edited this section in Components.

List-like sections (`sensor`, `switch`, `number`, `select`, `text_sensor`, `binary_sensor`, `light`) are **merged**: your Components YAML and compiler output (e.g. HA bindings) are combined so LVGL platform components and bindings coexist. Reset restores default (recipe + compiler); Save stores your edits to the project.

**Cleanup orphaned:** Use **Cleanup orphaned** to remove Components blocks that reference widgets you have deleted. Orphan cleanup also runs automatically when you save the project to the server.

## Create component (from Binding Builder)

With a widget selected, use **Create component…** in the Binding Builder to add an ESPHome LVGL platform component bound to that widget (e.g. switch, sensor, number). No coding: the block is appended to the right section in Components.

- **Type** — Inferred from the widget (e.g. slider → number); you can change it (switch, light, sensor, number, select, text_sensor, binary_sensor).
- **ID** — Prefilled from the widget id; changing it renames the widget in Properties.
- **Name** — Friendly name for the component.

If you later rename the widget id in Properties, all `widget:` (and matching `id:`) references in Components are updated automatically so the component stays bound to the widget.

## Compile warnings

If the compiler finds Components blocks that reference a widget id that no longer exists (e.g. you deleted the widget but not the block), it reports a warning in the Compile tab. Fix by editing Components or using **Cleanup orphaned** in the Components panel.
