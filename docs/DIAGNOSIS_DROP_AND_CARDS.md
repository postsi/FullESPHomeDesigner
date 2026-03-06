# Diagnosis: Palette drop and Card Library

## What works vs what doesn’t

- **Standard widgets (LVGL)**: User reports they are dropping.
- **Card Library**: Not dropping; user sees a “supported features 401” error.
- **Prebuilt widgets**: Still not dropping (same as before recent changes).

All three use the **same drop path** in code:

1. Palette item `onDragStart` calls `dataTransfer.setData(...)` with one of:
   - `application/x-esphome-widget-type` (standard)
   - `application/x-esphome-control-template` (cards)
   - `application/x-esphome-prebuilt-widget` (prebuilts)
2. Canvas wrapper div has `onDragOver` (preventDefault) and `onDrop` → `handleDrop`.
3. `handleDrop` reads those MIME types, builds `payload` (`prebuilt:…`, `tmpl:…`, or raw type), then `onDropCreate(payload, x, y)`.

So the only difference is the MIME type and how the app responds (single widget vs template wizard vs prebuilt insert).

## Why drops might not fire when releasing over the canvas

- The **drop target** is the element that last received `dragover` and accepted it (preventDefault).
- DOM order: our **wrapper div** → Konva **Stage** (a div) → Konva **content div** → **canvas**.
- When the pointer is over the drawn canvas, the **deepest** element under the cursor is Konva’s content/canvas, not our wrapper.
- So when you release over the canvas, the browser typically fires `drop` on that **child** (Konva), not on our wrapper div.
- Our `onDrop` is on the **wrapper** (bubble phase). If the drop target is a child, the event never reaches the wrapper’s listener, so **nothing is dropped** even though the drag started correctly.

So:

- If “standard widgets are dropping”, either:
  - The drop is happening on a part of the wrapper that is **not** covered by the Stage (e.g. padding/border), or
  - There is a browser/version difference in how the drop target is chosen.
- For **cards** and **prebuilts**, if the user consistently releases over the canvas, the drop will often land on Konva’s element and our handler never runs → “cards/prebuilts don’t drop”.

Conclusion: we need to handle drop when it is **delivered to a child** of the wrapper (e.g. Konva). The way to do that without changing behavior for drops that already land on the wrapper is to add a **capture-phase** listener that only runs when the event target is **inside** our wrapper (e.g. `containerRef.current.contains(event.target)`), then run the same drop logic once and stop propagation so we don’t double-handle when the target is the wrapper.

## “Supported features 401” (cards)

- Dropping a card opens the **template wizard** and triggers a request to  
  `GET /api/esphome_touch_designer/ha/entities/{entity_id}/capabilities`.
- That endpoint returns `supported_features` and other entity attributes for the wizard.
- Backend for this route has `requires_auth = False`.
- If the request returns **401**, the frontend currently does `if (!r.ok) return setTmplCaps(null)`, so capabilities are not shown. The wizard can still be used (entity id, label, “Insert card”), but:
  - In some setups, 401 might be due to the request not sending cookies (e.g. `fetch` without `credentials: 'include'`).
  - Or the user might see a “supported features 401” message (e.g. from the browser, a proxy, or an error UI that shows status 401 next to “supported features”).

Planned fixes:

- Use `credentials: 'include'` for the capabilities fetch so auth works when the panel is in an iframe.
- On 401 (or any `!r.ok`), keep setting `tmplCaps(null)` but optionally show a short, muted message so the user knows capabilities couldn’t be loaded and can still complete the card (entity + Insert card).

## Prebuilt widgets

- Same drop-target issue as cards when releasing over the canvas.
- Additionally, prebuilt rows have a **YAML** button. If the drag starts on that button, the button can become the drag source and the parent’s `setData` might not run, so `getData('application/x-esphome-prebuilt-widget')` can be empty. We already set `draggable={false}` on that button so the row div is always the drag source.

## Summary

| Issue | Cause | Fix |
|-------|--------|-----|
| Cards “don’t drop” | Drop often lands on Konva (child), so wrapper `onDrop` never runs | Handle drop in capture when target is inside wrapper; same logic as current `handleDrop`. |
| “Supported features 401” | Capabilities fetch returns 401 (auth/cookies or proxy) | Use `credentials: 'include'`; on 401 keep wizard usable and optionally show muted message. |
| Prebuilts “don’t drop” | Same as cards (drop on Konva) + possible drag from YAML button | Same capture-phase drop handling; YAML button already `draggable={false}`. |
