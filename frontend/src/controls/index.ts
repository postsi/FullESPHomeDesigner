export type ControlTemplate = {
  id: string;
  title: string;
  description: string;
  build: (args: any) => { widgets: any[]; bindings?: any[]; links?: any[] };
};

function uid(prefix: string) {
  return prefix + "_" + Math.random().toString(16).slice(2, 8);
}


/** Shared builder for glance cards (to support row-count presets). */
function buildGlanceCard({ entities = [], x = 20, y = 20, label = "Glance", max_rows = 4 }: any) {
  const rootId = uid("card_gl");
  const rows = (Array.isArray(entities) ? entities : []).slice(0, Math.max(1, Math.min(12, Number(max_rows) || 4)));
  const widgets: any[] = [
    { id: rootId, type: "container", x, y, w: 320, h: 60 + rows.length * 24, props: {} },
    { id: uid("lbl_gl_hdr"), type: "label", x: x + 12, y: y + 10, w: 296, h: 22, props: { text: label } },
  ];
  const bindings: any[] = [];
  const links: any[] = [];
  rows.forEach((eid: string, idx: number) => {
    const rowY = y + 40 + idx * 24;
    const lblId = uid("lbl_gl_state");
    widgets.push({ id: uid("lbl_gl_name"), type: "label", x: x + 12, y: rowY, w: 180, h: 22, props: { text: eid || "entity" } });
    widgets.push({ id: lblId, type: "label", x: x + 200, y: rowY, w: 108, h: 22, props: { text: "—" } });
    if (eid && typeof eid === "string" && eid.includes(".")) {
      bindings.push({ entity_id: eid, kind: "state" });
      links.push({ source: { entity_id: eid, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } });
    }
  });
  return { widgets, bindings, links };
}


/** Shared builder for grid cards (2x2 / 3x2 / 3x3 variants). */
function buildGridCard({
  entities = [],
  x = 20,
  y = 20,
  label = "Grid",
  cols = 2,
  rows = 2,
  tap_action = "toggle",
  service,
  service_data,
}: any) {
  const ents = (Array.isArray(entities) ? entities : []).slice(0, cols * rows);
  const rootId = uid("card_grid");
  const widgets: any[] = [
    { id: rootId, type: "container", x, y, w: 340, h: 70 + rows * 70, props: {} },
    { id: uid("lbl_grid_hdr"), type: "label", x: x + 12, y: y + 10, w: 316, h: 22, props: { text: label } },
  ];
  const bindings: any[] = [];
  const links: any[] = [];

  const mkAction = (ent: string) => {
    const dataExtra =
      service_data && String(service_data).trim()
        ? "\n" +
          String(service_data)
            .trim()
            .split("\n")
            .map((l: string) => "      " + l)
            .join("\n")
        : "";
    return tap_action === "toggle"
      ? "- homeassistant.service:\n    service: homeassistant.toggle\n    data:\n      entity_id: " + ent + "\n"
      : tap_action === "call-service"
      ? "- homeassistant.service:\n    service: " + (service || "homeassistant.toggle") + "\n    data:\n      entity_id: " + ent + dataExtra + "\n"
      : "- homeassistant.more_info:\n    data:\n      entity_id: " + ent + "\n";
  };

  const tileW = 100;
  const tileH = 60;
  const gap = 10;
  const originX = x + 12;
  const originY = y + 40;

  for (let i = 0; i < cols * rows; i++) {
    const ent = ents[i] || "";
    const cx = originX + (i % cols) * (tileW + gap);
    const cy = originY + Math.floor(i / cols) * (tileH + gap);

    const btnId = uid("btn_grid_tile");
    const lblId = uid("lbl_grid_state");

    widgets.push({
      id: btnId,
      type: "button",
      x: cx,
      y: cy,
      w: tileW,
      h: tileH,
      props: { text: ent ? ent.split(".")[1] || ent : "tile" },
      events: ent && ent.includes(".") ? { on_click: mkAction(ent) } : {},
    });

    widgets.push({ id: lblId, type: "label", x: cx + 8, y: cy + 30, w: tileW - 16, h: 24, props: { text: "—" } });

    if (ent && ent.includes(".")) {
      bindings.push({ entity_id: ent, kind: "state" });
      links.push({ source: { entity_id: ent, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } });
    }
  }

  return { widgets, bindings, links };
}


/**
 * Controls are MACROS:
 * - They generate widgets[] placed onto the canvas
 * - They generate bindings[] (HA -> ESPHome sensors)
 * - They generate links[] (ESPHome triggers -> LVGL updates)
 *
 * IMPORTANT:
 * - Widget events produce ESPHome action YAML fragments (homeassistant.action).
 * - Links are compiled into on_value/on_state triggers by the backend compiler.
 */
