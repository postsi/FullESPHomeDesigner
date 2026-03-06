/**
 * Prebuilt widgets: reusable building blocks for the canvas and for cards.
 * Dropped directly onto the canvas (no wizard). Each build() returns { widgets }.
 * Multi-widget prebuilts are wrapped in a group (root container + parent_id) so they move en masse.
 * Optional scripts and action_bindings are merged into the project on insert (same mechanism as Card Library).
 * Optional esphome_components contains YAML snippets for ESPHome sensors/intervals that make
 * prebuilts functional (e.g., wifi_signal sensor, time component).
 *
 * Only use widget types that ESPHome LVGL supports (same as palette: container, label, button,
 * bar, slider, led, dropdown, etc.). Do not use raw LVGL types that ESPHome does not render.
 */

function uid(prefix: string) {
  return prefix + "_" + Math.random().toString(16).slice(2, 8);
}

// ESPHome-native YAML snippets for prebuilt functionality.
// These are deduplicated by the compiler (same id = same component).
const ESPHOME_WIFI_SIGNAL = `
sensor:
  - platform: wifi_signal
    id: etd_wifi_signal
    name: "WiFi Signal"
    update_interval: 10s
`;

const ESPHOME_WIFI_IP = `
text_sensor:
  - platform: wifi_info
    ip_address:
      id: etd_wifi_ip
      name: "IP Address"
`;

const ESPHOME_API_STATUS = `
binary_sensor:
  - platform: status
    id: etd_api_connected
    name: "API Connected"
`;

const ESPHOME_TIME_SNTP = `
time:
  - platform: sntp
    id: etd_time
    timezone: "UTC"
`;

/** Wrap multiple widgets in a root container so they move together. Children get parent_id and relative positions. */
function wrapInGroup(originX: number, originY: number, widgets: any[]): any[] {
  if (widgets.length === 0) return [];
  if (widgets.length === 1) {
    widgets[0].x = originX;
    widgets[0].y = originY;
    return widgets;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of widgets) {
    const x = Number(w.x ?? 0), y = Number(w.y ?? 0), ww = Number(w.w ?? 0), hh = Number(w.h ?? 0);
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + ww); maxY = Math.max(maxY, y + hh);
  }
  const gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
  const rootId = uid("prebuilt_group");
  const root: any = { id: rootId, type: "container", x: originX, y: originY, w: gw, h: gh, props: {}, style: { bg_color: 0x1e1e1e, radius: 8 } };
  const result: any[] = [root];
  for (const w of widgets) {
    result.push({
      ...w,
      parent_id: rootId,
      x: Number(w.x ?? 0) - minX,
      y: Number(w.y ?? 0) - minY,
    });
  }
  return result;
}

export type PrebuiltWidget = {
  id: string;
  title: string;
  description?: string;
  build: (args: { x: number; y: number }) => {
    widgets: any[];
    scripts?: any[];
    action_bindings?: any[];
    esphome_components?: string[];  // Raw YAML snippets to merge
    intervals?: any[];  // Interval definitions for updating widgets
  };
};

const pad = 8;
const bgDark = 0x1e1e1e;
const bgTrack = 0x333333;
const textMuted = 0x888888;
const textNormal = 0xaaaaaa;

