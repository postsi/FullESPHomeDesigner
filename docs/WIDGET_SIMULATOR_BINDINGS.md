# Widget Simulator & HA Binding Matrix

This document describes how each LVGL widget type behaves on the **canvas**, in the **simulator**, and with **Home Assistant bindings** (display and action). Use it to verify behaviour and when adding new widgets or bindings.

---

## 1. Capability categories

- **Fully bidirectional (simulator)**  
  Canvas shows HA state (via Links), and simulator interaction (click/drag) triggers action bindings and updates HA.

- **Display-only**  
  Bound HA state is shown on the canvas/simulator, but the widget has no user interaction in simulator (e.g. label, LED, image).

- **Action-only**  
  Simulator can trigger actions (e.g. button click), but there is no display binding that updates the widget from HA.

- **Device-only**  
  Canvas shows a placeholder; real interaction happens on device only (e.g. keyboard key entry, textarea text input).

---

## 2. Verification matrix (by widget type)

| Widget type     | Canvas render | Simulator interaction        | HA display bindings                    | HA action bindings        | Category            |
|-----------------|---------------|-----------------------------|----------------------------------------|---------------------------|---------------------|
| label           | Yes           | None                         | label_text                              | —                         | Display-only        |
| button          | Yes           | Click → on_click             | label_text, widget_checked              | on_click                  | Fully bidirectional |
| container       | Yes           | Click → on_click             | label_text, widget_checked              | on_click                  | Fully bidirectional |
| bar             | Yes           | Drag → value, on_release      | bar_value, label_text                   | on_release, on_value      | Fully bidirectional |
| slider          | Yes           | Drag → value, on_release      | slider_value, label_text                | on_release, on_value      | Fully bidirectional |
| arc             | Yes           | Drag → value, on_release      | arc_value, label_text                   | on_release, on_value      | Fully bidirectional |
| meter           | Yes (as arc)  | Same as arc                  | (as arc)                                | (as arc)                  | Fully bidirectional |
| switch          | Yes           | Click → toggle, on_change     | widget_checked, label_text              | on_change                 | Fully bidirectional |
| checkbox        | Yes           | Click → toggle, on_change     | widget_checked, label_text              | on_change                 | Fully bidirectional |
| dropdown        | Yes           | Click → cycle option, on_change | label_text                           | on_value, on_change        | Fully bidirectional |
| roller          | Yes           | Click → cycle, on_change      | label_text                              | on_change                 | Fully bidirectional |
| spinbox          | Yes           | +/- zones → value, on_change  | label_text                              | on_change                 | Fully bidirectional |
| color_picker    | Yes           | Click → modal; Done → on_apply | button_bg_color, label_text           | on_click, on_apply        | Fully bidirectional |
| white_picker    | Yes           | Click → modal; Apply → on_apply | button_white_temp, label_text        | on_click, on_apply        | Fully bidirectional |
| buttonmatrix    | Yes           | Cell click → on_value (selected_index) | —                               | on_value                  | Action-only          |
| led             | Yes           | None                         | —                                      | —                         | Display-only        |
| image           | Yes (placeholder) | None                     | —                                      | —                         | Display-only        |
| animimg         | Yes (placeholder) | None                     | —                                      | —                         | Display-only        |
| qrcode          | Yes           | None                         | label_text                              | —                         | Display-only        |
| textarea        | Yes           | None (no text input in sim)  | label_text                              | on_value, on_ready, etc.  | Device-only (input) |
| spinner         | Yes           | None                         | —                                      | —                         | Display-only        |
| obj             | Yes           | Click → on_click              | —                                      | on_click                  | Action-only         |
| line            | Yes           | None                         | —                                      | —                         | Display-only        |
| tabview         | Yes           | None (no tab switch in sim)  | —                                      | —                         | Device-only (tabs)  |
| tileview        | Yes           | None                         | —                                      | —                         | Device-only          |
| keyboard        | Yes           | None (no key events in sim)  | —                                      | —                         | Device-only          |
| canvas          | Yes (placeholder) | None                     | —                                      | —                         | Display-only         |
| msgboxes        | Yes (placeholder) | None                     | —                                      | —                         | Display-only         |

---

## 3. Implementation notes

- **liveOverrides** (App.tsx): Drives canvas/simulator display from Links. Supports: `label_text`, `label_number`, `arc_value`, `slider_value`, `bar_value`, `widget_checked`, `button_bg_color` (rgb_color → color_picker), `button_white_temp` (color_temp → white_picker).
- **Simulator actions**: Handled in Canvas (click/drag) and in modals (color picker Done, white picker Apply). Action bindings are resolved in App and call HA services via `callService`.
- **buttonmatrix**: Simulator sends `on_value` with `{ selected_index: number }` (cell index). Add action bindings in the Binding Builder (Action tab) for `on_value` if you use buttonmatrix with HA.

---

## 4. Manual test checklist (high level)

1. **Display binding**  
   Add a Link from an HA entity to a widget with the right action (e.g. light rgb_color → color_picker with button_bg_color). Confirm canvas and simulator show the current HA value; change HA and confirm it updates.

2. **Action binding**  
   Add an action binding for the widget event (e.g. slider on_release → number.set_value). Open Simulator, move the slider, release; confirm the service is called and HA state updates.

3. **Color/white pickers**  
   Bind a light to color_picker (display) and add on_apply action. In Simulator: confirm swatch shows light colour; open picker, change, Done → confirm service call. Same for white_picker with mireds and Apply.

4. **Buttonmatrix**  
   Add buttonmatrix, add action binding for on_value (e.g. script or service). In Simulator, click a cell; confirm action runs with selected_index.

---

## 5. When adding a new widget or binding

1. **Canvas**: Add a branch in `Canvas.tsx` `renderWidget` for the widget type so it renders correctly.
2. **Display binding**: If the widget can show HA state, add the display action in `bindingConfig.ts` (`DISPLAY_ACTIONS_BY_WIDGET_TYPE`) and handle it in `liveOverrides` in `App.tsx`.
3. **Action binding**: Add events in `bindingConfig.ts` (`EVENTS_BY_WIDGET_TYPE`). If the widget is interactive in simulator, in Canvas call `onSimulateAction(w.id, event, payload)` with the correct payload.
4. **Docs**: Update this matrix and the checklist above.