export const CONTROL_TEMPLATES: ControlTemplate[] = [
  {
    id: "ha_light_toggle",
    title: "Home Assistant • Light (Toggle)",
    description: "Simple Lovelace-style light toggle button.",
    build: ({ entity_id, x = 20, y = 20, label = "Light" }) => {
      const btnId = uid("btn_light");
      const ent = entity_id || "light.example";
      return {
        bindings: entity_id ? [{ entity_id, kind: "binary" }] : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "binary", attribute: "" },
                target: { widget_id: btnId, action: "widget_checked" },
              },
            ]
          : [],
        widgets: [
          {
            id: btnId,
            type: "button",
            x,
            y,
            w: 260,
            h: 70,
            props: { text: label, checkable: true },
            events: {
              on_click: `then:\n  - homeassistant.action:\n      action: light.toggle\n      data:\n        entity_id: ${ent}`,
            },
          },
        ],
      };
    },
  },

  {
    id: "ha_light_full",
    title: "Home Assistant • Light (Toggle + Brightness)",
    description:
      "Lovelace-like light control: toggle button + brightness slider + value label. Uses live links to stay in sync with HA.",
    build: ({ entity_id, x = 20, y = 20, label = "Light" }) => {
      const btnId = uid("btn_light");
      const sldId = uid("sld_bri");
      const lblId = uid("lbl_bri");

      const ent = entity_id || "light.example";
      return {
        bindings: entity_id
          ? [
              { entity_id, kind: "binary" },
              { entity_id, kind: "attribute_number", attribute: "brightness" },
            ]
          : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "binary", attribute: "" },
                target: { widget_id: btnId, action: "widget_checked" },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "brightness" },
                target: { widget_id: sldId, action: "slider_value", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "brightness" },
                target: { widget_id: lblId, action: "label_text", format: "%.0f", scale: 1.0 },
              },
            ]
          : [],
        widgets: [
          {
            id: btnId,
            type: "button",
            x,
            y,
            w: 220,
            h: 60,
            props: { text: label, checkable: true },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: light.toggle
      data:
        entity_id: ${ent}`,
            },
          },
          {
            id: sldId,
            type: "slider",
            x,
            y: y + 70,
            w: 320,
            h: 46,
            props: { min: 0, max: 255 },
            events: {
              // NOTE: in ESPHome LVGL actions, slider callbacks expose value as `x` in lambdas.
              // This is first-pass: we set brightness to slider value (0..255).
              on_release: `then:
  - homeassistant.action:
      action: light.turn_on
      data:
        entity_id: ${ent}
        brightness: !lambda return (int)x;`,
            },
          },
          {
            id: lblId,
            type: "label",
            x: x + 330,
            y: y + 70,
            w: 80,
            h: 46,
            props: { text: "0" },
          },
        ],
      };
    },
  },

  {
    id: "ha_light_ct",
    title: "Home Assistant • Light (Toggle + Brightness + Color Temp)",
    description:
      "Light control with toggle + brightness + color temperature slider (for lights that support color_temp).",
    build: ({ entity_id, x = 20, y = 20, label = "Light" }) => {
      const baseTmpl = CONTROL_TEMPLATES.find((t) => t.id === "ha_light_full");
      if (!baseTmpl) throw new Error("ha_light_full template not found");
      const built = baseTmpl.build({ entity_id, x, y, label });
      const ctId = uid("sld_ct");
      const lblId = uid("lbl_ct");
      const ent = entity_id || "light.example";
      const bindings = [...(built.bindings || [])];
      const links = [...(built.links || [])];
      if (entity_id) {
        bindings.push({ entity_id, kind: "attribute_number", attribute: "color_temp" });
        links.push({
          source: { entity_id, kind: "attribute_number", attribute: "color_temp" },
          target: { widget_id: ctId, action: "slider_value", scale: 1.0 },
        });
        links.push({
          source: { entity_id, kind: "attribute_number", attribute: "color_temp" },
          target: { widget_id: lblId, action: "label_text", format: "%.0f", scale: 1.0 },
        });
      }
      return {
        widgets: [
          ...(built.widgets || []),
          {
            id: ctId,
            type: "slider",
            x,
            y: y + 125,
            w: 320,
            h: 46,
            props: { min: 153, max: 500 },
            events: {
              on_value: `then:\n  - homeassistant.action:\n      action: light.turn_on\n      data:\n        entity_id: ${ent}\n        color_temp: !lambda return (int)x;`,
            },
          },
          {
            id: lblId,
            type: "label",
            x: x + 330,
            y: y + 125,
            w: 80,
            h: 46,
            props: { text: "--" },
          },
        ],
        bindings,
        links,
      };
    },
  },

  {
    id: "ha_climate_full",
    title: "Home Assistant • Climate (Mode + Setpoint)",
    description:
      "Lovelace-like climate control: mode buttons + setpoint slider + current/set temp labels. First pass capability-agnostic.",
    build: ({ entity_id, x = 20, y = 160, label = "Thermostat" }) => {
      const lblCur = uid("lbl_cur");
      const lblSet = uid("lbl_set");
      const sldSet = uid("sld_set");
      const btnOff = uid("btn_off");
      const btnHeat = uid("btn_heat");
      const btnCool = uid("btn_cool");
      const btnAuto = uid("btn_auto");

      const ent = entity_id || "climate.example";
      return {
        bindings: entity_id
          ? [
              { entity_id, kind: "state" },
              { entity_id, kind: "attribute_number", attribute: "current_temperature" },
              { entity_id, kind: "attribute_number", attribute: "temperature" },
            ]
          : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "attribute_number", attribute: "current_temperature" },
                target: { widget_id: lblCur, action: "label_text", format: "%.1f", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "temperature" },
                target: { widget_id: lblSet, action: "label_text", format: "%.1f", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "temperature" },
                target: { widget_id: sldSet, action: "slider_value", scale: 1.0 },
              },
            ]
          : [],
        widgets: [
          {
            id: uid("lbl_title"),
            type: "label",
            x,
            y,
            w: 240,
            h: 26,
            props: { text: label },
          },
          {
            id: lblCur,
            type: "label",
            x,
            y: y + 32,
            w: 160,
            h: 40,
            props: { text: "Cur: --" },
          },
          {
            id: lblSet,
            type: "label",
            x: x + 170,
            y: y + 32,
            w: 160,
            h: 40,
            props: { text: "Set: --" },
          },
          {
            id: sldSet,
            type: "slider",
            x,
            y: y + 76,
            w: 320,
            h: 46,
            props: { min: 5, max: 35 },
            events: {
              on_release: `then:
  - homeassistant.action:
      action: climate.set_temperature
      data:
        entity_id: ${ent}
        temperature: !lambda return (float)x;`,
            },
          },
          {
            id: btnOff,
            type: "button",
            x,
            y: y + 130,
            w: 90,
            h: 48,
            props: { text: "Off" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: climate.set_hvac_mode
      data:
        entity_id: ${ent}
        hvac_mode: "off"`,
            },
          },
          {
            id: btnHeat,
            type: "button",
            x: x + 100,
            y: y + 130,
            w: 90,
            h: 48,
            props: { text: "Heat" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: climate.set_hvac_mode
      data:
        entity_id: ${ent}
        hvac_mode: "heat"`,
            },
          },
          {
            id: btnCool,
            type: "button",
            x: x + 200,
            y: y + 130,
            w: 90,
            h: 48,
            props: { text: "Cool" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: climate.set_hvac_mode
      data:
        entity_id: ${ent}
        hvac_mode: "cool"`,
            },
          },
          {
            id: btnAuto,
            type: "button",
            x: x + 300,
            y: y + 130,
            w: 90,
            h: 48,
            props: { text: "Auto" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: climate.set_hvac_mode
      data:
        entity_id: ${ent}
        hvac_mode: "auto"`,
            },
          },
        ],
      };
    },
  },



  {
    id: "ha_climate_parity",
    title: "Home Assistant • Climate (Parity)",
    description:
      "Capability-aware climate control: hvac_mode + preset_mode + fan_mode selectors (dropdowns where available) + setpoint. First-pass Lovelace-like.",
    build: ({ entity_id, x = 20, y = 160, label = "Thermostat", caps }) => {
      const ent = entity_id || "climate.example";
      const lblTitle = uid("lbl_title");
      const lblCur = uid("lbl_cur");
      const lblSet = uid("lbl_set");
      const sldSet = uid("sld_set");
      const ddHvac = uid("dd_hvac");
      const ddPreset = uid("dd_preset");
      const ddFan = uid("dd_fan");

      const hvacModes = (caps?.attributes?.hvac_modes || ["off", "heat", "cool", "auto"]).filter(Boolean);
      const presetModes = (caps?.attributes?.preset_modes || []).filter(Boolean);
      const fanModes = (caps?.attributes?.fan_modes || []).filter(Boolean);

      const hvacOpts = hvacModes.join("\\n");
      const presetOpts = presetModes.length ? presetModes.join("\\n") : "(none)";
      const fanOpts = fanModes.length ? fanModes.join("\\n") : "(none)";

      const bindings = entity_id
        ? [
            { entity_id, kind: "state" },
            { entity_id, kind: "attribute_number", attribute: "current_temperature" },
            { entity_id, kind: "attribute_number", attribute: "temperature" },
          ]
        : [];

      const links = entity_id
        ? [
            {
              source: { entity_id, kind: "attribute_number", attribute: "current_temperature" },
              target: { widget_id: lblCur, action: "label_text", format: "%.1f", scale: 1.0 },
            },
            {
              source: { entity_id, kind: "attribute_number", attribute: "temperature" },
              target: { widget_id: lblSet, action: "label_text", format: "%.1f", scale: 1.0 },
            },
            {
              source: { entity_id, kind: "attribute_number", attribute: "temperature" },
              target: { widget_id: sldSet, action: "slider_value", scale: 1.0 },
            },
          ]
        : [];

      const widgets: any[] = [
        { id: lblTitle, type: "label", x, y, w: 260, h: 26, props: { text: label } },
        { id: lblCur, type: "label", x, y: y + 32, w: 160, h: 34, props: { text: "Cur: --" } },
        { id: lblSet, type: "label", x: x + 170, y: y + 32, w: 160, h: 34, props: { text: "Set: --" } },
        {
          id: ddHvac,
          type: "dropdown",
          x,
          y: y + 72,
          w: 220,
          h: 40,
          props: { options: hvacOpts },
          events: {
            // Note: dropdown selected text is exposed as `text` in ESPHome LVGL callbacks
            on_value: `then:\n  - homeassistant.action:\n      action: climate.set_hvac_mode\n      data:\n        entity_id: ${ent}\n        hvac_mode: !lambda return std::string(text).c_str();`,
          },
        },
        {
          id: sldSet,
          type: "slider",
          x: x + 230,
          y: y + 72,
          w: 260,
          h: 40,
          props: { min: 5, max: 35 },
          events: {
            on_release: `then:\n  - homeassistant.action:\n      action: climate.set_temperature\n      data:\n        entity_id: ${ent}\n        temperature: !lambda return (float)x;`,
          },
        },
        {
          id: ddPreset,
          type: "dropdown",
          x,
          y: y + 118,
          w: 220,
          h: 40,
          props: { options: presetOpts, disabled: !presetModes.length },
          events: presetModes.length
            ? {
                on_value: `then:\n  - homeassistant.action:\n      action: climate.set_preset_mode\n      data:\n        entity_id: ${ent}\n        preset_mode: !lambda return std::string(text).c_str();`,
              }
            : {},
        },
        {
          id: ddFan,
          type: "dropdown",
          x: x + 230,
          y: y + 118,
          w: 260,
          h: 40,
          props: { options: fanOpts, disabled: !fanModes.length },
          events: fanModes.length
            ? {
                on_value: `then:\n  - homeassistant.action:\n      action: climate.set_fan_mode\n      data:\n        entity_id: ${ent}\n        fan_mode: !lambda return std::string(text).c_str();`,
              }
            : {},
        },
      ];

      return { widgets, bindings, links };
    },
  },
  {
    id: "ha_cover_full",
    title: "Home Assistant • Cover (Position + Open/Stop/Close)",
    description:
      "Lovelace-like cover control: position slider + current position label + open/stop/close. Uses live updates.",
    build: ({ entity_id, x = 20, y = 360, label = "Cover" }) => {
      const sldPos = uid("sld_pos");
      const lblPos = uid("lbl_pos");
      const ent = entity_id || "cover.example";

      return {
        bindings: entity_id
          ? [{ entity_id, kind: "attribute_number", attribute: "current_position" }]
          : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "attribute_number", attribute: "current_position" },
                target: { widget_id: sldPos, action: "slider_value", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "current_position" },
                target: { widget_id: lblPos, action: "label_text", format: "%.0f", scale: 1.0 },
              },
            ]
          : [],
        widgets: [
          {
            id: uid("lbl_title"),
            type: "label",
            x,
            y,
            w: 240,
            h: 26,
            props: { text: label },
          },
          {
            id: sldPos,
            type: "slider",
            x,
            y: y + 32,
            w: 320,
            h: 46,
            props: { min: 0, max: 100 },
            events: {
              on_release: `then:
  - homeassistant.action:
      action: cover.set_cover_position
      data:
        entity_id: ${ent}
        position: !lambda return (int)x;`,
            },
          },
          {
            id: lblPos,
            type: "label",
            x: x + 330,
            y: y + 32,
            w: 80,
            h: 46,
            props: { text: "0" },
          },
          {
            id: uid("btn_open"),
            type: "button",
            x,
            y: y + 88,
            w: 120,
            h: 48,
            props: { text: "Open" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: cover.open_cover
      data:
        entity_id: ${ent}`,
            },
          },
          {
            id: uid("btn_stop"),
            type: "button",
            x: x + 130,
            y: y + 88,
            w: 120,
            h: 48,
            props: { text: "Stop" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: cover.stop_cover
      data:
        entity_id: ${ent}`,
            },
          },
          {
            id: uid("btn_close"),
            type: "button",
            x: x + 260,
            y: y + 88,
            w: 120,
            h: 48,
            props: { text: "Close" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: cover.close_cover
      data:
        entity_id: ${ent}`,
            },
          },
        ],
      };
    },
  },


  {
    id: "ha_cover_parity",
    title: "Home Assistant • Cover (Parity)",
    description:
      "Capability-aware cover control: open/stop/close + position slider when supported + tilt slider when supported. Unsupported controls are disabled.",
    build: ({ entity_id, x = 20, y = 360, label = "Cover", caps }) => {
      const ent = entity_id || "cover.example";
      const sldPos = uid("sld_pos");
      const lblPos = uid("lbl_pos");
      const sldTilt = uid("sld_tilt");
      const lblTilt = uid("lbl_tilt");

      const hasPos = caps?.attributes?.current_position !== undefined && caps?.attributes?.current_position !== null;
      const hasTilt = caps?.attributes?.current_tilt_position !== undefined && caps?.attributes?.current_tilt_position !== null;

      const bindings = entity_id
        ? [
            ...(hasPos ? [{ entity_id, kind: "attribute_number", attribute: "current_position" }] : []),
            ...(hasTilt ? [{ entity_id, kind: "attribute_number", attribute: "current_tilt_position" }] : []),
          ]
        : [];

      const links: any[] = [];
      if (entity_id && hasPos) {
        links.push(
          {
            source: { entity_id, kind: "attribute_number", attribute: "current_position" },
            target: { widget_id: sldPos, action: "slider_value", scale: 1.0 },
          },
          {
            source: { entity_id, kind: "attribute_number", attribute: "current_position" },
            target: { widget_id: lblPos, action: "label_text", format: "%.0f", scale: 1.0 },
          },
        );
      }
      if (entity_id && hasTilt) {
        links.push(
          {
            source: { entity_id, kind: "attribute_number", attribute: "current_tilt_position" },
            target: { widget_id: sldTilt, action: "slider_value", scale: 1.0 },
          },
          {
            source: { entity_id, kind: "attribute_number", attribute: "current_tilt_position" },
            target: { widget_id: lblTilt, action: "label_text", format: "%.0f", scale: 1.0 },
          },
        );
      }

      const widgets: any[] = [
        { id: uid("lbl_title"), type: "label", x, y, w: 240, h: 26, props: { text: label } },
        {
          id: sldPos,
          type: "slider",
          x,
          y: y + 32,
          w: 320,
          h: 46,
          props: { min: 0, max: 100, disabled: !hasPos },
          events: hasPos
            ? {
                on_release: `then:\n  - homeassistant.action:\n      action: cover.set_cover_position\n      data:\n        entity_id: ${ent}\n        position: !lambda return (int)x;`,
              }
            : {},
        },
        { id: lblPos, type: "label", x: x + 330, y: y + 32, w: 80, h: 46, props: { text: hasPos ? "0" : "--" } },
        {
          id: uid("btn_open"),
          type: "button",
          x,
          y: y + 88,
          w: 120,
          h: 48,
          props: { text: "Open" },
          events: {
            on_click: `then:\n  - homeassistant.action:\n      action: cover.open_cover\n      data:\n        entity_id: ${ent}`,
          },
        },
        {
          id: uid("btn_stop"),
          type: "button",
          x: x + 130,
          y: y + 88,
          w: 120,
          h: 48,
          props: { text: "Stop" },
          events: {
            on_click: `then:\n  - homeassistant.action:\n      action: cover.stop_cover\n      data:\n        entity_id: ${ent}`,
          },
        },
        {
          id: uid("btn_close"),
          type: "button",
          x: x + 260,
          y: y + 88,
          w: 120,
          h: 48,
          props: { text: "Close" },
          events: {
            on_click: `then:\n  - homeassistant.action:\n      action: cover.close_cover\n      data:\n        entity_id: ${ent}`,
          },
        },
        {
          id: sldTilt,
          type: "slider",
          x,
          y: y + 146,
          w: 320,
          h: 46,
          props: { min: 0, max: 100, disabled: !hasTilt },
          events: hasTilt
            ? {
                on_release: `then:\n  - homeassistant.action:\n      action: cover.set_cover_tilt_position\n      data:\n        entity_id: ${ent}\n        tilt_position: !lambda return (int)x;`,
              }
            : {},
        },
        { id: lblTilt, type: "label", x: x + 330, y: y + 146, w: 80, h: 46, props: { text: hasTilt ? "0" : "--" } },
      ];

      return { widgets, bindings, links };
    },
  },


  {
    id: "ha_fan_parity",
    title: "Home Assistant • Fan (Parity)",
    description:
      "Capability-aware fan control: toggle + percentage + optional oscillate + optional direction + optional preset mode.",
    build: ({ entity_id, x = 20, y = 560, label = "Fan", caps }) => {
      const ent = entity_id || "fan.example";
      const btn = uid("btn_fan");
      const sldPct = uid("sld_pct");
      const lblPct = uid("lbl_pct");
      const swOsc = uid("sw_osc");
      const ddDir = uid("dd_dir");
      const ddPreset = uid("dd_preset");

      const presetModes = (caps?.attributes?.preset_modes || caps?.attributes?.preset_mode_list || []).filter(Boolean);
      const dirModes = (caps?.attributes?.direction_list || caps?.attributes?.directions || []).filter(Boolean);
      const hasOsc = caps?.attributes?.oscillating !== undefined;

      const presetOpts = presetModes.length ? presetModes.join("\\n") : "(none)";
      const dirOpts = dirModes.length ? dirModes.join("\\n") : "(none)";

      const bindings = entity_id
        ? [
            { entity_id, kind: "binary" },
            { entity_id, kind: "attribute_number", attribute: "percentage" },
            ...(hasOsc ? [{ entity_id, kind: "attribute_bool", attribute: "oscillating" }] : []),
            ...(presetModes.length ? [{ entity_id, kind: "attribute_text", attribute: "preset_mode" }] : []),
            ...(dirModes.length ? [{ entity_id, kind: "attribute_text", attribute: "direction" }] : []),
          ]
        : [];

      const links: any[] = [];
      if (entity_id) {
        links.push(
          { source: { entity_id, kind: "binary", attribute: "" }, target: { widget_id: btn, action: "widget_checked" } },
          { source: { entity_id, kind: "attribute_number", attribute: "percentage" }, target: { widget_id: sldPct, action: "slider_value", scale: 1.0 } },
          { source: { entity_id, kind: "attribute_number", attribute: "percentage" }, target: { widget_id: lblPct, action: "label_text", format: "%.0f", scale: 1.0 } },
        );
        if (hasOsc) {
          links.push({ source: { entity_id, kind: "attribute_bool", attribute: "oscillating" }, target: { widget_id: swOsc, action: "widget_checked" } });
        }
      }

      const widgets: any[] = [
        { id: uid("lbl_title"), type: "label", x, y, w: 240, h: 26, props: { text: label } },
        {
          id: btn,
          type: "button",
          x,
          y: y + 32,
          w: 220,
          h: 60,
          props: { text: "Toggle", checkable: true },
          events: {
            on_click: `then:\n  - homeassistant.action:\n      action: fan.toggle\n      data:\n        entity_id: ${ent}`,
          },
        },
        {
          id: sldPct,
          type: "slider",
          x,
          y: y + 98,
          w: 320,
          h: 46,
          props: { min: 0, max: 100 },
          events: {
            on_release: `then:\n  - homeassistant.action:\n      action: fan.set_percentage\n      data:\n        entity_id: ${ent}\n        percentage: !lambda return (int)x;`,
          },
        },
        { id: lblPct, type: "label", x: x + 330, y: y + 98, w: 80, h: 46, props: { text: "0" } },
      ];

      // Optional oscillate
      widgets.push({
        id: swOsc,
        type: "switch",
        x,
        y: y + 152,
        w: 220,
        h: 50,
        props: { text: "Oscillate", disabled: !hasOsc },
        events: hasOsc
          ? {
              on_value: `then:\n  - homeassistant.action:\n      action: fan.oscillate\n      data:\n        entity_id: ${ent}\n        oscillating: !lambda return (bool)x;`,
            }
          : {},
      });

      // Optional direction
      widgets.push({
        id: ddDir,
        type: "dropdown",
        x: x + 230,
        y: y + 152,
        w: 260,
        h: 50,
        props: { options: dirOpts, disabled: !dirModes.length },
        events: dirModes.length
          ? {
              on_value: `then:\n  - homeassistant.action:\n      action: fan.set_direction\n      data:\n        entity_id: ${ent}\n        direction: !lambda return std::string(text).c_str();`,
            }
          : {},
      });

      // Optional preset
      widgets.push({
        id: ddPreset,
        type: "dropdown",
        x,
        y: y + 210,
        w: 490,
        h: 50,
        props: { options: presetOpts, disabled: !presetModes.length },
        events: presetModes.length
          ? {
              on_value: `then:\n  - homeassistant.action:\n      action: fan.set_preset_mode\n      data:\n        entity_id: ${ent}\n        preset_mode: !lambda return std::string(text).c_str();`,
            }
          : {},
      });

      return { widgets, bindings, links };
    },
  },

  {
    id: "ha_media_player_full",
    title: "Home Assistant • Media Player (Transport + Volume + Title)",
    description:
      "Lovelace-like media player: title label + play/pause/next/prev + volume slider. Uses live links.",
    build: ({ entity_id, x = 460, y = 20, label = "Media" }) => {
      const lblTitle = uid("lbl_title");
      const sldVol = uid("sld_vol");
      const lblVol = uid("lbl_vol");
      const ent = entity_id || "media_player.example";

      return {
        bindings: entity_id
          ? [
              { entity_id, kind: "attribute_text", attribute: "media_title" },
              { entity_id, kind: "attribute_number", attribute: "volume_level" },
              { entity_id, kind: "state" },
            ]
          : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "attribute_text", attribute: "media_title" },
                target: { widget_id: lblTitle, action: "label_text" },
              },
              {
                // HA volume_level is 0..1; scale to 100 for slider.
                source: { entity_id, kind: "attribute_number", attribute: "volume_level" },
                target: { widget_id: sldVol, action: "slider_value", scale: 100.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "volume_level" },
                target: { widget_id: lblVol, action: "label_text", format: "%.0f", scale: 100.0 },
              },
            ]
          : [],
        widgets: [
          {
            id: uid("lbl_head"),
            type: "label",
            x,
            y,
            w: 240,
            h: 26,
            props: { text: label },
          },
          {
            id: lblTitle,
            type: "label",
            x,
            y: y + 32,
            w: 380,
            h: 40,
            props: { text: "(title)" },
          },
          {
            id: uid("btn_prev"),
            type: "button",
            x,
            y: y + 78,
            w: 88,
            h: 48,
            props: { text: "⏮" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: media_player.media_previous_track
      data:
        entity_id: ${ent}`,
            },
          },
          {
            id: uid("btn_play"),
            type: "button",
            x: x + 98,
            y: y + 78,
            w: 88,
            h: 48,
            props: { text: "⏯" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: media_player.media_play_pause
      data:
        entity_id: ${ent}`,
            },
          },
          {
            id: uid("btn_next"),
            type: "button",
            x: x + 196,
            y: y + 78,
            w: 88,
            h: 48,
            props: { text: "⏭" },
            events: {
              on_click: `then:
  - homeassistant.action:
      action: media_player.media_next_track
      data:
        entity_id: ${ent}`,
            },
          },
          {
            id: sldVol,
            type: "slider",
            x,
            y: y + 132,
            w: 280,
            h: 46,
            props: { min: 0, max: 100 },
            events: {
              on_release: `then:
  - homeassistant.action:
      action: media_player.volume_set
      data:
        entity_id: ${ent}
        volume_level: !lambda return (float)x / 100.0;`,
            },
          },
          {
            id: lblVol,
            type: "label",
            x: x + 290,
            y: y + 132,
            w: 80,
            h: 46,
            props: { text: "0" },
          },
        ],
      };
    },
  },

