# Arc widget – test examples

The arc is drawn **from start_angle to end_angle in the clockwise direction** (LVGL convention). Convention: **0° = right**, **90° = bottom**, **180° = left**, **270° = top**; angles increase **clockwise**. Use these in the designer to check behaviour and the simulator.

## Quarter circle (top → right)

- **start_angle**: `270`, **end_angle**: `0`, **rotation**: `0`, **min_value**: `0`, **max_value**: `100`

Expected: 90° arc from top (270°) to right (0°) clockwise. Grey track, green fill and knob on that quarter.

## Three-quarter circle (6 o'clock → 3 o'clock, clockwise)

- **start_angle**: `90`, **end_angle**: `0`, **rotation**: `0`, **min_value**: `0`, **max_value**: `100`

Expected: 270° arc from 6 o'clock (90°) to 3 o'clock (0°) going clockwise (6→9→12→3). Grey track on that three-quarter arc; green fill and knob follow the same arc.

---

## 1. NORMAL (start = min, end = max)

- **mode**: `NORMAL`
- **value**: `50`

**Expected**

- Track: quarter circle from 270° to 0° (short arc).
- At value 50: green fill and knob at 50% along that arc (e.g. knob near 315°).
- **Simulator**: Dragging from 270° toward 0° increases value; knob follows the quarter circle.

---

## 2. REVERSE (end = min, start = max)

- **mode**: `REVERSE`
- **value**: `50`

**Expected**

- Same quarter-circle track (270° → 0°).
- At value 0: knob at **end** (0°). At value 100: knob at **start** (270°). At 50: knob about halfway along the arc (e.g. near 315°).
- **Simulator**: Dragging toward 0° decreases value; dragging toward 270° increases value.

---

## 3. SYMMETRICAL (center = min, end = max)

- **mode**: `SYMMETRICAL`
- **value**: `50`

**Expected**

- Same quarter-circle track. Midpoint of the short arc ≈ 315°.
- At value 0: knob at **mid** (~315°). At value 100: knob at **end** (0°). At 50: knob between mid and end.
- **Simulator**: Dragging from mid (315°) toward end (0°) increases value.

---

## Quick checklist

1. Add an **Arc** widget; set **start_angle** 270, **end_angle** 0, **min** 0, **max** 100.
2. Try **NORMAL** with value 50 → track, fill, and knob on the same quarter circle; drag in simulator and confirm value/knob follow the arc.
3. Switch to **REVERSE** → knob at 0° when value 0, at 270° when value 100; drag and confirm direction.
4. Switch to **SYMMETRICAL** → knob at mid when value 0, at 0° when value 100; drag from mid to end and confirm value increases.
