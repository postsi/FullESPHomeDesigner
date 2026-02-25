/**
 * Prebuilt widgets: reusable building blocks for the canvas and for cards.
 * Dropped directly onto the canvas (no wizard). Each build() returns { widgets }.
 */

function uid(prefix: string) {
  return prefix + "_" + Math.random().toString(16).slice(2, 8);
}

export type PrebuiltWidget = {
  id: string;
  title: string;
  description?: string;
  build: (args: { x: number; y: number }) => { widgets: any[] };
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
    description: "Battery level bar (0–100%) with optional label. Bind value via link.",
    build: ({ x, y }) => {
      const rootId = uid("battery");
      const barId = uid("battery_bar");
      const lblId = uid("battery_lbl");
      return {
        widgets: [
          { id: rootId, type: "container", x, y, w: 120, h: 44, props: {}, style: { bg_color: bgDark, radius: 6 } },
          { id: barId, type: "bar", x: x + pad, y: y + pad, w: 80, h: 28, props: { min: 0, max: 100, value: 75 }, style: { bg_color: bgTrack, radius: 4 } },
          { id: lblId, type: "label", x: x + 92, y: y + 10, w: 24, h: 24, props: { text: "75%" }, style: { text_color: textMuted } },
        ],
      };
    },
  },
  {
    id: "prebuilt_wifi",
    title: "WiFi strength",
    description: "WiFi signal indicator (bar 0–100%). Bind via link.",
    build: ({ x, y }) => {
      const rootId = uid("wifi");
      const barId = uid("wifi_bar");
      const lblId = uid("wifi_lbl");
      return {
        widgets: [
          { id: rootId, type: "container", x, y, w: 100, h: 40, props: {}, style: { bg_color: bgDark, radius: 6 } },
          { id: uid("wifi_icon"), type: "label", x: x + pad, y: y + 8, w: 24, h: 24, props: { text: "📶" } },
          { id: barId, type: "bar", x: x + 36, y: y + 10, w: 56, h: 20, props: { min: 0, max: 100, value: 80 }, style: { bg_color: bgTrack, radius: 4 } },
        ],
      };
    },
  },
  {
    id: "prebuilt_ip",
    title: "IP address",
    description: "Label for device IP. Bind text via link or set in properties.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("ip"), type: "label", x, y, w: 160, h: 24, props: { text: "192.168.1.x" }, style: { text_color: textMuted } },
        ],
      };
    },
  },
  {
    id: "prebuilt_ha_connection",
    title: "HA connection",
    description: "Connection status (Connected/Disconnected). Bind state via link.",
    build: ({ x, y }) => {
      const rootId = uid("ha_conn");
      const ledId = uid("ha_conn_led");
      const lblId = uid("ha_conn_lbl");
      return {
        widgets: [
          { id: rootId, type: "container", x, y, w: 140, h: 32, props: {}, style: { bg_color: bgDark, radius: 6 } },
          { id: ledId, type: "led", x: x + pad, y: y + 8, w: 16, h: 16, props: {} },
          { id: lblId, type: "label", x: x + 28, y: y + 6, w: 104, h: 20, props: { text: "—" }, style: { text_color: textMuted } },
        ],
      };
    },
  },
  {
    id: "prebuilt_clock",
    title: "Clock",
    description: "Time label (e.g. 12:00). Set from RTC/NTP or bind.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("clock"), type: "label", x, y, w: 100, h: 28, props: { text: "12:00" }, style: { text_color: textNormal } },
        ],
      };
    },
  },
  {
    id: "prebuilt_date_time",
    title: "Date + time",
    description: "Date and time labels.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("date"), type: "label", x, y, w: 140, h: 22, props: { text: "—" }, style: { text_color: textMuted } },
          { id: uid("time"), type: "label", x, y: y + 24, w: 140, h: 24, props: { text: "12:00" }, style: { text_color: textNormal } },
        ],
      };
    },
  },
  {
    id: "prebuilt_color_picker",
    title: "Colour picker",
    description: "2D hue/saturation picker for lights with HS support.",
    build: ({ x, y }) => {
      const cwId = uid("colorwheel");
      const lblId = uid("color_preview");
      return {
        widgets: [
          { id: cwId, type: "colorwheel", x, y, w: 120, h: 120, props: { mode: "hsv" }, style: { bg_color: bgDark, radius: 8 } },
          { id: lblId, type: "label", x, y: y + 124, w: 120, h: 20, props: { text: "HS" }, style: { text_color: textMuted } },
        ],
      };
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
      const barId = uid("progress_bar");
      const lblId = uid("progress_lbl");
      return {
        widgets: [
          { id: barId, type: "bar", x, y, w: 160, h: 24, props: { min: 0, max: 100, value: 50 }, style: { bg_color: bgTrack, radius: 4 } },
          { id: lblId, type: "label", x: x + 164, y: y, w: 40, h: 24, props: { text: "50%" }, style: { text_color: textMuted } },
        ],
      };
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
    description: "Back button for navigation.",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("back_btn"), type: "button", x, y, w: 80, h: 36, props: { text: "← Back" }, style: { bg_color: bgTrack, radius: 6 } },
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
    description: "Page −, Home, Page +. Bind on_click to page change or actions.",
    build: ({ x, y }) => {
      const w = 200;
      const h = 44;
      const btnW = 56;
      const gap = (w - 3 * btnW) / 4;
      const prevId = uid("nav_prev");
      const homeId = uid("nav_home");
      const nextId = uid("nav_next");
      return {
        widgets: [
          { id: uid("nav_root"), type: "container", x, y, w, h, props: {}, style: { bg_color: bgDark, radius: 8 } },
          { id: prevId, type: "button", x: x + gap, y: y + 6, w: btnW, h: 32, props: { text: "−" }, style: { bg_color: bgTrack, radius: 6 } },
          { id: homeId, type: "button", x: x + gap * 2 + btnW, y: y + 6, w: btnW, h: 32, props: { text: "⌂" }, style: { bg_color: bgTrack, radius: 6 } },
          { id: nextId, type: "button", x: x + gap * 3 + btnW * 2, y: y + 6, w: btnW, h: 32, props: { text: "+" }, style: { bg_color: bgTrack, radius: 6 } },
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
      const rootId = uid("keypad");
      const widgets: any[] = [
        { id: rootId, type: "container", x, y, w: 3 * cellW + 2 * gap, h: 4 * cellH + 3 * gap, props: {}, style: { bg_color: bgDark, radius: 8 } },
      ];
      keys.forEach((k, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        widgets.push({
          id: uid("kp_" + i),
          type: "button",
          x: x + gap + col * (cellW + gap),
          y: y + gap + row * (cellH + gap),
          w: cellW,
          h: cellH,
          props: { text: k },
          style: { bg_color: bgTrack, radius: 6 },
        });
      });
      return { widgets };
    },
  },
  {
    id: "prebuilt_list_menu",
    title: "List / menu",
    description: "Dropdown for single selection (e.g. source, scene).",
    build: ({ x, y }) => {
      return {
        widgets: [
          { id: uid("list_menu"), type: "dropdown", x, y, w: 180, h: 40, props: { options: "Option A\\nOption B\\nOption C" }, style: { bg_color: bgTrack, radius: 6 } },
        ],
      };
    },
  },
];