export const PREBUILT_WIDGETS: PrebuiltWidget[] = [
  {
    id: "prebuilt_battery",
    title: "Battery",
    description: "Battery indicator (0–100%). Bind to a battery sensor via Links.",
    build: ({ x, y }) => {
      const rootId = uid("battery");
      const bodyId = uid("battery_body");
      const tipId = uid("battery_tip");
      const fillId = uid("battery_fill");
      const lblId = uid("battery_lbl");
      const bodyW = 44;
      const bodyH = 20;
      const tipW = 6;
      const tipH = 8;
      const fillPad = 4;
      const raw = [
        { id: bodyId, type: "container", x: 0, y: 4, w: bodyW, h: bodyH, props: {}, style: { bg_color: bgTrack, radius: 4 } },
        { id: tipId, type: "container", x: bodyW, y: 8, w: tipW, h: tipH, props: {}, style: { bg_color: bgTrack, radius: 2 } },
        { id: fillId, type: "bar", x: fillPad, y: 8, w: bodyW - fillPad * 2, h: bodyH - 8, props: { min_value: 0, max_value: 100, value: 75 }, style: { bg_color: bgDark, radius: 3 } },
        { id: lblId, type: "label", x: bodyW + tipW + 6, y: 2, w: 28, h: 24, props: { text: "75%" }, style: { text_color: textMuted } },
      ];
      const out = wrapInGroup(x, y, raw);
      if (out[0]?.style) out[0].style.bg_opa = 0;
      return { widgets: out };
    },
  },
  {
    id: "prebuilt_wifi",
    title: "WiFi strength",
    description: "Classic fan-style WiFi bars. Auto-updates from ESPHome wifi_signal sensor.",
    build: ({ x, y }) => {
      const barH = [8, 14, 20, 26];
      const barW = 6;
      const gap = 6;
      const barIds: string[] = [];
      const raw: any[] = [];
      for (let i = 0; i < 4; i++) {
        const bid = uid("wifi_bar");
        barIds.push(bid);
        raw.push({
          id: bid,
          type: "bar",
          x: i * (barW + gap),
          y: 26 - barH[i],
          w: barW,
          h: barH[i],
          props: { min_value: 0, max_value: 100, value: 100 },
          style: { bg_color: bgDark, radius: 2 },
        });
      }
      // Thresholds for bars: -80dBm=1bar, -70dBm=2bars, -60dBm=3bars, -50dBm=4bars
      // WiFi signal ranges from ~-30dBm (excellent) to ~-90dBm (poor)
      const intervalYaml = `
interval:
  - interval: 5s
    then:
      - lvgl.bar.update:
          id: ${barIds[0]}
          value: !lambda 'return id(etd_wifi_signal).state > -90 ? 100 : 0;'
      - lvgl.bar.update:
          id: ${barIds[1]}
          value: !lambda 'return id(etd_wifi_signal).state > -75 ? 100 : 0;'
      - lvgl.bar.update:
          id: ${barIds[2]}
          value: !lambda 'return id(etd_wifi_signal).state > -65 ? 100 : 0;'
      - lvgl.bar.update:
          id: ${barIds[3]}
          value: !lambda 'return id(etd_wifi_signal).state > -55 ? 100 : 0;'
`;
      return {
        widgets: wrapInGroup(x, y, raw),
        esphome_components: [ESPHOME_WIFI_SIGNAL, intervalYaml],
      };
    },
  },
  {
    id: "prebuilt_ip",
    title: "IP address",
    description: "Displays device IP address. Auto-updates from ESPHome wifi_info.",
    build: ({ x, y }) => {
      const lblId = uid("ip");
      const intervalYaml = `
interval:
  - interval: 30s
    then:
      - lvgl.label.update:
          id: ${lblId}
          text: !lambda 'return id(etd_wifi_ip).state;'
`;
      return {
        widgets: [
          { id: lblId, type: "label", x, y, w: 160, h: 24, props: { text: "..." }, style: { text_color: textMuted } },
        ],
        esphome_components: [ESPHOME_WIFI_IP, intervalYaml],
      };
    },
  },
  {
    id: "prebuilt_ha_connection",
    title: "HA connection",
    description: "Shows API/HA connection status. Auto-updates from ESPHome status sensor.",
    build: ({ x, y }) => {
      const ledId = uid("ha_conn_led");
      const lblId = uid("ha_conn_lbl");
      const raw = [
        { id: uid("ha_conn"), type: "container", x: 0, y: 0, w: 140, h: 32, props: {}, style: { bg_color: bgDark, radius: 6 } },
        { id: ledId, type: "led", x: pad, y: 8, w: 16, h: 16, props: { color: 0x888888 } },
        { id: lblId, type: "label", x: 28, y: 6, w: 104, h: 20, props: { text: "..." }, style: { text_color: textMuted } },
      ];
      const intervalYaml = `
interval:
  - interval: 5s
    then:
      - if:
          condition:
            binary_sensor.is_on: etd_api_connected
          then:
            - lvgl.led.update:
                id: ${ledId}
                color: 0x22c55e
            - lvgl.label.update:
                id: ${lblId}
                text: "Connected"
          else:
            - lvgl.led.update:
                id: ${ledId}
                color: 0xef4444
            - lvgl.label.update:
                id: ${lblId}
                text: "Disconnected"
`;
      return {
        widgets: wrapInGroup(x, y, raw),
        esphome_components: [ESPHOME_API_STATUS, intervalYaml],
      };
    },
  },
  {
    id: "prebuilt_clock",
    title: "Clock",
    description: "Displays current time (HH:MM). Auto-updates from SNTP.",
    build: ({ x, y }) => {
      const lblId = uid("clock");
      const intervalYaml = `
interval:
  - interval: 1s
    then:
      - lvgl.label.update:
          id: ${lblId}
          text: !lambda |-
            auto t = id(etd_time).now();
            if (!t.is_valid()) return std::string("--:--");
            char buf[6];
            snprintf(buf, sizeof(buf), "%02d:%02d", t.hour, t.minute);
            return std::string(buf);
`;
      return {
        widgets: [
          { id: lblId, type: "label", x, y, w: 100, h: 28, props: { text: "--:--" }, style: { text_color: textNormal } },
        ],
        esphome_components: [ESPHOME_TIME_SNTP, intervalYaml],
      };
    },
  },
  {
    id: "prebuilt_date_time",
    title: "Date + time",
    description: "Displays date and time. Auto-updates from SNTP.",
    build: ({ x, y }) => {
      const dateId = uid("date");
      const timeId = uid("time");
      const raw = [
        { id: dateId, type: "label", x: 0, y: 0, w: 140, h: 22, props: { text: "..." }, style: { text_color: textMuted } },
        { id: timeId, type: "label", x: 0, y: 24, w: 140, h: 24, props: { text: "--:--" }, style: { text_color: textNormal } },
      ];
      const intervalYaml = `
interval:
  - interval: 1s
    then:
      - lvgl.label.update:
          id: ${dateId}
          text: !lambda |-
            auto t = id(etd_time).now();
            if (!t.is_valid()) return std::string("---");
            char buf[16];
            snprintf(buf, sizeof(buf), "%04d-%02d-%02d", t.year, t.month, t.day_of_month);
            return std::string(buf);
      - lvgl.label.update:
          id: ${timeId}
          text: !lambda |-
            auto t = id(etd_time).now();
            if (!t.is_valid()) return std::string("--:--");
            char buf[6];
            snprintf(buf, sizeof(buf), "%02d:%02d", t.hour, t.minute);
            return std::string(buf);
`;
      return {
        widgets: wrapInGroup(x, y, raw),
        esphome_components: [ESPHOME_TIME_SNTP, intervalYaml],
      };
    },
  },
  {
    id: "prebuilt_color_temp",
    title: "White to warm",
    description: "Color temperature slider. Bind to a light via Links.",
    build: ({ x, y }) => {
      const raw = [
        { id: uid("ct_label"), type: "label", x: 0, y: 0, w: 180, h: 18, props: { text: "Cool ←  —  → Warm" }, style: { text_color: textMuted } },
        { id: uid("ct_slider"), type: "slider", x: 0, y: 20, w: 180, h: 24, props: { min_value: 153, max_value: 500, value: 250 }, style: { bg_color: bgTrack, radius: 4 } },
      ];
      return { widgets: wrapInGroup(x, y, raw) };
    },
  },
  {
    id: "prebuilt_section_title",
    title: "Section title",
    description: "Styled label for section headers.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("section"), type: "label", x, y, w: 200, h: 26, props: { text: "Section" }, style: { text_color: textNormal } },
        ],
      };
    },
  },
  {
    id: "prebuilt_divider",
    title: "Divider",
    description: "Horizontal line.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("divider"), type: "container", x, y, w: 200, h: 2, props: {}, style: { bg_color: bgTrack, radius: 0 } },
        ],
      };
    },
  },
  {
    id: "prebuilt_progress_bar",
    title: "Progress bar",
    description: "Generic 0–100% bar. Bind value via link.",
    build: ({ x, y }) => {
      const raw = [
        { id: uid("progress_bar"), type: "bar", x: 0, y: 0, w: 160, h: 24, props: { min_value: 0, max_value: 100, value: 50 }, style: { bg_color: bgTrack, radius: 4 } },
        { id: uid("progress_lbl"), type: "label", x: 164, y: 0, w: 40, h: 24, props: { text: "50%" }, style: { text_color: textMuted } },
      ];
      return { widgets: wrapInGroup(x, y, raw) };
    },
  },
  {
    id: "prebuilt_led_dot",
    title: "LED indicator",
    description: "On/off or status dot.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("led"), type: "led", x, y, w: 24, h: 24, props: {} },
        ],
      };
    },
  },
  {
    id: "prebuilt_back_button",
    title: "Back button",
    description: "Navigates to previous page. Uses native LVGL page navigation.",
    build: ({ x, y }) => {
      const btnId = uid("back_btn");
      return {
        widgets: [
          { id: btnId, type: "button", x, y, w: 80, h: 36, props: { text: "◀ Back" }, style: { bg_color: bgTrack, radius: 6 } },
        ],
        action_bindings: [
          { widget_id: btnId, event: "on_click", yaml_override: "then:\n  - lvgl.page.previous:" },
        ],
      };
    },
  },
  {
    id: "prebuilt_page_indicator",
    title: "Page indicator",
    description: "Shows current page (e.g. 1/3). Bind text or use in multi-page layout.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("page_ind"), type: "label", x, y, w: 48, h: 24, props: { text: "1/3" }, style: { text_color: textMuted } },
        ],
      };
    },
  },
  {
    id: "prebuilt_nav_bar",
    title: "Navigation bar",
    description: "Previous / Home / Next page buttons. Uses native LVGL page navigation.",
    build: ({ x, y }) => {
      const w = 200;
      const h = 44;
      const btnW = 56;
      const gap = (w - 3 * btnW) / 4;
      const prevId = uid("nav_prev");
      const homeId = uid("nav_home");
      const nextId = uid("nav_next");
      const raw = [
        { id: uid("nav_bg"), type: "container", x: 0, y: 0, w, h, props: {}, style: { bg_color: bgDark, radius: 8 } },
        { id: prevId, type: "button", x: gap, y: 6, w: btnW, h: 32, props: { text: "◀" }, style: { bg_color: bgTrack, radius: 6 } },
        { id: homeId, type: "button", x: gap * 2 + btnW, y: 6, w: btnW, h: 32, props: { text: "⌂" }, style: { bg_color: bgTrack, radius: 6 } },
        { id: nextId, type: "button", x: gap * 3 + btnW * 2, y: 6, w: btnW, h: 32, props: { text: "▶" }, style: { bg_color: bgTrack, radius: 6 } },
      ];
      const widgets = wrapInGroup(x, y, raw);
      // Native LVGL page navigation using yaml_override
      return {
        widgets,
        action_bindings: [
          { widget_id: prevId, event: "on_click", yaml_override: "then:\n  - lvgl.page.previous:" },
          { widget_id: homeId, event: "on_click", yaml_override: "then:\n  - lvgl.page.show: main_page" },
          { widget_id: nextId, event: "on_click", yaml_override: "then:\n  - lvgl.page.next:" },
        ],
      };
    },
  },
  {
    id: "prebuilt_countdown",
    title: "Countdown / timer",
    description: "Label for countdown (e.g. 5:00). Bind or set via script.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("countdown"), type: "label", x, y, w: 80, h: 28, props: { text: "5:00" }, style: { text_color: textNormal } },
        ],
      };
    },
  },
  {
    id: "prebuilt_status_badge",
    title: "Status badge",
    description: "Badge with text (OK / Warning / Error). Customize color in style.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("badge"), type: "label", x, y, w: 60, h: 28, props: { text: "OK" }, style: { bg_color: 0x22c55e, radius: 6, text_color: 0xffffff } },
        ],
      };
    },
  },
  {
    id: "prebuilt_spacer",
    title: "Spacer",
    description: "Invisible spacer for layout.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("spacer"), type: "container", x, y, w: 24, h: 24, props: {}, style: { bg_opa: 0 } },
        ],
      };
    },
  },
  {
    id: "prebuilt_icon",
    title: "Icon",
    description: "Single icon/symbol label. Change text to pick icon.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("icon"), type: "label", x, y, w: 40, h: 40, props: { text: "☀" }, style: { text_color: textNormal } },
        ],
      };
    },
  },
  {
    id: "prebuilt_scrolling_text",
    title: "Scrolling text",
    description: "Label for long/scrolling text (e.g. now playing).",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("scroll_txt"), type: "label", x, y, w: 200, h: 24, props: { text: "Scrolling text…" }, style: { text_color: textMuted } },
        ],
      };
    },
  },
  {
    id: "prebuilt_numeric_keypad",
    title: "Numeric keypad",
    description: "0–9 + C grid for numeric input.",
    build: ({ x, y }) => {
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
      const cellW = 44;
      const cellH = 40;
      const gap = 6;
      const raw: any[] = [
        { id: uid("keypad"), type: "container", x: 0, y: 0, w: 3 * cellW + 2 * gap, h: 4 * cellH + 3 * gap, props: {}, style: { bg_color: bgDark, radius: 8 } },
      ];
      keys.forEach((k, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        raw.push({
          id: uid("kp_" + i),
          type: "button",
          x: gap + col * (cellW + gap),
          y: gap + row * (cellH + gap),
          w: cellW,
          h: cellH,
          props: { text: k },
          style: { bg_color: bgTrack, radius: 6 },
        });
      });
      return { widgets: wrapInGroup(x, y, raw) };
    },
  },
  {
    id: "prebuilt_list_menu",
    title: "List / menu",
    description: "Dropdown for single selection (e.g. source, scene).",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("list_menu"), type: "dropdown", x, y, w: 180, h: 40, props: { options: ["Option A", "Option B", "Option C"] }, style: { bg_color: bgTrack, radius: 6 } },
        ],
      };
    },
  },
];