,
{
  id: "ha_switch_toggle",
  title: "Home Assistant • Switch (Toggle)",
  description: "Single toggle button bound to a switch entity (like a simple Lovelace toggle).",
  build: ({ entity_id, x = 20, y = 20, label = "Switch" }) => {
    const btnId = uid("btn_sw");
    const ent = entity_id || "switch.example";
    return {
      bindings: entity_id ? [{ entity_id, kind: "binary" }] : [],
      links: entity_id
        ? [{ source: { entity_id, kind: "binary", attribute: "" }, target: { widget_id: btnId, action: "widget_checked" } }]
        : [],
      widgets: [
        {
          id: btnId,
          type: "button",
          x,
          y,
          w: 220,
          h: 64,
          props: { text: label },
          events: entity_id
            ? {
                on_click:
                  "- homeassistant.service:\n    service: switch.toggle\n    data:\n      entity_id: " +
                  ent +
                  "\n",
              }
            : {},
        },
      ],
    };
  },
},
{
  id: "ha_cover_basic",
  title: "Home Assistant • Cover (Open/Stop/Close)",
  description: "3-button cover control (open, stop, close) like a compact Lovelace cover card.",
  build: ({ entity_id, x = 20, y = 20, label = "Cover" }) => {
    const ent = entity_id || "cover.example";
    const openId = uid("btn_cover_open");
    const stopId = uid("btn_cover_stop");
    const closeId = uid("btn_cover_close");
    return {
      bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
      widgets: [
        { id: uid("lbl_cover"), type: "label", x, y, w: 260, h: 30, props: { text: label } },
        {
          id: openId, type: "button", x, y: y + 40, w: 80, h: 60, props: { text: "Open" },
          events: entity_id ? { on_click: `- homeassistant.service:\n    service: cover.open_cover\n    data:\n      entity_id: ${ent}\n` } : {},
        },
        {
          id: stopId, type: "button", x: x + 90, y: y + 40, w: 80, h: 60, props: { text: "Stop" },
          events: entity_id ? { on_click: `- homeassistant.service:\n    service: cover.stop_cover\n    data:\n      entity_id: ${ent}\n` } : {},
        },
        {
          id: closeId, type: "button", x: x + 180, y: y + 40, w: 80, h: 60, props: { text: "Close" },
          events: entity_id ? { on_click: `- homeassistant.service:\n    service: cover.close_cover\n    data:\n      entity_id: ${ent}\n` } : {},
        },
      ],
    };
  },
},
{
  id: "ha_cover_tilt",
  title: "Home Assistant • Cover (Tilt)",
  description: "Tilt control (open/stop/close tilt + tilt position). Best-effort mapping to cover.*_tilt services.",
  build: ({ entity_id, x = 20, y = 20, label = "Cover Tilt" }) => {
    const ent = entity_id || "cover.example";
    const sldId = uid("sld_cover_tilt");
    const lblId = uid("lbl_cover_tilt");
    return {
      bindings: entity_id ? [{ entity_id, kind: "attribute_number", attribute: "current_tilt_position" }] : [],
      links: entity_id
        ? [
            { source: { entity_id, kind: "attribute_number", attribute: "current_tilt_position" }, target: { widget_id: sldId, action: "slider_value", scale: 1 } },
            { source: { entity_id, kind: "attribute_number", attribute: "current_tilt_position" }, target: { widget_id: lblId, action: "label_number", scale: 1 } },
          ]
        : [],
      widgets: [
        { id: uid("lbl_cover_tilt_title"), type: "label", x, y, w: 320, h: 28, props: { text: label } },

        { id: uid("btn_cover_tilt_open"), type: "button", x, y: y + 36, w: 96, h: 56, props: { text: "Tilt +" },
          events: entity_id ? { on_click: `- homeassistant.service:
    service: cover.open_cover_tilt
    data:
      entity_id: ${ent}
` } : {},
        },
        { id: uid("btn_cover_tilt_stop"), type: "button", x: x + 104, y: y + 36, w: 96, h: 56, props: { text: "Stop" },
          events: entity_id ? { on_click: `- homeassistant.service:
    service: cover.stop_cover_tilt
    data:
      entity_id: ${ent}
` } : {},
        },
        { id: uid("btn_cover_tilt_close"), type: "button", x: x + 208, y: y + 36, w: 96, h: 56, props: { text: "Tilt -" },
          events: entity_id ? { on_click: `- homeassistant.service:
    service: cover.close_cover_tilt
    data:
      entity_id: ${ent}
` } : {},
        },

        { id: sldId, type: "slider", x, y: y + 100, w: 260, h: 44, props: { min_value: 0, max_value: 100, value: 0 },
          events: entity_id ? { on_release: `then:
  - homeassistant.action:
      action: cover.set_cover_tilt_position
      data:
        entity_id: ${ent}
        tilt_position: !lambda return x;` } : {},
        },
        { id: lblId, type: "label", x: x + 270, y: y + 100, w: 60, h: 44, props: { text: "0" } },
      ],
    };
  },
},
{
  id: "ha_lock_toggle",
  title: "Home Assistant • Lock (Lock/Unlock)",
  description: "Lock/unlock buttons with a state label (like a minimal Lovelace lock control).",
  build: ({ entity_id, x = 20, y = 20, label = "Lock" }) => {
    const ent = entity_id || "lock.example";
    const stateLbl = uid("lbl_lock_state");
    const lockBtn = uid("btn_lock");
    const unlockBtn = uid("btn_unlock");
    return {
      bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
      links: entity_id
        ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: stateLbl, action: "label_text" } }]
        : [],
      widgets: [
        { id: uid("lbl_lock_title"), type: "label", x, y, w: 260, h: 30, props: { text: label } },
        { id: stateLbl, type: "label", x, y: y + 28, w: 260, h: 24, props: { text: "(state)" } },
        {
          id: lockBtn, type: "button", x, y: y + 60, w: 120, h: 60, props: { text: "Lock" },
          events: entity_id ? { on_click: `- homeassistant.service:\n    service: lock.lock\n    data:\n      entity_id: ${ent}\n` } : {},
        },
        {
          id: unlockBtn, type: "button", x: x + 140, y: y + 60, w: 120, h: 60, props: { text: "Unlock" },
          events: entity_id ? { on_click: `- homeassistant.service:\n    service: lock.unlock\n    data:\n      entity_id: ${ent}\n` } : {},
        },
      ],
    };
  },
},
{
  id: "ha_media_basic",
  title: "Home Assistant • Media Player (Transport + Volume)",
  description: "Play/pause + prev/next + mute and a volume slider. First-pass Lovelace-style media control.",
  build: ({ entity_id, x = 20, y = 20, label = "Media", media_show_transport = true, media_show_volume = true, media_show_mute = true, media_show_source = true, media_default_source = "", caps = null }) => {
    const ent = entity_id || "media_player.example";
    const btnPlay = uid("btn_media_playpause");
    const btnPrev = uid("btn_media_prev");
    const btnNext = uid("btn_media_next");
    const btnMute = uid("btn_media_mute");
    const sldVol = uid("sld_media_vol");
    const lblVol = uid("lbl_media_vol");
    const lblState = uid("lbl_media_state");

    return {
      bindings: entity_id
        ? [
            { entity_id, kind: "state" },
            { entity_id, kind: "attribute_number", attribute: "volume_level" },
            { entity_id, kind: "attribute_boolean", attribute: "is_volume_muted" },
          ]
        : [],
      links: entity_id
        ? [
            { source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblState, action: "label_text" } },
            { source: { entity_id, kind: "attribute_number", attribute: "volume_level" }, target: { widget_id: sldVol, action: "slider_value", scale: 100 } },
            { source: { entity_id, kind: "attribute_number", attribute: "volume_level" }, target: { widget_id: lblVol, action: "label_number", scale: 100 } },
            { source: { entity_id, kind: "attribute_boolean", attribute: "is_volume_muted" }, target: { widget_id: btnMute, action: "widget_checked" } },
          ]
        : [],
      widgets: [
        { id: uid("lbl_media_title"), type: "label", x, y, w: 340, h: 28, props: { text: label } },
        { id: lblState, type: "label", x, y: y + 26, w: 340, h: 24, props: { text: "(state)" } },

        {
          id: btnPrev,
          type: "button",
          x,
          y: y + 58,
          w: 90,
          h: 58,
          props: { text: "⏮" },
          events: entity_id
            ? { on_click: `- homeassistant.service:
    service: media_player.media_previous_track
    data:
      entity_id: ${ent}
` }
            : {},
        },
        {
          id: btnPlay,
          type: "button",
          x: x + 100,
          y: y + 58,
          w: 140,
          h: 58,
          props: { text: "Play/Pause" },
          events: entity_id
            ? { on_click: `- homeassistant.service:
    service: media_player.media_play_pause
    data:
      entity_id: ${ent}
` }
            : {},
        },
        {
          id: btnNext,
          type: "button",
          x: x + 250,
          y: y + 58,
          w: 90,
          h: 58,
          props: { text: "⏭" },
          events: entity_id
            ? { on_click: `- homeassistant.service:
    service: media_player.media_next_track
    data:
      entity_id: ${ent}
` }
            : {},
        },

        {
          id: btnMute,
          type: "switch",
          x,
          y: y + 126,
          w: 120,
          h: 44,
          props: { text: "Mute" },
          events: entity_id
            ? {
                on_value_changed: `- homeassistant.service:
    service: media_player.volume_mute
    data:
      entity_id: ${ent}
      is_volume_muted: !lambda 'return x > 0;'
`,
              }
            : {},
        },

        {
          id: sldVol,
          type: "slider",
          x: x + 130,
          y: y + 126,
          w: 210,
          h: 44,
          props: { min_value: 0, max_value: 100, value: 50 },
          events: entity_id
            ? {
                // Use on_release to avoid spamming while dragging.
                on_release:
                  `then:
  - homeassistant.action:
      action: media_player.volume_set
      data:
        entity_id: ${ent}
        volume_level: !lambda return (float)x / 100.0;`,
              }
            : {},
        },
        { id: lblVol, type: "label", x: x + 345, y: y + 126, w: 60, h: 44, props: { text: "0" } },
      ],
    };
  },
},
{
  id: "ha_sensor_tile",
  title: "Home Assistant • Sensor Tile",
  description: "Large value + small label. Good starting point for dashboards (temperature, humidity, power, etc).",
  build: ({ entity_id, x = 20, y = 20, label = "Sensor" }) => {
    const ent = entity_id || "sensor.example";
    const valId = uid("lbl_val");
    return {
      bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
      links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: valId, action: "label_text" } }] : [],
      widgets: [
        { id: uid("lbl_sensor_title"), type: "label", x, y, w: 260, h: 24, props: { text: label } },
        { id: valId, type: "label", x, y: y + 30, w: 260, h: 60, props: { text: "--" }, style: { text_font: "montserrat_28" } },
      ],
    };
  },
},

  {
    id: "ha_media_player_rich",
    title: "Home Assistant • Media Player (Rich)",
    description:
      "Media player with title + artist + transport + volume slider. Uses live links for metadata and volume_level.",
    build: ({ entity_id, x = 460, y = 140, label = "Media" }) => {
      const lblTitle = uid("lbl_title");
      const lblArtist = uid("lbl_artist");
      const sldVol = uid("sld_vol");
      const lblVol = uid("lbl_vol");
      const ent = entity_id || "media_player.example";

      return {
        bindings: entity_id
          ? [
              { entity_id, kind: "attribute_text", attribute: "media_title" },
              { entity_id, kind: "attribute_text", attribute: "media_artist" },
              { entity_id, kind: "attribute_number", attribute: "volume_level" },
            ]
          : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "attribute_text", attribute: "media_title" },
                target: { widget_id: lblTitle, action: "label_text" },
              },
              {
                source: { entity_id, kind: "attribute_text", attribute: "media_artist" },
                target: { widget_id: lblArtist, action: "label_text" },
              },
              {
                // HA volume_level is 0..1; scale to 100 for slider.
                source: { entity_id, kind: "attribute_number", attribute: "volume_level" },
                target: { widget_id: sldVol, action: "slider_value", scale: 100.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "volume_level" },
                target: { widget_id: lblVol, action: "label_text", format: "%.0f", scale: 100.0 },
              },
            ]
          : [],
        widgets: [
          {
            id: uid("lbl_head"),
            type: "label",
            x,
            y,
            props: { text: label },
            style: { text_align: "left" },
          },
          {
            id: lblTitle,
            type: "label",
            x,
            y: y + 26,
            props: { text: "Title" },
            style: { text_align: "left" },
          },
          {
            id: lblArtist,
            type: "label",
            x,
            y: y + 46,
            props: { text: "Artist" },
            style: { text_align: "left" },
          },
          {
            id: uid("btn_prev"),
            type: "button",
            x,
            y: y + 72,
            props: {
              text: "⏮",
              on_press: `then:\n  - homeassistant.action:\n      action: media_player.media_previous_track\n      data:\n        entity_id: ${ent}`,
            },
          },
          {
            id: uid("btn_play"),
            type: "button",
            x: x + 60,
            y: y + 72,
            props: {
              text: "⏯",
              on_press: `then:\n  - homeassistant.action:\n      action: media_player.media_play_pause\n      data:\n        entity_id: ${ent}`,
            },
          },
          {
            id: uid("btn_next"),
            type: "button",
            x: x + 120,
            y: y + 72,
            props: {
              text: "⏭",
              on_press: `then:\n  - homeassistant.action:\n      action: media_player.media_next_track\n      data:\n        entity_id: ${ent}`,
            },
          },
          {
            id: sldVol,
            type: "slider",
            x,
            y: y + 120,
            props: {
              min_value: 0,
              max_value: 100,
              value: 30,
              // Use on_release to reduce call spam while dragging.
              on_release: `then:\n  - homeassistant.action:\n      action: media_player.volume_set\n      data:\n        entity_id: ${ent}\n        volume_level: !lambda return (x / 100.0f);`,
            },
          },
          {
            id: lblVol,
            type: "label",
            x: x + 160,
            y: y + 116,
            props: { text: "30" },
          },
        ],
      };
    },
  },


  {
    id: "ha_climate_heat_only",
    title: "Home Assistant • Climate (Heat + Setpoint)",
    description: "Climate control for heat-only thermostats: Heat/Off + setpoint slider.",
    build: ({ entity_id, x = 20, y = 160, label = "Thermostat" }) => {
      const baseTmpl = CONTROL_TEMPLATES.find((t) => t.id === "ha_climate_full");
      if (!baseTmpl) throw new Error("ha_climate_full template not found");
      const base = baseTmpl.build({ entity_id, x, y, label });
      // Remove cool/auto buttons if present
      const widgets = (base.widgets || []).filter((w: any) => {
        const id = String(w.id || "");
        return !id.includes("btn_cool") && !id.includes("btn_auto");
      });
      return { ...base, widgets };
    },
  },

  {
    id: "ha_climate_heat_cool",
    title: "Home Assistant • Climate (Heat/Cool + Setpoint)",
    description: "Climate control for heat/cool thermostats: Heat/Cool/Off + setpoint slider.",
    build: ({ entity_id, x = 20, y = 160, label = "Thermostat" }) => {
      const baseTmpl = CONTROL_TEMPLATES.find((t) => t.id === "ha_climate_full");
      if (!baseTmpl) throw new Error("ha_climate_full template not found");
      const base = baseTmpl.build({ entity_id, x, y, label });
      // Remove auto button if present
      const widgets = (base.widgets || []).filter((w: any) => {
        const id = String(w.id || "");
        return !id.includes("btn_auto");
      });
      return { ...base, widgets };
    },
  },


  // --- v0.54+ : Wizard "Auto" template (domain -> best parity macro) ---
  {
    id: "ha_auto",
    title: "Home Assistant • Auto (Wizard)",
    description: "Drop, pick an entity, and the wizard chooses the best matching control template for that domain.",
    build: ({}) => {
      // This template is resolved in the wizard (App.tsx) and should never be built directly.
      return { widgets: [] };
    },
  },

  // --- v0.54.0 : Switch parity (toggle + state label) ---
  {
    id: "ha_switch_parity",
    title: "Home Assistant • Switch (Parity)",
    description: "Toggle + state label, similar to HA Lovelace toggles.",
    build: ({ entity_id, x = 20, y = 20, label = "Switch" }) => {
      const btnId = uid("btn_sw");
      const lblId = uid("lbl_sw");
      const ent = entity_id || "switch.example";
      return {
        bindings: entity_id ? [{ entity_id, kind: "binary" }, { entity_id, kind: "state" }] : [],
        links: entity_id
          ? [
              { source: { entity_id, kind: "binary", attribute: "" }, target: { widget_id: btnId, action: "widget_checked" } },
              { source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } },
            ]
          : [],
        widgets: [
          {
            id: btnId,
            type: "button",
            x,
            y,
            w: 220,
            h: 64,
            props: { text: label },
            events: entity_id
              ? {
                  on_click:
                    "- homeassistant.service:\n    service: switch.toggle\n    data:\n      entity_id: " +
                    ent +
                    "\n",
                }
              : {},
          },
          { id: lblId, type: "label", x, y: y + 70, w: 220, h: 24, props: { text: "unknown" } },
        ],
      };
    },
  },

  // --- v0.54.0 : Lock parity (lock/unlock + state) ---
  {
    id: "ha_lock_parity",
    title: "Home Assistant • Lock (Parity)",
    description: "Lock/Unlock buttons + state label.",
    build: ({ entity_id, x = 20, y = 20, label = "Lock" }) => {
      const btnLock = uid("btn_lock");
      const btnUnlock = uid("btn_unlock");
      const lblId = uid("lbl_lock");
      const ent = entity_id || "lock.example";
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } }] : [],
        widgets: [
          { id: uid("lbl_lock_title"), type: "label", x, y, w: 240, h: 22, props: { text: label } },
          {
            id: btnLock,
            type: "button",
            x,
            y: y + 28,
            w: 115,
            h: 56,
            props: { text: "Lock" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: lock.lock\n    data:\n      entity_id: " + ent + "\n" }
              : {},
          },
          {
            id: btnUnlock,
            type: "button",
            x: x + 125,
            y: y + 28,
            w: 115,
            h: 56,
            props: { text: "Unlock" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: lock.unlock\n    data:\n      entity_id: " + ent + "\n" }
              : {},
          },
          { id: lblId, type: "label", x, y: y + 90, w: 240, h: 24, props: { text: "unknown" } },
        ],
      };
    },
  },

  // --- v0.54.0 : Alarm parity (arm/disarm shortcuts + state) ---
  {
    id: "ha_alarm_parity",
    title: "Home Assistant • Alarm (Parity)",
    description: "Arm Home / Arm Away / Disarm buttons + state label.",
    build: ({ entity_id, x = 20, y = 20, label = "Alarm" }) => {
      const ent = entity_id || "alarm_control_panel.example";
      const lblId = uid("lbl_alarm");
      const btnHome = uid("btn_alarm_home");
      const btnAway = uid("btn_alarm_away");
      const btnDisarm = uid("btn_alarm_disarm");
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } }] : [],
        widgets: [
          { id: uid("lbl_alarm_title"), type: "label", x, y, w: 320, h: 22, props: { text: label } },
          {
            id: btnHome,
            type: "button",
            x,
            y: y + 28,
            w: 100,
            h: 54,
            props: { text: "Home" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: alarm_control_panel.alarm_arm_home\n    data:\n      entity_id: " + ent + "\n" }
              : {},
          },
          {
            id: btnAway,
            type: "button",
            x: x + 110,
            y: y + 28,
            w: 100,
            h: 54,
            props: { text: "Away" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: alarm_control_panel.alarm_arm_away\n    data:\n      entity_id: " + ent + "\n" }
              : {},
          },
          {
            id: btnDisarm,
            type: "button",
            x: x + 220,
            y: y + 28,
            w: 100,
            h: 54,
            props: { text: "Disarm" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: alarm_control_panel.alarm_disarm\n    data:\n      entity_id: " + ent + "\n" }
              : {},
          },
          { id: lblId, type: "label", x, y: y + 88, w: 320, h: 24, props: { text: "unknown" } },
        ],
      };
    },
  },

  // --- v0.55.0 : Select parity (dropdown + current option) ---
  {
    id: "ha_select_parity",
    title: "Home Assistant • Select (Parity)",
    description: "Dropdown control bound to a select entity (options inferred when available).",
    build: ({ entity_id, x = 20, y = 20, label = "Select" }) => {
      const ent = entity_id || "select.example";
      const ddId = uid("dd_select");
      const lblId = uid("lbl_select");
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } }] : [],
        widgets: [
          { id: uid("lbl_select_title"), type: "label", x, y, w: 260, h: 22, props: { text: label } },
          { id: ddId, type: "dropdown", x, y: y + 28, w: 260, h: 50, props: { options: ["Option 1", "Option 2"] } },
          { id: lblId, type: "label", x, y: y + 84, w: 260, h: 22, props: { text: "unknown" } },
        ],
      };
    },
  },

  // --- v0.55.0 : Number parity (slider + value label) ---
  {
    id: "ha_number_parity",
    title: "Home Assistant • Number (Parity)",
    description: "Slider control bound to a number entity (min/max inferred when available).",
    build: ({ entity_id, x = 20, y = 20, label = "Number" }) => {
      const ent = entity_id || "number.example";
      const sldId = uid("sld_num");
      const lblId = uid("lbl_num");
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id
          ? [
              { source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: sldId, action: "slider_value", scale: 1.0 } },
              { source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text", format: "%.2f", scale: 1.0 } },
            ]
          : [],
        widgets: [
          { id: uid("lbl_num_title"), type: "label", x, y, w: 260, h: 22, props: { text: label } },
          { id: sldId, type: "slider", x, y: y + 28, w: 260, h: 38, props: { min: 0, max: 100 } },
          { id: lblId, type: "label", x, y: y + 70, w: 260, h: 22, props: { text: "0" } },
          {
            id: uid("btn_num_set"),
            type: "button",
            x,
            y: y + 96,
            w: 260,
            h: 46,
            props: { text: "Set" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: number.set_value\n    data:\n      entity_id: " + ent + "\n      value: !lambda 'return x; '\n" }
              : {},
          },
        ],
      };
    },
  },

  // --- v0.56.0 : input_* helpers ---
  {
    id: "ha_input_boolean",
    title: "Home Assistant • input_boolean",
    description: "Toggle button bound to an input_boolean helper.",
    build: ({ entity_id, x = 20, y = 20, label = "Input Boolean" }) => {
      const ent = entity_id || "input_boolean.example";
      const btnId = uid("btn_in_bool");
      return {
        bindings: entity_id ? [{ entity_id, kind: "binary" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "binary", attribute: "" }, target: { widget_id: btnId, action: "widget_checked" } }] : [],
        widgets: [
          {
            id: btnId,
            type: "button",
            x,
            y,
            w: 240,
            h: 64,
            props: { text: label },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: input_boolean.toggle\n    data:\n      entity_id: " + ent + "\n" }
              : {},
          },
        ],
      };
    },
  },
  {
    id: "ha_input_number",
    title: "Home Assistant • input_number",
    description: "Slider + value label bound to an input_number helper.",
    build: ({ entity_id, x = 20, y = 20, label = "Input Number" }) => {
      const ent = entity_id || "input_number.example";
      const sldId = uid("sld_in_num");
      const lblId = uid("lbl_in_num");
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id
          ? [
              { source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: sldId, action: "slider_value", scale: 1.0 } },
              { source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text", format: "%.2f", scale: 1.0 } },
            ]
          : [],
        widgets: [
          { id: uid("lbl_in_num_title"), type: "label", x, y, w: 260, h: 22, props: { text: label } },
          { id: sldId, type: "slider", x, y: y + 28, w: 260, h: 38, props: { min: 0, max: 100 } },
          { id: lblId, type: "label", x, y: y + 70, w: 260, h: 22, props: { text: "0" } },
          {
            id: uid("btn_in_num_set"),
            type: "button",
            x,
            y: y + 96,
            w: 260,
            h: 46,
            props: { text: "Set" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: input_number.set_value\n    data:\n      entity_id: " + ent + "\n      value: !lambda 'return x; '\n" }
              : {},
          },
        ],
      };
    },
  },
  {
    id: "ha_input_select",
    title: "Home Assistant • input_select",
    description: "Dropdown bound to an input_select helper.",
    build: ({ entity_id, x = 20, y = 20, label = "Input Select" }) => {
      const ddId = uid("dd_in_sel");
      const lblId = uid("lbl_in_sel");
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } }] : [],
        widgets: [
          { id: uid("lbl_in_sel_title"), type: "label", x, y, w: 260, h: 22, props: { text: label } },
          { id: ddId, type: "dropdown", x, y: y + 28, w: 260, h: 50, props: { options: ["Option 1", "Option 2"] } },
          { id: lblId, type: "label", x, y: y + 84, w: 260, h: 22, props: { text: "unknown" } },
        ],
      };
    },
  },
  {
    id: "ha_input_text",
    title: "Home Assistant • input_text",
    description: "Text display + 'Set' button (service call) bound to input_text helper.",
    build: ({ entity_id, x = 20, y = 20, label = "Input Text" }) => {
      const ent = entity_id || "input_text.example";
      const lblId = uid("lbl_in_text");
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblId, action: "label_text" } }] : [],
        widgets: [
          { id: uid("lbl_in_text_title"), type: "label", x, y, w: 260, h: 22, props: { text: label } },
          { id: lblId, type: "label", x, y: y + 28, w: 260, h: 28, props: { text: "..." } },
          {
            id: uid("btn_in_text_set"),
            type: "button",
            x,
            y: y + 62,
            w: 260,
            h: 46,
            props: { text: "Set…" },
            events: entity_id
              ? { on_click: "- homeassistant.service:\n    service: input_text.set_value\n    data:\n      entity_id: " + ent + "\n      value: \"TODO\"\n" }
              : {},
          },
        ],
      };
    },
  },

  // --- v0.57.0 : Card Library v1 (container macros) ---
  {
    id: "conditional_card",
    title: "Card Library • Conditional",
    description: "Shows/hides its contents based on a condition over an entity value. Product-mode helper.",
    build: ({ entity_id, condition = 'x == "on"', x = 20, y = 20, label = "Conditional" }: any) => {
      const rootId = uid("cond");
      const hdrId = uid("lbl_cond");
      const ent = entity_id || "binary_sensor.example";
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "state", attribute: "" },
                target: { widget_id: rootId, action: "obj_hidden", condition_expr: String(condition || 'x == "on"') },
              },
            ]
          : [],
        widgets: [
          { id: rootId, type: "obj", x, y, w: 340, h: 120, props: { hidden: false } },
          { id: hdrId, type: "label", x: x + 12, y: y + 10, w: 316, h: 22, props: { text: label } },
          { id: uid("lbl_cond_help"), type: "label", x: x + 12, y: y + 40, w: 316, h: 70, props: { text: "Drop widgets on top of this card.\nString example: x == \"on\"\nContains: x.find(\"foo\") != std::string::npos\nNumbers: atof(x.c_str()) > 25" } },
        ],
      };
    },
  },
  {
    id: "entity_card",
    title: "Card Library • Entity Card",
    description: "Lovelace-style entity card (icon, name, state) with configurable tap action.",
    build: ({ entity_id, x = 20, y = 20, label = "Entity", tap_action = "more-info", service, service_data }) => {
      const ent = entity_id || "sensor.example";
      const stateId = uid("lbl_card_state");
      const btnId = uid("btn_card");
      const dataExtra = (service_data && String(service_data).trim()) ? ("\\n" + String(service_data).trim().split("\\n").map((l: string) => "      " + l).join("\\n")) : "";
      const actionYaml =
        tap_action === "toggle"
          ? "- homeassistant.service:\n    service: homeassistant.toggle\n    data:\n      entity_id: " + ent + "\n"
          : tap_action === "call-service"
          ? "- homeassistant.service:\n    service: " + (service || "homeassistant.toggle") + "\n    data:\n      entity_id: " + ent + dataExtra + "\n"
          : "- homeassistant.more_info:\n    entity_id: " + ent + "\n";
      return {
        bindings: entity_id ? [{ entity_id, kind: "state" }] : [],
        links: entity_id ? [{ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: stateId, action: "label_text" } }] : [],
        widgets: [
          { id: btnId, type: "container", x, y, w: 280, h: 96, props: { }, events: entity_id ? { on_click: actionYaml } : {} },
          { id: uid("lbl_card_icon"), type: "label", x: x + 8, y: y + 8, w: 40, h: 24, props: { text: "◎" } },
          { id: uid("lbl_card_title"), type: "label", x: x + 56, y: y + 8, w: 220, h: 24, props: { text: label } },
          { id: stateId, type: "label", x: x + 56, y: y + 40, w: 220, h: 24, props: { text: "unknown" } },
        ],
      };
    },
  },
  {
    id: "tile_card",
    title: "Card Library • Tile Card",
    description: "Lovelace-style tile card (big icon, label) with configurable tap action.",
    build: ({ entity_id, x = 20, y = 20, label = "Tile", tap_action = "toggle", service, service_data }) => {
      const ent = entity_id || "switch.example";
      const btnId = uid("btn_tile");
      const dataExtra = (service_data && String(service_data).trim()) ? ("\\n" + String(service_data).trim().split("\\n").map((l: string) => "      " + l).join("\\n")) : "";
      const actionYaml =
        tap_action === "toggle"
          ? "- homeassistant.service:\n    service: homeassistant.toggle\n    data:\n      entity_id: " + ent + "\n"
          : tap_action === "call-service"
          ? "- homeassistant.service:\n    service: " + (service || "homeassistant.toggle") + "\n    data:\n      entity_id: " + ent + dataExtra + "\n"
          : "- homeassistant.more_info:\n    entity_id: " + ent + "\n";
      return {
        widgets: [
          { id: btnId, type: "container", x, y, w: 140, h: 140, props: {}, events: entity_id ? { on_click: actionYaml } : {} },
          { id: uid("lbl_tile_icon"), type: "label", x: x + 50, y: y + 32, w: 40, h: 40, props: { text: "◎" } },
          { id: uid("lbl_tile_title"), type: "label", x: x + 10, y: y + 92, w: 120, h: 30, props: { text: label } },
        ],
      };
    },
  },

  // --- v0.60.0 : Card Library Phase 2 enhancements (Phase 2 cards + layout helpers) ---
  {
    id: "thermostat_card",
    title: "Card Library • Thermostat Card",
    description: "Thermostat card: title, current temp, setpoint slider, mode shortcuts. Binds to climate.* entities.",
    build: ({ entity_id, x = 20, y = 20, label = "Thermostat", th_min = 5, th_max = 35, th_step = 1, caps = null }) => {
      const ent = entity_id || "climate.example";
      const rootId = uid("card_th");
      const lblCur = uid("lbl_th_cur");
      const lblSet = uid("lbl_th_set");
      const lblMode = uid("lbl_th_mode");
      const sldSet = uid("sld_th_set");

      const btnOff = uid("btn_th_off");
      const btnHeat = uid("btn_th_heat");
      const btnCool = uid("btn_th_cool");
      const btnAuto = uid("btn_th_auto");

      return {
        bindings: entity_id
          ? [
              { entity_id, kind: "attribute_number", attribute: "current_temperature" },
              { entity_id, kind: "attribute_number", attribute: "temperature" },
              { entity_id, kind: "state" },
            ]
          : [],
        links: entity_id
          ? [
              {
                source: { entity_id, kind: "attribute_number", attribute: "current_temperature" },
                target: { widget_id: lblCur, action: "label_text", format: "%.1f°C", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "temperature" },
                target: { widget_id: lblSet, action: "label_text", format: "Set %.1f°C", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "attribute_number", attribute: "temperature" },
                target: { widget_id: sldSet, action: "slider_value", scale: 1.0 },
              },
              {
                source: { entity_id, kind: "state", attribute: "" },
                target: { widget_id: lblMode, action: "label_text", format: "Mode %s" },
              },
            ]
          : [],
        widgets: [
          { id: rootId, type: "container", x, y, w: 320, h: 190, props: {} },
          { id: uid("lbl_th_title"), type: "label", x: x + 12, y: y + 10, w: 296, h: 22, props: { text: label } },

          { id: lblCur, type: "label", x: x + 12, y: y + 40, w: 150, h: 26, props: { text: "--.-°C" } },
          { id: lblMode, type: "label", x: x + 170, y: y + 40, w: 138, h: 26, props: { text: "Mode --" } },

          { id: sldSet, type: "slider", x: x + 12, y: y + 72, w: 240, h: 40, props: { min: th_min, max: th_max } ,
            events: entity_id ? {
              on_release:
`- homeassistant.service:
    service: climate.set_temperature
    data:
      entity_id: ${ent}
      temperature: !lambda 'float s = (float)${th_step}; if (s <= 0.0f) s = 1.0f; return roundf(x / s) * s;'
`
            } : {}
          },
          { id: lblSet, type: "label", x: x + 258, y: y + 78, w: 54, h: 28, props: { text: "Set --" } },

          // Mode shortcuts
          { id: btnOff, type: "button", x: x + 12, y: y + 124, w: 70, h: 48, props: { text: "Off" },
            events: entity_id ? { on_click:
`- homeassistant.service:
    service: climate.set_hvac_mode
    data:
      entity_id: ${ent}
      hvac_mode: "off"
` } : {}
          },
          { id: btnHeat, type: "button", x: x + 90, y: y + 124, w: 70, h: 48, props: { text: "Heat" },
            events: entity_id ? { on_click:
`- homeassistant.service:
    service: climate.set_hvac_mode
    data:
      entity_id: ${ent}
      hvac_mode: "heat"
` } : {}
          },
          { id: btnCool, type: "button", x: x + 168, y: y + 124, w: 70, h: 48, props: { text: "Cool" },
            events: entity_id ? { on_click:
`- homeassistant.service:
    service: climate.set_hvac_mode
    data:
      entity_id: ${ent}
      hvac_mode: "cool"
` } : {}
          },
          { id: btnAuto, type: "button", x: x + 246, y: y + 124, w: 66, h: 48, props: { text: "Auto" },
            events: entity_id ? { on_click:
`- homeassistant.service:
    service: climate.set_hvac_mode
    data:
      entity_id: ${ent}
      hvac_mode: "auto"
` } : {}
          },
        ],
      };
    },
  },

  {
    id: "media_control_card",
    title: "Card Library • Media Control Card",
    description:
      "Media control card: title, media title, transport controls, volume controls, and optional source row. Binds to media_player.*",
    build: ({
      entity_id,
      x = 20,
      y = 20,
      label = "Media",
      media_show_transport = true,
      media_show_volume = true,
      media_show_mute = true,
      media_show_source = true,
      media_default_source = "",
      caps = null,
    }) => {
      const ent = entity_id || "media_player.example";
      const rootId = uid("card_mp");
      const lblState = uid("lbl_mp_state");
      const lblTitle = uid("lbl_mp_title");
      const sldVol = uid("sld_mp_vol");
      const lblVol = uid("lbl_mp_vol");
      const lblSrc = uid("lbl_mp_src");

      const widgets: any[] = [];
      const bindings: any[] = [];
      const links: any[] = [];

      widgets.push({ id: rootId, type: "container", x, y, w: 320, h: 220, props: {} });
      widgets.push({ id: uid("lbl_mp_hdr"), type: "label", x: x + 12, y: y + 10, w: 296, h: 22, props: { text: label } });

      widgets.push({ id: lblTitle, type: "label", x: x + 12, y: y + 38, w: 296, h: 24, props: { text: "—" } });
      widgets.push({ id: lblState, type: "label", x: x + 12, y: y + 64, w: 296, h: 20, props: { text: "idle" } });

      if (entity_id) {
        bindings.push({ entity_id, kind: "state" });
        bindings.push({ entity_id, kind: "attribute_text", attribute: "media_title" });
        bindings.push({ entity_id, kind: "attribute_number", attribute: "volume_level" });
        bindings.push({ entity_id, kind: "attribute_text", attribute: "source" });
        bindings.push({ entity_id, kind: "attribute_number", attribute: "is_volume_muted" });
        links.push({ source: { entity_id, kind: "state", attribute: "" }, target: { widget_id: lblState, action: "label_text" } });
        links.push({ source: { entity_id, kind: "attribute_text", attribute: "media_title" }, target: { widget_id: lblTitle, action: "label_text" } });
      }

      let cursorY = y + 92;

      // Transport controls
      if (media_show_transport) {
        widgets.push({
          id: uid("btn_mp_prev"),
          type: "button",
          x: x + 12,
          y: cursorY,
          w: 92,
          h: 50,
          props: { text: "Prev" },
          events: entity_id
            ? {
                on_click: `- homeassistant.service:\n    service: media_player.media_previous_track\n    data:\n      entity_id: ${ent}\n`,
              }
            : {},
        });
        widgets.push({
          id: uid("btn_mp_play"),
          type: "button",
          x: x + 114,
          y: cursorY,
          w: 92,
          h: 50,
          props: { text: "Play/Pause" },
          events: entity_id
            ? {
                on_click: `- homeassistant.service:\n    service: media_player.media_play_pause\n    data:\n      entity_id: ${ent}\n`,
              }
            : {},
        });
        widgets.push({
          id: uid("btn_mp_next"),
          type: "button",
          x: x + 216,
          y: cursorY,
          w: 92,
          h: 50,
          props: { text: "Next" },
          events: entity_id
            ? {
                on_click: `- homeassistant.service:\n    service: media_player.media_next_track\n    data:\n      entity_id: ${ent}\n`,
              }
            : {},
        });
        cursorY += 58;
      }

      // Volume controls
      if (media_show_volume) {
        if (entity_id) {
          links.push({
            source: { entity_id, kind: "attribute_number", attribute: "volume_level" },
            target: { widget_id: sldVol, action: "slider_value", scale: 100.0 },
          });
          links.push({
            source: { entity_id, kind: "attribute_number", attribute: "volume_level" },
            target: { widget_id: lblVol, action: "label_text", format: "%.0f%%", scale: 100.0 },
          });
        }

        widgets.push({
          id: sldVol,
          type: "slider",
          x: x + 12,
          y: cursorY,
          w: 240,
          h: 36,
          props: { min: 0, max: 100 },
          events: entity_id
            ? {
                on_release: `- homeassistant.service:\n    service: media_player.volume_set\n    data:\n      entity_id: ${ent}\n      volume_level: !lambda 'return x / 100.0;'\n`,
              }
            : {},
        });
        widgets.push({ id: lblVol, type: "label", x: x + 258, y: cursorY + 4, w: 54, h: 28, props: { text: "0%" } });

        if (media_show_mute) {
          widgets.push({
            id: uid("btn_mp_vol_dn"),
            type: "button",
            x: x + 12,
            y: cursorY + 42,
            w: 92,
            h: 40,
            props: { text: "Vol -" },
            events: entity_id
              ? { on_click: `- homeassistant.service:\n    service: media_player.volume_down\n    data:\n      entity_id: ${ent}\n` }
              : {},
          });
          widgets.push({
            id: uid("btn_mp_mute"),
            type: "button",
            x: x + 114,
            y: cursorY + 42,
            w: 92,
            h: 40,
            props: { text: "Mute" },
            events: entity_id
              ? { on_click: `- homeassistant.service:\n    service: media_player.volume_mute\n    data:\n      entity_id: ${ent}\n      is_volume_muted: true\n` }
              : {},
          });
          widgets.push({
            id: uid("btn_mp_vol_up"),
            type: "button",
            x: x + 216,
            y: cursorY + 42,
            w: 92,
            h: 40,
            props: { text: "Vol +" },
            events: entity_id
              ? { on_click: `- homeassistant.service:\n    service: media_player.volume_up\n    data:\n      entity_id: ${ent}\n` }
              : {},
          });
          cursorY += 88;
        } else {
          cursorY += 46;
        }
      }

      // Source row (best-effort)
      const sourceList = (caps && caps.attributes && Array.isArray(caps.attributes.source_list)) ? caps.attributes.source_list : [];
      if (media_show_source && (sourceList.length > 0 || media_default_source)) {
        if (entity_id) {
          links.push({ source: { entity_id, kind: "attribute_text", attribute: "source" }, target: { widget_id: lblSrc, action: "label_text", format: "Source %s" } });
        }
        widgets.push({ id: lblSrc, type: "label", x: x + 12, y: cursorY, w: 296, h: 22, props: { text: "Source —" } });
        const src = media_default_source || (sourceList.length > 0 ? String(sourceList[0]) : "");
        widgets.push({
          id: uid("btn_mp_src"),
          type: "button",
          x: x + 12,
          y: cursorY + 26,
          w: 296,
          h: 40,
          props: { text: src ? `Select: ${src}` : "Select source" },
          events: entity_id && src
            ? { on_click: `- homeassistant.service:\n    service: media_player.select_source\n    data:\n      entity_id: ${ent}\n      source: "${src.replace(/"/g, '\\"')}"\n` }
            : {},
        });
        cursorY += 72;
      }

      // Resize container height to fit (simple estimate)
      const h = Math.max(190, (cursorY - y) + 12);
      widgets[0].h = h;

      return { widgets, bindings: entity_id ? bindings : [], links: entity_id ? links : [] };
    },
  },


  {
    id: "cover_card",
    title: "Card Library • Cover Card",
    description:
      "Cover card: open/stop/close + position slider, with optional tilt controls when supported. Binds to cover.* entities.",
    build: ({ entity_id, x = 20, y = 20, label = "Cover", cover_show_tilt = true, caps = null }) => {
      const ent = entity_id || "cover.example";
      const rootId = uid("card_cv");
      const sldPos = uid("sld_cv_pos");
      const lblPos = uid("lbl_cv_pos");

      const widgets: any[] = [];
      const bindings: any[] = [];
      const links: any[] = [];

      widgets.push({ id: rootId, type: "container", x, y, w: 320, h: 200, props: {} });
      widgets.push({ id: uid("lbl_cv_hdr"), type: "label", x: x + 12, y: y + 10, w: 296, h: 22, props: { text: label } });

      // Position
      widgets.push({
        id: sldPos,
        type: "slider",
        x: x + 12,
        y: y + 40,
        w: 240,
        h: 40,
        props: { min: 0, max: 100 },
        events: entity_id
          ? {
              on_release: `- homeassistant.service:\n    service: cover.set_cover_position\n    data:\n      entity_id: ${ent}\n      position: !lambda 'return (int)x;'\n`,
            }
          : {},
      });
      widgets.push({ id: lblPos, type: "label", x: x + 258, y: y + 46, w: 54, h: 28, props: { text: "--%" } });

      if (entity_id) {
        bindings.push({ entity_id, kind: "attribute_number", attribute: "current_position" });
        links.push({ source: { entity_id, kind: "attribute_number", attribute: "current_position" }, target: { widget_id: sldPos, action: "slider_value", scale: 1.0 } });
        links.push({ source: { entity_id, kind: "attribute_number", attribute: "current_position" }, target: { widget_id: lblPos, action: "label_text", format: "%.0f%%", scale: 1.0 } });
      }

      let cursorY = y + 92;

      // Optional tilt controls
      const tiltSupported =
        cover_show_tilt &&
        (caps?.attributes?.current_tilt_position !== undefined ||
          caps?.attributes?.tilt_position !== undefined ||
          caps?.attributes?.supported_features !== undefined);

      if (tiltSupported) {
        const sldTilt = uid("sld_cv_tilt");
        const lblTilt = uid("lbl_cv_tilt");
        widgets.push({
          id: sldTilt,
          type: "slider",
          x: x + 12,
          y: cursorY,
          w: 240,
          h: 34,
          props: { min: 0, max: 100 },
          events: entity_id
            ? {
                on_release: `- homeassistant.service:\n    service: cover.set_cover_tilt_position\n    data:\n      entity_id: ${ent}\n      tilt_position: !lambda 'return (int)x;'\n`,
              }
            : {},
        });
        widgets.push({ id: lblTilt, type: "label", x: x + 258, y: cursorY + 2, w: 54, h: 28, props: { text: "--" } });

        if (entity_id) {
          bindings.push({ entity_id, kind: "attribute_number", attribute: "current_tilt_position" });
          links.push({ source: { entity_id, kind: "attribute_number", attribute: "current_tilt_position" }, target: { widget_id: sldTilt, action: "slider_value", scale: 1.0 } });
          links.push({ source: { entity_id, kind: "attribute_number", attribute: "current_tilt_position" }, target: { widget_id: lblTilt, action: "label_text", format: "%.0f%%", scale: 1.0 } });
        }

        cursorY += 44;
      }

      // Buttons
      widgets.push({
        id: uid("btn_cv_open"),
        type: "button",
        x: x + 12,
        y: cursorY,
        w: 92,
        h: 56,
        props: { text: "Open" },
        events: entity_id ? { on_click: `- homeassistant.service:\n    service: cover.open_cover\n    data:\n      entity_id: ${ent}\n` } : {},
      });
      widgets.push({
        id: uid("btn_cv_stop"),
        type: "button",
        x: x + 114,
        y: cursorY,
        w: 92,
        h: 56,
        props: { text: "Stop" },
        events: entity_id ? { on_click: `- homeassistant.service:\n    service: cover.stop_cover\n    data:\n      entity_id: ${ent}\n` } : {},
      });
      widgets.push({
        id: uid("btn_cv_close"),
        type: "button",
        x: x + 216,
        y: cursorY,
        w: 92,
        h: 56,
        props: { text: "Close" },
        events: entity_id ? { on_click: `- homeassistant.service:\n    service: cover.close_cover\n    data:\n      entity_id: ${ent}\n` } : {},
      });

      widgets[0].h = (cursorY - y) + 70;

      return { widgets, bindings: entity_id ? bindings : [], links: entity_id ? links : [] };
    },
  },


  {
    id: "glance_card",
    title: "Card Library • Glance Card",
    description: "Glance card: up to 4 entity rows (name + state). Provide entities: string[] to pre-bind.",
    build: ({ entities = [], x = 20, y = 20, label = "Glance", max_rows = 4 }) => buildGlanceCard({ entities, x, y, label, max_rows }),
  },

  // v0.61: Glance card presets (row count variants)
  {
    id: "glance_card_2",
    title: "Card Library • Glance Card (2 rows)",
    description: "Glance card preset with 2 rows.",
    build: ({ entities = [], x = 20, y = 20, label = "Glance (2)" }) => buildGlanceCard({ entities, x, y, label, max_rows: 2 }),
  },
  {
    id: "glance_card_3",
    title: "Card Library • Glance Card (3 rows)",
    description: "Glance card preset with 3 rows.",
    build: ({ entities = [], x = 20, y = 20, label = "Glance (3)" }) => buildGlanceCard({ entities, x, y, label, max_rows: 3 }),
  },
  {
    id: "glance_card_6",
    title: "Card Library • Glance Card (6 rows)",
    description: "Glance card preset with 6 rows.",
    build: ({ entities = [], x = 20, y = 20, label = "Glance (6)" }) => buildGlanceCard({ entities, x, y, label, max_rows: 6 }),
  },


    {
    id: "grid_card_2x2",
    title: "Card Library • Grid Card (2×2)",
    description: "2×2 grid of tiles. Provide entities: string[] (up to 4) to pre-bind; configurable tap action per tile.",
    build: ({ entities = [], x = 20, y = 20, label = "Grid (2×2)", tap_action = "toggle", service, service_data }) => buildGridCard({ entities, x, y, label, cols: 2, rows: 2, tap_action, service, service_data }),
  },

  // v0.61: Grid card size variants
  {
    id: "grid_card_3x2",
    title: "Card Library • Grid Card (3×2)",
    description: "3×2 grid of tiles (6). Provide entities: string[] (up to 6).",
    build: ({ entities = [], x = 20, y = 20, label = "Grid (3×2)", tap_action = "toggle", service, service_data }) =>
      buildGridCard({ entities, x, y, label, cols: 3, rows: 2, tap_action, service, service_data }),
  },
  {
    id: "grid_card_3x3",
    title: "Card Library • Grid Card (3×3)",
    description: "3×3 grid of tiles (9). Provide entities: string[] (up to 9).",
    build: ({ entities = [], x = 20, y = 20, label = "Grid (3×3)", tap_action = "toggle", service, service_data }) =>
      buildGridCard({ entities, x, y, label, cols: 3, rows: 3, tap_action, service, service_data }),
  },


  {
    id: "layout_stack_vertical",
    title: "Card Library • Layout Helper (Vertical Stack)",
    description: "Drops three stacked containers as a layout scaffold (no bindings).",
    build: ({ x = 20, y = 20, w = 320, h = 420, gap = 12 }) => {
      const widgets: any[] = [];
      const itemH = Math.floor((h - gap * 2) / 3);
      for (let i = 0; i < 3; i++) {
        widgets.push({ id: uid("stack_item"), type: "container", x, y: y + i * (itemH + gap), w, h: itemH, props: {} });
      }
      return { widgets };
    },
  },




  // --- Card Library Phase 3 (v0.70.0) ---
  {
    id: "gauge_card",
    title: "Card Library • Gauge",
    description: "A simple gauge for numeric sensors (arc + value label).",
    build: ({ entity_id, x = 20, y = 20, label = "Gauge", min = 0, max = 100, unit = "" }: any) => {
      const rootId = uid('card_gauge');
      const arcId = uid('arc_gauge');
      const valId = uid('lbl_gauge_val');
      const ent = entity_id || 'sensor.example';
      return {
        widgets: [
          { id: rootId, type: 'container', x, y, w: 320, h: 160, props: {} },
          { id: uid('lbl_gauge_hdr'), type: 'label', x: x + 12, y: y + 10, w: 296, h: 22, props: { text: label } },
          { id: arcId, type: 'arc', x: x + 20, y: y + 40, w: 120, h: 120, props: { min, max, value: min } },
          { id: valId, type: 'label', x: x + 160, y: y + 80, w: 140, h: 36, props: { text: `—${unit ? ' ' + unit : ''}` } },
        ],
        bindings: entity_id ? [{ entity_id, kind: 'number' }] : [],
        links: entity_id ? [
          { source: { entity_id: ent, kind: 'number', attribute: '' }, target: { widget_id: arcId, action: 'arc_value' } },
          { source: { entity_id: ent, kind: 'number', attribute: '' }, target: { widget_id: valId, action: 'label_text', format: unit ? `%.1f ${unit}` : '%.1f' } },
        ] : [],
      };
    },
  },

  {
    id: "scene_card",
    title: "Card Library • Scene",
    description: "Run a Home Assistant scene.",
    build: ({ entity_id, x = 20, y = 20, label = "Scene" }: any) => {
      const btnId = uid('btn_scene');
      const ent = entity_id || 'scene.example';
      return {
        widgets: [
          { id: btnId, type: 'button', x, y, w: 280, h: 64, props: { text: label }, events: {
            on_click: `then:
  - homeassistant.action:
      action: scene.turn_on
      data:
        entity_id: ${ent}`
          }},
        ],
        bindings: [],
        links: [],
      };
    },
  },

  {
    id: "script_card",
    title: "Card Library • Script",
    description: "Run a Home Assistant script.",
    build: ({ entity_id, x = 20, y = 20, label = "Script" }: any) => {
      const btnId = uid('btn_script');
      const ent = entity_id || 'script.example';
      return {
        widgets: [
          { id: btnId, type: 'button', x, y, w: 280, h: 64, props: { text: label }, events: {
            on_click: `then:
  - homeassistant.action:
      action: script.turn_on
      data:
        entity_id: ${ent}`
          }},
        ],
        bindings: [],
        links: [],
      };
    },
  },

  {
    id: "chips_card",
    title: "Card Library • Chips",
    description: "Compact status chips for up to 6 entities.",
    build: ({ entities = [], x = 20, y = 20, label = "Status", max_items = 6 }: any) => {
      const rootId = uid('card_chips');
      const ents = (Array.isArray(entities) ? entities : []).slice(0, Math.max(1, Math.min(12, Number(max_items) || 6)));
      const widgets: any[] = [
        { id: rootId, type: 'container', x, y, w: 360, h: 48 + Math.ceil(ents.length/3)*34, props: {} },
        { id: uid('lbl_chips_hdr'), type: 'label', x: x + 12, y: y + 10, w: 336, h: 22, props: { text: label } },
      ];
      const bindings: any[] = [];
      const links: any[] = [];
      const chipW = 110;
      const chipH = 28;
      const gap = 8;
      const ox = x + 12;
      const oy = y + 36;
      ents.forEach((eid: string, i: number) => {
        const cx = ox + (i % 3) * (chipW + gap);
        const cy = oy + Math.floor(i / 3) * (chipH + gap);
        const lblId = uid('lbl_chip');
        widgets.push({ id: lblId, type: 'label', x: cx, y: cy, w: chipW, h: chipH, props: { text: eid ? eid.split('.')[1] || eid : 'chip' } });
        if (eid && eid.includes('.')) {
          bindings.push({ entity_id: eid, kind: 'state' });
          links.push({ source: { entity_id: eid, kind: 'state', attribute: '' }, target: { widget_id: lblId, action: 'label_text' } });
        }
      });
      return { widgets, bindings, links };
    },
  },

];
