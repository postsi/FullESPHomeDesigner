/**
 * Binding Builder: display actions and action-binding events filtered by widget type.
 * Services listed per domain for action bindings (user sees only relevant options).
 */

export type DisplayAction = "label_text" | "slider_value" | "arc_value" | "widget_checked";

/** Display target actions allowed per widget type (what property of the widget gets the HA value). */
export const DISPLAY_ACTIONS_BY_WIDGET_TYPE: Record<string, DisplayAction[]> = {
  label: ["label_text"],
  button: ["label_text", "widget_checked"],
  container: ["label_text", "widget_checked"],
  arc: ["arc_value", "label_text"],
  slider: ["slider_value", "label_text"],
  dropdown: ["label_text"],
  switch: ["widget_checked", "label_text"],
  checkbox: ["widget_checked", "label_text"],
  led: [],
  image: [],
  bar: ["label_text"],
  spinner: [],
  roller: ["label_text"],
  spinbox: ["label_text"],
};

/** Human-readable labels for display actions. */
export const DISPLAY_ACTION_LABELS: Record<DisplayAction, string> = {
  label_text: "Show as text",
  slider_value: "Set slider position",
  arc_value: "Set arc value",
  widget_checked: "Set on/off state",
};

/** Events that can trigger an action binding, per widget type (ESPHome event names). */
export const EVENTS_BY_WIDGET_TYPE: Record<string, string[]> = {
  button: ["on_click"],
  container: ["on_click"],
  arc: ["on_release", "on_value"],
  slider: ["on_release", "on_value"],
  dropdown: ["on_value", "on_change"],
  switch: ["on_change"],
  checkbox: ["on_change"],
  label: [],
  led: [],
  image: [],
  bar: [],
  spinner: [],
  roller: ["on_change"],
  spinbox: ["on_change"],
};

/** Event key -> human label. */
export const EVENT_LABELS: Record<string, string> = {
  on_click: "On click",
  on_release: "On release",
  on_value: "On value change",
  on_change: "On change",
};

/** Services relevant to each HA domain (for action binding service dropdown). */
export const SERVICES_BY_DOMAIN: Record<string, { service: string; label: string }[]> = {
  switch: [
    { service: "switch.toggle", label: "Toggle" },
    { service: "switch.turn_on", label: "Turn on" },
    { service: "switch.turn_off", label: "Turn off" },
  ],
  light: [
    { service: "light.toggle", label: "Toggle" },
    { service: "light.turn_on", label: "Turn on" },
    { service: "light.turn_off", label: "Turn off" },
  ],
  climate: [
    { service: "climate.set_temperature", label: "Set temperature" },
    { service: "climate.set_hvac_mode", label: "Set HVAC mode" },
    { service: "climate.set_preset_mode", label: "Set preset mode" },
    { service: "climate.set_fan_mode", label: "Set fan mode" },
  ],
  cover: [
    { service: "cover.open_cover", label: "Open" },
    { service: "cover.close_cover", label: "Close" },
    { service: "cover.stop_cover", label: "Stop" },
    { service: "cover.set_cover_position", label: "Set position" },
  ],
  fan: [
    { service: "fan.toggle", label: "Toggle" },
    { service: "fan.turn_on", label: "Turn on" },
    { service: "fan.turn_off", label: "Turn off" },
    { service: "fan.set_percentage", label: "Set percentage" },
  ],
  lock: [
    { service: "lock.lock", label: "Lock" },
    { service: "lock.unlock", label: "Unlock" },
  ],
  media_player: [
    { service: "media_player.media_play_pause", label: "Play/Pause" },
    { service: "media_player.media_previous_track", label: "Previous" },
    { service: "media_player.media_next_track", label: "Next" },
    { service: "media_player.volume_set", label: "Set volume" },
  ],
  input_boolean: [
    { service: "input_boolean.toggle", label: "Toggle" },
  ],
  number: [
    { service: "number.set_value", label: "Set value" },
  ],
  input_number: [
    { service: "input_number.set_value", label: "Set value" },
  ],
};

export function getDisplayActionsForType(widgetType: string): DisplayAction[] {
  return DISPLAY_ACTIONS_BY_WIDGET_TYPE[widgetType] ?? ["label_text"];
}

export function getEventsForType(widgetType: string): string[] {
  return EVENTS_BY_WIDGET_TYPE[widgetType] ?? [];
}

export function getServicesForDomain(domain: string): { service: string; label: string }[] {
  return SERVICES_BY_DOMAIN[domain] ?? [];
}

export function domainFromEntityId(entityId: string): string {
  const dot = String(entityId || "").indexOf(".");
  return dot > 0 ? String(entityId).slice(0, dot) : "";
}
