import React, { useMemo, useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect, Text, Transformer, Line, Group, Circle, Arc } from "react-konva";

type Widget = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parent_id?: string;
  props?: any;
  style?: any;
  events?: any;
};

type Props = {
  widgets: Widget[];
  selectedIds: string[];
  width: number;
  height: number;
  gridSize: number;
  showGrid: boolean;
  /** LVGL disp_bg_color for preview (hex e.g. #1a1a2e). */
  dispBgColor?: string;
  liveOverrides?: Record<string, { text?: string; value?: number; checked?: boolean }>;
  onSelect: (id: string, additive: boolean) => void;
  onSelectNone: () => void;
  onDropCreate?: (type: string, x: number, y: number) => void;
  onChangeMany: (patches: { id: string; patch: Partial<Widget> }[], commit?: boolean) => void;
};

function snap(n: number, grid: number) {
  if (!grid || grid <= 1) return n;
  return Math.round(n / grid) * grid;
}

/** Normalize color to CSS fill (templates use numeric 0xrrggbb). */
function toFillColor(val: any, fallback: string): string {
  if (typeof val === "number" && val >= 0 && val <= 0xffffff) {
    return "#" + val.toString(16).padStart(6, "0");
  }
  if (typeof val === "string" && /^#?[0-9a-fA-F]{6}$/.test(val)) return val.startsWith("#") ? val : "#" + val;
  return fallback;
}

/** LVGL text_align (LEFT, CENTER, RIGHT, AUTO) + padding -> Konva Text position and align.
 * text_align controls text alignment within the widget; use it when set, else fall back to
 * align (widget position) for backward compatibility. */
function textLayoutFromWidget(
  ax: number,
  ay: number,
  width: number,
  height: number,
  props: Record<string, unknown> = {},
  style: Record<string, unknown> = {}
): { x: number; y: number; width: number; height: number; align: "left" | "center" | "right"; verticalAlign: "top" | "middle" | "bottom" } {
  const padLeft = Number(style.pad_all ?? style.pad_left ?? 0);
  const padRight = Number(style.pad_all ?? style.pad_right ?? 0);
  const padTop = Number(style.pad_all ?? style.pad_top ?? 0);
  const padBottom = Number(style.pad_all ?? style.pad_bottom ?? 0);
  const contentW = Math.max(0, width - padLeft - padRight);
  const contentH = Math.max(0, height - padTop - padBottom);
  const left = ax + padLeft;
  const top = ay + padTop;

  // text_align (style) = text alignment within widget (LEFT, CENTER, RIGHT, AUTO)
  const textAlign = String(style.text_align ?? "LEFT").toUpperCase();
  let horizontal: "left" | "center" | "right";
  if (textAlign === "LEFT" || textAlign === "AUTO") {
    horizontal = "left";
  } else if (textAlign === "RIGHT") {
    horizontal = "right";
  } else {
    horizontal = "center";
  }

  // vertical: LVGL has no vertical text align. Use widget align as hint so canvas matches device
  // (position widget with CENTER/LEFT_MID etc. for vertically centered text).
  const align = String(props.align ?? style.align ?? "TOP_LEFT").toUpperCase();
  const vertical: "top" | "middle" | "bottom" =
    align === "TOP_LEFT" || align === "TOP_MID" || align === "TOP_RIGHT"
      ? "top"
      : align === "BOTTOM_LEFT" || align === "BOTTOM_MID" || align === "BOTTOM_RIGHT"
        ? "bottom"
        : "middle";

  return {
    x: left,
    y: top,
    width: contentW,
    height: contentH,
    align: horizontal,
    verticalAlign: vertical,
  };
}

// Ensure only valid widgets (avoids "undefined is not an object (evaluating '*.id')" when array has holes)
function safeWidgets(list: Widget[]): Widget[] {
  return (list || []).filter((w): w is Widget => !!w && typeof w === "object" && w.id != null);
}

// --- v0.31: simple layout preview for container.flex_* ---
function computeLayoutPositions(widgets: Widget[]): Map<string, {x:number;y:number}> {
  const list = safeWidgets(widgets);
  const byId = new Map<string, Widget>();
  list.forEach(w => byId.set(w.id, w));
  const children = new Map<string, Widget[]>();
  list.forEach(w => {
    if (w.parent_id) {
      let arr = children.get(w.parent_id);
      if (!arr) { arr = []; children.set(w.parent_id, arr); }
      arr.push(w);
    }
  });

  const pos = new Map<string, {x:number;y:number}>();
  function walk(parentId: string) {
    const parent = byId.get(parentId);
    if (!parent) return;
    const kids = children.get(parentId) || [];
    const layout = String((parent.props || {}).layout || "");
    if (!layout.startsWith("flex_")) return;
    const gap = Number((parent.props || {}).gap || 6);
    const pad = Number((parent.style || {}).pad_left || 0);
    let cx = parent.x + pad;
    let cy = parent.y + Number((parent.style || {}).pad_top || 0);
    const isRow = layout === "flex_row";
    // stable order: y then x then id
    kids.sort((a,b) => (a.y-b.y) || (a.x-b.x) || a.id.localeCompare(b.id));
    kids.forEach(k => {
      pos.set(k.id, { x: cx, y: cy });
      if (isRow) cx += (k.w || 0) + gap;
      else cy += (k.h || 0) + gap;
    });
    kids.forEach(k => walk(k.id));
  }
  list.filter(w => !w.parent_id).forEach(w => walk(w.id));
  return pos;
}


export default function Canvas({
  widgets: rawWidgets,
  selectedIds,
  width,
  height,
  gridSize,
  showGrid,
  dispBgColor,
  liveOverrides = {},
  onSelect,
  onSelectNone,
  onDropCreate,
  onChangeMany,
}: Props) {
  const widgets = useMemo(() => safeWidgets(rawWidgets), [rawWidgets]);
    const layoutPos = useMemo(() => computeLayoutPositions(widgets), [widgets]);
const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  // Remember positions at drag start for multi-drag delta application
  const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});
  // Box selection: drag on empty space to select multiple widgets
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const boxSelectStartRef = useRef<{ x: number; y: number } | null>(null);
  const BOX_SELECT_THRESHOLD = 5;

  React.useEffect(() => {
    if (!trRef.current) return;
    const nodes = selectedIds
      .map((id) => stageRef.current?.findOne(`#${id}`))
      .filter(Boolean);
    trRef.current.nodes(nodes);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedIds]);

  // When box-selecting, listen for mouseup globally so we catch release outside the stage
  const finishSelectionBox = useCallback(() => {
    if (!selectionBox) return;
    const { startX, startY, endX, endY } = selectionBox;
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const topLevel = widgets.filter((w) => !w.parent_id);
    const idsInBox: string[] = [];
    for (const w of topLevel) {
      const { ax, ay } = absPos(w);
      const ww = w.w || 100;
      const hh = w.h || 50;
      if (!(ax + ww < minX || ax > maxX || ay + hh < minY || ay > maxY)) {
        idsInBox.push(w.id);
      }
    }
    setSelectionBox(null);
    if (idsInBox.length > 0) {
      onSelectNone();
      idsInBox.forEach((id) => onSelect(id, true));
    } else {
      onSelectNone();
    }
  }, [selectionBox, widgets, onSelect, onSelectNone]);

  React.useEffect(() => {
    if (!selectionBox) return;
    const onUp = () => {
      finishSelectionBox();
      boxSelectStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [selectionBox, finishSelectionBox]);

  const selectedSet = new Set(selectedIds);

  const widgetById = useMemo(() => {
    const m = new Map<string, Widget>();
    for (const w of widgets) m.set(w.id, w);
    return m;
  }, [widgets]);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, Widget[]>();
    for (const w of widgets) {
      if (!w.parent_id) continue;
      let arr = m.get(w.parent_id);
      if (!arr) { arr = []; m.set(w.parent_id, arr); }
      arr.push(w);
    }
    return m;
  }, [widgets]);

  // Parent position (top-left in canvas coords) and parent content size for align math.
  const parentInfo = (w: Widget): { ax: number; ay: number; pw: number; ph: number } => {
    if (!w.parent_id) {
      return { ax: 0, ay: 0, pw: width, ph: height };
    }
    const p = widgetById.get(w.parent_id);
    if (!p) return { ax: 0, ay: 0, pw: width, ph: height };
    const grand = parentInfo(p);
    const align = String((p.props || {}).align ?? "TOP_LEFT").toUpperCase();
    const px = p.x, py = p.y, pw = p.w || 100, ph = p.h || 50;
    if (align === "TOP_LEFT" || !align) {
      return { ax: grand.ax + px, ay: grand.ay + py, pw, ph };
    }
    const pw2 = grand.pw / 2, ph2 = grand.ph / 2;
    let pax = grand.ax, pay = grand.ay;
    if (align === "CENTER") { pax = grand.ax + grand.pw / 2 - pw / 2; pay = grand.ay + grand.ph / 2 - ph / 2; }
    else if (align === "TOP_MID") { pax = grand.ax + grand.pw / 2 - pw / 2; }
    else if (align === "TOP_RIGHT") { pax = grand.ax + grand.pw - pw; }
    else if (align === "LEFT_MID") { pay = grand.ay + grand.ph / 2 - ph / 2; }
    else if (align === "RIGHT_MID") { pax = grand.ax + grand.pw - pw; pay = grand.ay + grand.ph / 2 - ph / 2; }
    else if (align === "BOTTOM_LEFT") { pay = grand.ay + grand.ph - ph; }
    else if (align === "BOTTOM_MID") { pax = grand.ax + grand.pw / 2 - pw / 2; pay = grand.ay + grand.ph - ph; }
    else if (align === "BOTTOM_RIGHT") { pax = grand.ax + grand.pw - pw; pay = grand.ay + grand.ph - ph; }
    return { ax: pax, ay: pay, pw, ph };
  };

  // Visual top-left (ax, ay) so canvas matches device. We store x,y as top-left; backend converts on emit.
  const absPos = (w: Widget): { ax: number; ay: number } => {
    const { ax: pax, ay: pay, pw, ph } = parentInfo(w);
    const align = String((w.props || {}).align ?? "TOP_LEFT").toUpperCase();
    const x = w.x, y = w.y, ww = w.w || 100, hh = w.h || 50;
    if (align === "TOP_LEFT" || !align) return { ax: pax + x, ay: pay + y };
    const pw2 = pw / 2, ph2 = ph / 2;
    let ox = 0, oy = 0;
    if (align === "CENTER") { ox = x + ww / 2 - pw2; oy = y + hh / 2 - ph2; }
    else if (align === "TOP_MID") { ox = x + ww / 2 - pw2; }
    else if (align === "TOP_RIGHT") { ox = x + ww - pw; }
    else if (align === "LEFT_MID") { oy = y + hh / 2 - ph2; }
    else if (align === "RIGHT_MID") { ox = x + ww - pw; oy = y + hh / 2 - ph2; }
    else if (align === "BOTTOM_LEFT") { oy = y + hh - ph; }
    else if (align === "BOTTOM_MID") { ox = x + ww / 2 - pw2; oy = y + hh - ph; }
    else if (align === "BOTTOM_RIGHT") { ox = x + ww - pw; oy = y + hh - ph; }
    const centerX = pax + pw2 + ox, centerY = pay + ph2 + oy;
    return { ax: centerX - ww / 2, ay: centerY - hh / 2 };
  };

  const renderWidget = (w: Widget, isSel: boolean) => {
    const { ax, ay } = absPos(w);
    const override = liveOverrides[w.id];
    // Simple, intentionally lightweight previews (not pixel-perfect LVGL).
    // The goal is to make layouts usable while we keep the runtime YAML generator authoritative.
    const p = w.props || {};
    const s = w.style || {};
    const title = (override?.text !== undefined ? override.text : (p.text ?? p.label ?? p.name ?? w.type)) as string;

    // Style helpers (schema-driven properties land in `style`). Support LVGL extras:
    // opacity (opa), shadow_ofs_x/y, shadow_width/color/opa/spread, clip_corner, border_side.
    const bg = toFillColor(s.bg_color ?? s.background_color ?? p.bg_color, "#111827");
    const border = toFillColor(s.border_color ?? p.border_color, isSel ? "#10b981" : "#374151");
    const borderWidth = Number(s.border_width ?? p.border_width ?? 2);
    const opacityRaw = s.opa ?? p.opacity ?? 100;
    const opacity = typeof opacityRaw === "number" ? opacityRaw / 100 : 1;
    const radius = Math.min(12, Math.max(0, Number(s.radius ?? s.corner_radius ?? p.radius ?? p.corner_radius ?? 8)));
    const shadowW = Number(s.shadow_width ?? 0);
    const shadowOfsX = Number(s.shadow_ofs_x ?? 0);
    const shadowOfsY = Number(s.shadow_ofs_y ?? 0);
    const shadowCol = toFillColor(s.shadow_color, "#000000");
    const shadowOpa = Number(s.shadow_opa ?? 100) / 100;
    const textColor = toFillColor(s.text_color ?? p.text_color, "#e5e7eb");
    const fontSize = Math.max(10, Math.min(28, Number(s.font_size ?? p.font_size ?? 16)));

    const hasShadow = shadowW > 0 || shadowOfsX !== 0 || shadowOfsY !== 0;
    const outlineW = Math.max(0, Number(s.outline_width ?? 0));
    const outlinePad = Number(s.outline_pad ?? 0);
    const outlineColor = toFillColor(s.outline_color, "#374151");
    const outlineOpa = Number(s.outline_opa ?? 0) / 100;
    const transformAngle = Number(s.transform_angle ?? 0);
    const transformZoom = Number(s.transform_zoom ?? 100) / 100;
    // Base background (optional outline behind, then main rect)
    const base = (
      <>
        {outlineW > 0 && (
          <Rect x={ax - outlinePad - outlineW} y={ay - outlinePad - outlineW} width={w.w + 2 * (outlinePad + outlineW)} height={w.h + 2 * (outlinePad + outlineW)} stroke={outlineColor} strokeWidth={outlineW} cornerRadius={radius + outlinePad + outlineW} fillEnabled={false} opacity={outlineOpa} listening={false} />
        )}
        <Rect
          id={w.id}
          x={transformAngle !== 0 || transformZoom !== 1 ? ax + w.w / 2 : ax}
          y={transformAngle !== 0 || transformZoom !== 1 ? ay + w.h / 2 : ay}
          width={w.w}
          height={w.h}
          offsetX={transformAngle !== 0 || transformZoom !== 1 ? w.w / 2 : 0}
          offsetY={transformAngle !== 0 || transformZoom !== 1 ? w.h / 2 : 0}
          rotation={transformAngle}
          scaleX={transformZoom}
          scaleY={transformZoom}
          fill={bg}
          stroke={border}
          strokeWidth={borderWidth}
          cornerRadius={radius}
          opacity={opacity}
          {...(hasShadow && {
          shadowColor: shadowCol,
          shadowBlur: shadowW || 4,
          shadowOffset: { x: shadowOfsX, y: shadowOfsY },
          shadowOpacity: shadowOpa,
        })}
        draggable
        onClick={(e) => onSelect(w.id, !!e.evt.shiftKey)}
        onTap={(e) => onSelect(w.id, !!(e.evt as any).shiftKey)}
        onDragStart={() => {
          // snapshot selected positions
          const snap0: Record<string, { x: number; y: number }> = {};
          for (const id of selectedIds.length ? selectedIds : [w.id]) {
            const ww = widgetById.get(id);
            if (ww) snap0[id] = { x: ww.x, y: ww.y };
          }
          dragStartRef.current = snap0;
        }}
        onDragEnd={(e) => {
          const node = e.target;
          const alt = !!e.evt.altKey; // hold ALT to disable snapping
          const nx = alt ? node.x() : snap(node.x(), gridSize);
          const ny = alt ? node.y() : snap(node.y(), gridSize);

          // For parented widgets, node.x/node.y are absolute; store relative in model.
          const parent = w.parent_id ? widgetById.get(w.parent_id) : undefined;
          const parentAbs = parent ? absPos(parent) : { ax: 0, ay: 0 };
          const modelX = nx - parentAbs.ax;
          const modelY = ny - parentAbs.ay;

          const start = dragStartRef.current[w.id] || { x: w.x, y: w.y };
          const dx = modelX - start.x;
          const dy = modelY - start.y;

          const ids = selectedIds.length ? selectedIds : [w.id];
          const patches = ids
            .map((id) => {
              const s = dragStartRef.current[id] || widgetById.get(id);
              if (!s) return null;
              return { id, patch: { x: (s as any).x + dx, y: (s as any).y + dy } };
            })
            .filter(Boolean) as { id: string; patch: Partial<Widget> }[];

          onChangeMany(patches, true);
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const alt = !!(e.evt as { altKey?: boolean }).altKey; // hold ALT to disable snapping
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);

          const oldW = node.width();
          const oldH = node.height();
          let ww = Math.max(20, oldW * scaleX);
          let hh = Math.max(20, oldH * scaleY);
          let xx = node.x();
          let yy = node.y();

          if (!alt) {
            ww = snap(ww, gridSize);
            hh = snap(hh, gridSize);
            xx = snap(xx, gridSize);
            yy = snap(yy, gridSize);
          }

          const children = childrenByParent.get(w.id);
          if (children && children.length > 0) {
            const sx = oldW > 0 ? ww / oldW : 1;
            const sy = oldH > 0 ? hh / oldH : 1;
            const patches: { id: string; patch: Partial<Widget> }[] = [
              { id: w.id, patch: { w: ww, h: hh } },
              ...children.map((c) => ({
                id: c.id,
                patch: {
                  x: c.x * sx,
                  y: c.y * sy,
                  w: Math.max(4, c.w * sx),
                  h: Math.max(4, c.h * sy),
                },
              })),
            ];
            onChangeMany(patches, true);
          } else {
            const parent = w.parent_id ? widgetById.get(w.parent_id) : undefined;
            const parentAbs = parent ? absPos(parent) : { ax: 0, ay: 0 };
            const modelX = xx - parentAbs.ax;
            const modelY = yy - parentAbs.ay;
            onChangeMany([{ id: w.id, patch: { x: modelX, y: modelY, w: ww, h: hh } }], true);
          }
        }}
      />
      </>
    );

    // Type-specific adornments
    const type = w.type.toLowerCase();
    if (type === "image_button") {
      const layout = textLayoutFromWidget(ax, ay, w.w, w.h, p, s);
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={w.w - 16} height={w.h - 16} fill="#1f2937" stroke="#4b5563" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={String(p.text ?? "Img")} x={layout.x} y={layout.y} width={layout.width} height={layout.height} align={layout.align} verticalAlign={layout.verticalAlign} fontSize={12} fill={textColor} listening={false} />
        </Group>
      );
    }

    if (type.includes("label")) {
      const layout = textLayoutFromWidget(ax, ay, w.w, w.h, p, s);
      const longMode = String(p.long_mode ?? s.long_mode ?? "CLIP").toUpperCase();
      const wrap = longMode === "WRAP";
      const ellipsisLabel = longMode !== "WRAP" && longMode !== "CLIP";
      let labelText = String(title);
      if (p.recolor || s.recolor) {
        labelText = labelText.replace(/#[\dA-Fa-f]{6}\s*/g, "").trim() || labelText;
      }
      return (
        <Group key={w.id}>
          {base}
          <Text
            text={labelText}
            x={layout.x}
            y={layout.y}
            width={layout.width}
            height={layout.height}
            align={layout.align}
            verticalAlign={layout.verticalAlign}
            fontSize={Math.max(12, Math.min(22, fontSize ?? 18))}
            fill={textColor}
            wrap={wrap ? "word" : undefined}
            ellipsis={ellipsisLabel}
            listening={false}
          />
        </Group>
      );
    }

    if (type.includes("button")) {
      const checked = override?.checked ?? (p as any).checked ?? false;
      const layout = textLayoutFromWidget(ax, ay, w.w, w.h, p, s);
      return (
        <Group key={w.id}>
          {base}
          <Rect
            x={ax + 6}
            y={ay + 6}
            width={w.w - 12}
            height={w.h - 12}
            fill={String(checked ? (s.inner_bg_color ?? "#065f46") : (s.inner_bg_color ?? "#0b1220"))}
            stroke={String(s.inner_border_color ?? (isSel ? "#34d399" : "#1f2937"))}
            strokeWidth={Number(s.inner_border_width ?? 2)}
            cornerRadius={Math.min(10, Math.max(0, Number(s.radius ?? s.corner_radius ?? p.radius ?? p.corner_radius ?? 10)))}
            listening={false}
          />
          <Text
            text={String(title || "Button")}
            x={layout.x}
            y={layout.y}
            width={layout.width}
            height={layout.height}
            align={layout.align}
            verticalAlign={layout.verticalAlign}
            fontSize={Math.max(12, Math.min(20, fontSize ?? 16))}
            fill={textColor}
            listening={false}
          />
        </Group>
      );
    }

    // Container: render children inside a group. We don't clip yet.
    if (type === "container" || type.includes("container")) {
      const kids = childrenByParent.get(w.id) || [];
      const clip = !!(p.clip_children ?? p.clipChildren);
      return (
        <Group
          key={w.id}
          clipFunc={
            clip
              ? (ctx) => {
                  ctx.rect(ax, ay, w.w, w.h);
                }
              : undefined
          }
        >
          {base}
          {kids.map((k) => renderWidget(k, selectedSet.has(k.id)))}
        </Group>
      );
    }

    if (type === "bar") {
      const barMin = Number(p.min ?? 0);
      const barMax = Number(p.max ?? 100);
      const val = Number(p.value ?? (barMin + barMax) / 2);
      const startVal = Number(p.start_value ?? barMin);
      const mode = String(p.mode ?? "NORMAL").toUpperCase();
      const isVert = w.h > w.w;
      const pad = 8;
      const trackLen = isVert ? w.h - pad * 2 : w.w - pad * 2;
      const thick = Math.min(isVert ? w.w - pad * 2 : w.h - pad * 2, 20);
      let normStart = barMax > barMin ? (startVal - barMin) / (barMax - barMin) : 0;
      let normEnd = barMax > barMin ? (val - barMin) / (barMax - barMin) : 0.5;
      if (mode === "RANGE" && normStart > normEnd) [normStart, normEnd] = [normEnd, normStart];
      if (mode === "SYMMETRICAL") normStart = 0.5;
      const trackFill = String(s.bg_color ?? "#1f2937");
      const indFill = String((w.indicator || {}).bg_color ?? "#10b981");
      if (isVert) {
        const tx = ax + (w.w - thick) / 2;
        const ty = ay + pad;
        return (
          <Group key={w.id}>
            {base}
            <Rect x={tx} y={ty} width={thick} height={trackLen} fill={trackFill} cornerRadius={thick / 2} listening={false} />
            <Rect x={tx} y={ty + trackLen * (1 - normEnd)} width={thick} height={trackLen * (normEnd - normStart)} fill={indFill} cornerRadius={thick / 2} listening={false} />
          </Group>
        );
      }
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + pad} y={ay + (w.h - thick) / 2} width={trackLen} height={thick} fill={trackFill} cornerRadius={thick / 2} listening={false} />
          <Rect x={ax + pad + trackLen * normStart} y={ay + (w.h - thick) / 2} width={trackLen * (normEnd - normStart)} height={thick} fill={indFill} cornerRadius={thick / 2} listening={false} />
        </Group>
      );
    }

    if (type === "slider") {
      const barMin = Number(p.min ?? 0);
      const barMax = Number(p.max ?? 100);
      const val = override?.value !== undefined ? override.value : Number(p.value ?? (barMin + barMax) / 2);
      const startVal = Number(p.start_value ?? barMin);
      const mode = String(p.mode ?? "NORMAL").toUpperCase();
      const isVert = w.h > w.w;
      const pad = 10;
      const trackLen = isVert ? w.h - pad * 2 : w.w - pad * 2;
      const thick = Math.min(isVert ? w.w - pad * 2 : w.h - pad * 2, 12);
      let norm = barMax > barMin ? (val - barMin) / (barMax - barMin) : 0.5;
      let normStart = barMax > barMin ? (startVal - barMin) / (barMax - barMin) : 0;
      if (mode === "RANGE" && normStart > norm) [normStart, norm] = [norm, normStart];
      const trackFill = String(s.bg_color ?? "#1f2937");
      const indFill = String((w.indicator || {}).bg_color ?? "#10b981");
      const sliderKnob = w.knob || {};
      const sliderKnobR = Number(sliderKnob.radius ?? 0) > 0 ? Number(sliderKnob.radius) : (Number(sliderKnob.width ?? 0) > 0 || Number(sliderKnob.height ?? 0) > 0 ? Math.max(Number(sliderKnob.width ?? 0), Number(sliderKnob.height ?? 0)) / 2 : 0);
      const knobR = Math.max(6, sliderKnobR > 0 ? Math.min(sliderKnobR, (isVert ? w.w : w.h) / 2 - 4) : Math.min(thick * 1.2, (isVert ? w.w : w.h) / 4));
      const knobFill = String(sliderKnob.bg_color ?? s.bg_color ?? "#e5e7eb");
      if (isVert) {
        const tx = ax + w.w / 2;
        const ty = ay + pad;
        const knobY = ty + trackLen * (1 - norm);
        return (
          <Group key={w.id}>
            {base}
            <Rect x={tx - thick / 2} y={ty} width={thick} height={trackLen} fill={trackFill} cornerRadius={thick / 2} listening={false} />
            <Rect x={tx - thick / 2} y={knobY} width={thick} height={trackLen * norm} fill={indFill} cornerRadius={thick / 2} listening={false} />
            <Circle x={tx} y={knobY} radius={knobR} fill={knobFill} stroke={border} strokeWidth={1} listening={false} />
          </Group>
        );
      }
      const knobX = ax + pad + trackLen * norm;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + pad} y={ay + (w.h - thick) / 2} width={trackLen} height={thick} fill={trackFill} cornerRadius={thick / 2} listening={false} />
          <Rect x={ax + pad} y={ay + (w.h - thick) / 2} width={trackLen * norm} height={thick} fill={indFill} cornerRadius={thick / 2} listening={false} />
          <Circle x={knobX} y={ay + w.h / 2} radius={knobR} fill={knobFill} stroke={border} strokeWidth={1} listening={false} />
        </Group>
      );
    }

    if (type.includes("arc") || type.includes("gauge") || type === "meter") {
      const cx = ax + w.w / 2;
      const cy = ay + w.h / 2;
      const trackW = Math.max(4, Math.min(16, Math.min(w.w, w.h) / 8));
      const r = Math.max(14, Math.min(w.w, w.h) / 2 - trackW - 4);
      const rot = Number(p.rotation ?? 0);
      const bgStart = Number(p.bg_start_angle ?? 0);
      const bgEnd = Number(p.bg_end_angle ?? 270);
      const sweep = (bgEnd - bgStart + 360) % 360 || 360;
      const min = Number(p.min ?? 0);
      const max = Number(p.max ?? 100);
      const val = override?.value !== undefined ? override.value : Number(p.value ?? (min + max) / 2);
      const mode = String(p.mode ?? "NORMAL").toUpperCase();
      let indStart = bgStart;
      let indSweep = 0;
      if (max > min) {
        const t = (val - min) / (max - min);
        if (mode === "SYMMETRICAL") {
          const mid = (bgStart + bgEnd) / 2;
          indStart = mid;
          indSweep = (val - min) / (max - min) * (bgEnd - bgStart) / 2;
        } else if (mode === "REVERSE") {
          indStart = bgEnd;
          indSweep = -t * (bgEnd - bgStart);
        } else {
          indSweep = t * (bgEnd - bgStart);
        }
      }
      const knobOffset = Number(p.knob_offset ?? 0);
      const endDeg = indStart + indSweep + knobOffset;
      const knobDef = w.knob || {};
      let knobRadiusFromProp = Number(knobDef.radius ?? 0);
      // LVGL uses 0x7FFF as "default" knob size; treat any very large value as default for a visible knob
      if (knobRadiusFromProp > 24 || knobRadiusFromProp === 0x7FFF) knobRadiusFromProp = 0;
      const knobW = Number(knobDef.width ?? 0);
      const knobH = Number(knobDef.height ?? 0);
      const knobR = knobRadiusFromProp > 0
        ? Math.min(r - 2, knobRadiusFromProp)
        : (knobW > 0 || knobH > 0 ? Math.min(r - 2, Math.max(knobW, knobH) / 2) : Math.min(r - 2, 12));
      const knobSize = Math.max(6, knobR);
      const knobX = cx + r * Math.cos((endDeg * Math.PI) / 180);
      const knobY = cy + r * Math.sin((endDeg * Math.PI) / 180);
      const bgStroke = toFillColor(s.bg_color ?? p.bg_color, "#1f2937");
      const indStroke = toFillColor((w.indicator || {}).bg_color ?? s.bg_color, "#10b981");
      const knobFill = toFillColor(knobDef.bg_color ?? s.bg_color, "#e5e7eb");
      const innerR = r - trackW / 2;
      const outerR = r + trackW / 2;
      return (
        <Group key={w.id}>
          {base}
          <Arc x={cx} y={cy} innerRadius={innerR} outerRadius={outerR} angle={sweep} rotation={rot + bgStart} fill={bgStroke} clockwise listening={false} />
          {indSweep !== 0 && (
            <Arc x={cx} y={cy} innerRadius={innerR} outerRadius={outerR} angle={Math.abs(indSweep)} rotation={rot + (indSweep >= 0 ? indStart : endDeg - knobOffset)} fill={indStroke} clockwise={indSweep >= 0} listening={false} />
          )}
          <Circle x={knobX} y={knobY} radius={knobSize} fill={knobFill} stroke={border} strokeWidth={1} listening={false} />
          {(() => {
            const arcLayout = textLayoutFromWidget(ax, ay, w.w, w.h, p, s);
            const valueFontSize = Math.max(8, Math.min(48, Number(s.font_size ?? p.font_size ?? 14)));
            const valueX = arcLayout.x + Number(p.value_label_offset_x ?? 0);
            const valueY = arcLayout.y + Number(p.value_label_offset_y ?? 0);
            return (
              <Text text={String(val)} x={valueX} y={valueY} width={arcLayout.width} height={arcLayout.height} align={arcLayout.align} verticalAlign={arcLayout.verticalAlign} fontSize={valueFontSize} fill={textColor} listening={false} />
            );
          })()}
        </Group>
      );
    }

    if (type === "switch") {
      const checked = !!(p.checked ?? p.state);
      const trackH = Math.max(14, w.h - 8);
      const switchKnob = w.knob || {};
      const thumbR = Math.max(4, Number(switchKnob.radius ?? 0) > 0 ? Number(switchKnob.radius) : (Number(switchKnob.width ?? 0) > 0 || Number(switchKnob.height ?? 0) > 0 ? Math.max(Number(switchKnob.width ?? 0), Number(switchKnob.height ?? 0)) / 2 : 8));
      const trackW = Math.max(40, w.w - 8);
      const knobX = checked ? ax + 4 + trackW - thumbR - 4 : ax + 4 + thumbR + 4;
      const trackFill = checked ? String((w.indicator || {}).bg_color ?? s.bg_color ?? "#10b981") : String(s.bg_color ?? "#1f2937");
      const knobFill = String(switchKnob.bg_color ?? s.text_color ?? "#e5e7eb");
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 4} y={ay + (w.h - trackH) / 2} width={trackW} height={trackH} fill={trackFill} cornerRadius={trackH / 2} listening={false} />
          <Circle x={knobX} y={ay + w.h / 2} radius={thumbR} fill={knobFill} stroke={border} strokeWidth={1} listening={false} />
        </Group>
      );
    }

    if (type === "checkbox") {
      const checked = !!(p.checked ?? p.state);
      const size = Math.min(24, w.h - 8);
      const labelLeft = ax + 6 + size + 8;
      const labelW = w.w - 6 - size - 8;
      const layout = textLayoutFromWidget(labelLeft, ay, labelW, w.h, p, s);
      const labelText = String(p.text ?? (title || "Checkbox"));
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + (w.h - size) / 2} width={size} height={size} stroke="#6b7280" strokeWidth={2} cornerRadius={4} fill="transparent" listening={false} />
          {checked && (
            <Text text="✓" x={ax + 6} y={ay + (w.h - size) / 2 - 2} width={size} height={size} align="center" fontSize={size - 4} fill="#10b981" listening={false} />
          )}
          <Text text={labelText} x={layout.x} y={layout.y} width={layout.width} height={layout.height} align={layout.align} verticalAlign={layout.verticalAlign} fontSize={fontSize} fill={textColor} listening={false} />
        </Group>
      );
    }

    if (type === "dropdown") {
      let opts: string[];
      if (Array.isArray(p.options)) {
        opts = p.options.map((o: any) => String(o ?? ""));
      } else if (typeof p.options === "string") {
        const s = p.options.trim();
        opts = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (opts.length <= 1 && s.includes("\\n")) opts = s.split("\\n").map((x) => x.trim()).filter(Boolean);
      } else {
        opts = ["Option 1", "Option 2"];
      }
      if (opts.length === 0) opts = ["Select…"];
      const selIdx = Math.min(Math.max(0, Number(p.selected_index ?? 0)), opts.length - 1);
      const displayText = override?.text !== undefined ? String(override.text) : String(opts[selIdx] ?? opts[0] ?? "Select…");
      const ddBg = toFillColor(s.bg_color ?? p.bg_color, "#1e293b");
      const selectedPart = w.selected || {};
      const selText = toFillColor(selectedPart.text_color, textColor);
      const layout = textLayoutFromWidget(ax, ay, w.w, w.h, p, s);
      const textW = Math.max(20, layout.width - 24);
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={ddBg} stroke="#334155" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={displayText} x={layout.x} y={layout.y} width={textW} height={layout.height} align={layout.align} verticalAlign={layout.verticalAlign} fontSize={fontSize} fill={selText} ellipsis listening={false} />
          <Text text="▼" x={ax + w.w - 24} y={ay + (w.h - 12) / 2} width={16} align="center" fontSize={10} fill={selText} listening={false} />
        </Group>
      );
    }

    if (type === "image" || type === "animimg") {
      const clipCorner = !!(p.clip_corner ?? s.clip_corner);
      const innerRadius = clipCorner ? Math.min(8, (Math.min(w.w, w.h) - 12) / 4) : 0;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill="#1f2937" stroke="#4b5563" strokeWidth={1} cornerRadius={innerRadius} listening={false} />
          <Text text="🖼" x={ax} y={ay + (w.h - 20) / 2} width={w.w} align="center" fontSize={14} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "obj") {
      return (
        <Group key={w.id}>
          {base}
          <Text text="obj" x={ax + 8} y={ay + (w.h - 14) / 2} fontSize={12} fill="#9ca3af" fontStyle="italic" listening={false} />
        </Group>
      );
    }

    if (type === "textarea") {
      const taBg = toFillColor(s.bg_color ?? p.bg_color, "#1e293b");
      const layout = textLayoutFromWidget(ax + 6, ay + 6, w.w - 12, w.h - 12, p, s);
      const cursorPart = w.cursor || {};
      const cursorColor = toFillColor(cursorPart.color, textColor);
      const cursorW = Math.max(1, Math.min(8, Number(cursorPart.width ?? 2)));
      const cx = layout.x + 2;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={taBg} stroke="#334155" strokeWidth={1} cornerRadius={4} listening={false} />
          <Text text={String(p.text ?? "Text…")} x={layout.x} y={layout.y} width={layout.width} height={layout.height} align={layout.align} verticalAlign={layout.verticalAlign} fontSize={fontSize} fill={textColor} ellipsis listening={false} />
          <Rect x={cx} y={ay + 8} width={cursorW} height={w.h - 16} fill={cursorColor} listening={false} />
        </Group>
      );
    }

    if (type === "roller") {
      const opts = Array.isArray(p.options) ? p.options : ["Option 1", "Option 2", "Option 3"];
      const selected = Math.min(Math.max(0, Number(p.selected ?? 0)), opts.length - 1);
      const rowH = Math.min(24, (w.h - 16) / 3);
      const visible = Math.max(1, Math.floor((w.h - 16) / rowH));
      const start = Math.max(0, selected - Math.floor(visible / 2));
      const rollBg = toFillColor(s.bg_color ?? p.bg_color, "#1e293b");
      const itemsPart = w.items || {};
      const selectedPart = w.selected || {};
      const itemBg = toFillColor(itemsPart.bg_color, rollBg);
      const itemText = toFillColor(itemsPart.text_color, "#94a3b8");
      const selBg = toFillColor(selectedPart.bg_color, rollBg);
      const selText = toFillColor(selectedPart.text_color, textColor);
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={rollBg} stroke="#334155" strokeWidth={1} cornerRadius={4} listening={false} />
          {opts.slice(start, start + visible).map((opt: string, i: number) => {
            const isSel = i + start === selected;
            return (
              <Group key={i} listening={false}>
                {isSel && selBg !== rollBg && <Rect x={ax + 8} y={ay + 8 + i * rowH} width={w.w - 16} height={rowH - 2} fill={selBg} cornerRadius={2} listening={false} />}
                <Text text={String(opt).slice(0, 20)} x={ax + 12} y={ay + 8 + i * rowH} width={w.w - 24} fontSize={Math.min(12, rowH - 4)} fill={isSel ? selText : itemText} ellipsis listening={false} />
              </Group>
            );
          })}
        </Group>
      );
    }

    if (type === "spinner") {
      const cx = ax + w.w / 2;
      const cy = ay + w.h / 2;
      const r = Math.min(w.w, w.h) / 4 - 4;
      const arcW = Math.max(3, r / 4);
      const indColor = String((w.indicator || {}).bg_color ?? "#10b981");
      return (
        <Group key={w.id}>
          {base}
          <Arc x={cx} y={cy} innerRadius={r - arcW / 2} outerRadius={r + arcW / 2} angle={90} rotation={0} stroke={indColor} strokeWidth={arcW} fillEnabled={false} clockwise listening={false} />
        </Group>
      );
    }

    if (type === "spinbox") {
      const layout = textLayoutFromWidget(ax, ay, w.w, w.h, p, s);
      const cursorPart = w.cursor || {};
      const cursorColor = toFillColor(cursorPart.color, textColor);
      const cursorW = Math.max(1, Math.min(8, Number(cursorPart.width ?? 2)));
      const cx = layout.x + 4;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill="#0b1220" stroke="#374151" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={String(p.value ?? "0")} x={layout.x} y={layout.y} width={layout.width} height={layout.height} align={layout.align} verticalAlign={layout.verticalAlign} fontSize={fontSize} fill={textColor} listening={false} />
          <Rect x={cx} y={ay + 8} width={cursorW} height={w.h - 16} fill={cursorColor} listening={false} />
          <Text text="-" x={ax + 8} y={ay + (w.h - 14) / 2} width={20} align="center" fontSize={12} fill="#9ca3af" listening={false} />
          <Text text="+" x={ax + w.w - 28} y={ay + (w.h - 14) / 2} width={20} align="center" fontSize={12} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "qrcode") {
      const light = String(p.light_color ?? "#ffffff");
      const dark = String(p.dark_color ?? "#000000");
      const sz = Math.min(w.w, w.h) * 0.6;
      const tx = ax + (w.w - sz) / 2;
      const ty = ay + (w.h - sz) / 2;
      const cell = Math.max(3, sz / 12);
      const cols = Math.floor(sz / cell);
      return (
        <Group key={w.id}>
          {base}
          <Rect x={tx} y={ty} width={sz} height={sz} fill={light} stroke="#374151" listening={false} />
          {Array.from({ length: cols * cols }, (_, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            if ((c + r) % 3 === 0 || (c % 2 === 0 && r % 2 === 0)) return null;
            return <Rect key={i} x={tx + c * cell + 1} y={ty + r * cell + 1} width={cell - 1} height={cell - 1} fill={dark} listening={false} />;
          })}
        </Group>
      );
    }

    if (type === "led") {
      const brightness = Math.min(100, Math.max(0, Number(p.brightness ?? 100)));
      const ledColor = String(p.color ?? s.bg_color ?? "#00ff00");
      const dim = brightness / 100;
      const r = Math.min(w.w, w.h) / 4 - 2;
      const fill = dim >= 0.01 ? ledColor : "#1f2937";
      const opacity = dim >= 0.01 ? 0.3 + 0.7 * dim : 0.4;
      return (
        <Group key={w.id}>
          {base}
          <Circle x={ax + w.w / 2} y={ay + w.h / 2} radius={r} fill={fill} opacity={opacity} stroke={dim >= 0.01 ? "#34d399" : "#374151"} strokeWidth={2} listening={false} />
        </Group>
      );
    }

    if (type === "chart") {
      const chartType = String(p.type ?? "line").toLowerCase();
      const pad = 12;
      const graphW = w.w - pad * 2;
      const graphH = w.h - pad * 2 - 14;
      const pts = [ax + pad, ay + w.h - pad - 10, ax + pad + graphW * 0.25, ay + pad + graphH * 0.6, ax + pad + graphW * 0.5, ay + pad + graphH * 0.25, ax + pad + graphW * 0.85, ay + pad + graphH * 0.5];
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={String(s.bg_color ?? "#0b1220")} stroke="#374151" strokeWidth={1} cornerRadius={4} listening={false} />
          {chartType === "bar" ? (
            [0.3, 0.5, 0.7, 0.9].map((v, i) => (
              <Rect key={i} x={ax + pad + (graphW / 5) * (i + 0.5)} y={ay + pad + graphH * (1 - v)} width={graphW / 6} height={graphH * v} fill="#10b981" cornerRadius={2} listening={false} />
            ))
          ) : (
            <Line points={pts} stroke="#10b981" strokeWidth={2} lineCap="round" lineJoin="round" listening={false} />
          )}
          <Text text="Chart" x={ax} y={ay + 4} width={w.w} align="center" fontSize={11} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "line") {
      const pts = Array.isArray(p.points) && p.points.length >= 2
        ? p.points.flatMap((pt: string) => {
            const [a, b] = String(pt).split(",").map(Number);
            return [ax + (Number.isFinite(a) ? a : 0), ay + (Number.isFinite(b) ? b : 0)];
          })
        : [ax, ay, ax + w.w, ay + w.h];
      const lineColor = String(p.line_color ?? s.border_color ?? "#10b981");
      const lineW = Math.max(1, Number(p.line_width ?? 2));
      const rounded = !!p.line_rounded;
      return (
        <Group key={w.id}>
          {base}
          <Line points={pts} stroke={lineColor} strokeWidth={lineW} lineCap={rounded ? "round" : "butt"} lineJoin={rounded ? "round" : "miter"} listening={false} />
        </Group>
      );
    }

    if (type === "tabview") {
      const tabH = 24;
      const tabs = Array.isArray(p.tabs) ? p.tabs : ["Tab 1", "Tab 2"];
      const tabW = Math.max(40, (w.w - 12 - (tabs.length - 1) * 4) / tabs.length);
      return (
        <Group key={w.id}>
          {base}
          {tabs.slice(0, 6).map((t: string, i: number) => (
            <Rect key={i} x={ax + 6 + i * (tabW + 4)} y={ay + 6} width={tabW} height={tabH} fill={String((w.tab_style || {}).bg_color ?? "#374151")} cornerRadius={4} listening={false} />
          ))}
          <Rect x={ax + 6} y={ay + 6 + tabH} width={w.w - 12} height={w.h - 12 - tabH} fill={String(s.bg_color ?? "#0b1220")} cornerRadius={0} listening={false} />
          {tabs[0] && <Text text={String(tabs[0]).slice(0, 12)} x={ax + 12} y={ay + 10} width={tabW - 8} fontSize={11} fill={textColor} ellipsis listening={false} />}
        </Group>
      );
    }
    if (type === "tileview") {
      return (
        <Group key={w.id}>
          {base}
          {[0, 1].map((i) => (
            <Rect key={i} x={ax + 8 + i * (w.w / 2 - 4)} y={ay + 8} width={w.w / 2 - 12} height={w.h / 2 - 12} fill="#374151" cornerRadius={4} listening={false} />
          ))}
          <Text text="Tile" x={ax} y={ay + (w.h - 12) / 2} width={w.w} align="center" fontSize={11} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "buttonmatrix") {
      const pad = 6;
      const mapRows = Array.isArray(p.map) ? p.map : ["1", "2", "3", "4"];
      const rows = mapRows.length;
      const cols = Math.max(1, mapRows.reduce((m: number, row: string) => {
        const n = typeof row === "string" ? row.split(/[\s,]+/).filter(Boolean).length : 0;
        return Math.max(m, n);
      }, 1));
      const widthWeights = typeof p.width === "string" && p.width.trim()
        ? p.width.trim().split(/\s+/).map((x: string) => Math.max(0.1, Number(x) || 1)).slice(0, cols)
        : null;
      const totalWeight = widthWeights ? widthWeights.reduce((a: number, b: number) => a + b, 0) : cols;
      const bwPerCol = widthWeights
        ? (w.w - pad * (cols + 1)) / totalWeight
        : (w.w - pad * (cols + 1)) / cols;
      const bh = Math.min(28, (w.h - pad * (rows + 1)) / rows);
      const labels = mapRows.flatMap((row: string) => (typeof row === "string" ? row.split(/[\s,]+/).filter(Boolean) : []));
      const colX = (c: number) => widthWeights
        ? ax + pad + widthWeights.slice(0, c).reduce((a: number, b: number) => a + bwPerCol * b, 0) + c * pad
        : ax + pad + c * (bwPerCol + pad);
      const cellW = (c: number) => (widthWeights && widthWeights[c] != null ? widthWeights[c] * bwPerCol : bwPerCol);
      return (
        <Group key={w.id}>
          {base}
          {Array.from({ length: Math.min(rows * cols, 24) }, (_, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const bx = colX(c);
            const by = ay + pad + r * (bh + pad);
            const bw = cellW(c);
            return (
              <Group key={i}>
                <Rect x={bx} y={by} width={bw} height={bh} fill="#374151" cornerRadius={4} listening={false} />
                <Text text={String(labels[i] ?? "").slice(0, 4)} x={bx} y={by + (bh - 10) / 2} width={bw} align="center" fontSize={Math.min(10, bh - 4)} fill={textColor} listening={false} />
              </Group>
            );
          })}
        </Group>
      );
    }

    if (type === "keyboard") {
      const pad = 4;
      const keyW = (w.w - pad * 11) / 10;
      const keyH = Math.min(24, (w.h - pad * 5) / 4);
      return (
        <Group key={w.id}>
          {base}
          {Array.from({ length: 4 * 10 }, (_, i) => (
            <Rect key={i} x={ax + pad + (i % 10) * (keyW + pad)} y={ay + pad + Math.floor(i / 10) * (keyH + pad)} width={keyW} height={keyH} fill="#374151" cornerRadius={2} listening={false} />
          ))}
          <Text text="⌨" x={ax} y={ay + w.h - 20} width={w.w} align="center" fontSize={12} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "list") {
      const rowH = Math.max(16, Math.min(48, Number(p.item_height ?? 28)));
      const items = Array.isArray(p.items) ? p.items : ["Item 1", "Item 2"];
      const count = Math.min(items.length, Math.max(1, Math.floor((w.h - 12) / rowH)));
      const itemsPart = w.items || {};
      const selectedPart = w.selected || {};
      const itemBg = toFillColor(itemsPart.bg_color, "#1f2937");
      const itemTextCol = toFillColor(itemsPart.text_color, textColor);
      const selBg = toFillColor(selectedPart.bg_color, "#374151");
      const selTextCol = toFillColor(selectedPart.text_color, textColor);
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={String(s.bg_color ?? "#0b1220")} cornerRadius={4} listening={false} />
          {Array.from({ length: count }, (_, i) => {
            const isSel = i === 0;
            const rowFill = isSel ? selBg : itemBg;
            const rowText = isSel ? selTextCol : itemTextCol;
            return (
              <Group key={i} listening={false}>
                <Rect x={ax + 10} y={ay + 10 + i * rowH} width={w.w - 20} height={rowH - 4} fill={rowFill} cornerRadius={2} listening={false} />
                <Text text={String(items[i] ?? "").slice(0, 24)} x={ax + 14} y={ay + 10 + i * rowH + (rowH - 4 - 12) / 2} width={w.w - 28} fontSize={Math.min(12, rowH - 8)} fill={rowText} ellipsis listening={false} />
              </Group>
            );
          })}
        </Group>
      );
    }
    if (type === "table") {
      const cols = Math.max(1, Math.min(12, Number(p.col_cnt ?? 3)));
      const rows = Math.max(1, Math.min(20, Number(p.row_cnt ?? 3)));
      const pad = Number(p.cell_padding ?? 4);
      const colW = (w.w - 12 - pad * (cols + 1)) / cols;
      const rowH = (w.h - 12 - pad * (rows + 1)) / rows;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={String(s.bg_color ?? "#0b1220")} stroke="#374151" strokeWidth={1} cornerRadius={4} listening={false} />
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => (
              <Rect key={`${r}-${c}`} x={ax + 8 + pad + c * (colW + pad)} y={ay + 8 + pad + r * (rowH + pad)} width={colW} height={rowH} fill={r === 0 ? "#374151" : "#1f2937"} cornerRadius={1} listening={false} />
            ))
          )}
        </Group>
      );
    }

    if (type === "calendar") {
      const cellW = (w.w - 16) / 7;
      const cellH = Math.min(20, (w.h - 24) / 6);
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={String(s.bg_color ?? "#111827")} stroke="#374151" strokeWidth={1} cornerRadius={4} listening={false} />
          <Text text="S M T W T F S" x={ax + 8} y={ay + 8} width={w.w - 16} fontSize={10} fill="#9ca3af" listening={false} />
          {Array.from({ length: 35 }, (_, i) => (
            <Rect key={i} x={ax + 8 + (i % 7) * cellW} y={ay + 22 + Math.floor(i / 7) * cellH} width={cellW - 1} height={cellH - 1} fill={i === 15 ? "#374151" : "#1f2937"} cornerRadius={2} listening={false} />
          ))}
        </Group>
      );
    }

    if (type === "colorwheel") {
      const cx = ax + w.w / 2;
      const cy = ay + w.h / 2;
      const r = Math.min(w.w, w.h) / 2 - 4;
      const innerR = r * 0.4;
      const segments = 36;
      const angleStep = 360 / segments;
      return (
        <Group key={w.id}>
          {base}
          <Circle x={cx} y={cy} radius={r} stroke="#6b7280" strokeWidth={2} listening={false} />
          {Array.from({ length: segments }, (_, i) => {
            const hue = i * angleStep;
            const fill = `hsl(${hue}, 100%, 50%)`;
            return (
              <Arc
                key={i}
                x={cx}
                y={cy}
                innerRadius={innerR}
                outerRadius={r}
                angle={angleStep + 1}
                rotation={-hue}
                fill={fill}
                listening={false}
              />
            );
          })}
          <Circle x={cx} y={cy} radius={innerR * 0.9} fill="#1f2937" stroke="#9ca3af" strokeWidth={1} listening={false} />
        </Group>
      );
    }

    if (type === "canvas") {
      const transparent = !!p.transparent;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={w.w - 16} height={w.h - 16} fill={transparent ? "rgba(15,23,42,0.5)" : "#0b1220"} stroke="#374151" strokeWidth={1} listening={false} />
          <Text text="canvas" x={ax} y={ay + (w.h - 12) / 2} width={w.w} align="center" fontSize={11} fill="#6b7280" fontStyle="italic" listening={false} />
        </Group>
      );
    }

    if (type === "msgboxes") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={28} fill="#374151" cornerRadius={4} listening={false} />
          <Rect x={ax + 6} y={ay + 34} width={w.w - 12} height={w.h - 40} fill={String(s.bg_color ?? "#0b1220")} cornerRadius={4} listening={false} />
          <Text text="Title" x={ax + 12} y={ay + 10} fontSize={12} fill={textColor} listening={false} />
          <Text text="Message…" x={ax + 12} y={ay + 42} width={w.w - 24} fontSize={11} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    // Default: label in top-left
    return (
      <Group key={w.id}>
        {base}
        <Text text={w.type} x={ax + 6} y={ay + 6} fontSize={14} fill="#e5e7eb" listening={false} />
      </Group>
    );
  };

  const gridLines = () => {
    if (!showGrid || gridSize <= 1) return null;
    const lines: any[] = [];
    for (let x = gridSize; x < width; x += gridSize) {
      lines.push(
        <Line
          key={`vx_${x}`}
          points={[x, 0, x, height]}
          stroke="#111827"
          strokeWidth={1}
          listening={false}
        />
      );
    }
    for (let y = gridSize; y < height; y += gridSize) {
      lines.push(
        <Line
          key={`hy_${y}`}
          points={[0, y, width, y]}
          stroke="#111827"
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return lines;
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const prebuilt = e.dataTransfer.getData('application/x-esphome-prebuilt-widget');
    const tmpl = e.dataTransfer.getData('application/x-esphome-control-template');
    const type = e.dataTransfer.getData('application/x-esphome-widget-type');
    const payload = prebuilt ? `prebuilt:${prebuilt}` : tmpl ? `tmpl:${tmpl}` : type;
    if (!payload || !onDropCreate) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    onDropCreate(payload, snap(x, gridSize), snap(y, gridSize));
  };

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{ width, height }}
    >
    <Stage
      width={width}
      height={height}
      ref={stageRef}
      style={{ background: /^#[0-9a-fA-F]{6}$/.test(dispBgColor || "") ? dispBgColor : "#0b0f14", borderRadius: 12, overflow: "hidden" }}
      onMouseDown={(e) => {
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
          const pos = e.target.getStage()?.getPointerPosition();
          if (pos) {
            boxSelectStartRef.current = { x: pos.x, y: pos.y };
          } else {
            onSelectNone();
          }
        }
      }}
      onMouseMove={(e) => {
        const pos = e.target.getStage()?.getPointerPosition();
        if (selectionBox && pos) {
          setSelectionBox((prev) => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
        } else if (boxSelectStartRef.current && pos) {
          const dx = pos.x - boxSelectStartRef.current.x;
          const dy = pos.y - boxSelectStartRef.current.y;
          if (Math.sqrt(dx * dx + dy * dy) >= BOX_SELECT_THRESHOLD) {
            setSelectionBox({
              startX: boxSelectStartRef.current.x,
              startY: boxSelectStartRef.current.y,
              endX: pos.x,
              endY: pos.y,
            });
            boxSelectStartRef.current = null;
          }
        }
      }}
      onMouseUp={(e) => {
        if (e.target !== e.target.getStage()) return;
        if (selectionBox) {
          finishSelectionBox();
        } else if (boxSelectStartRef.current) {
          boxSelectStartRef.current = null;
          onSelectNone();
        }
      }}
    >
      <Layer>
        {gridLines()}
        {widgets
          .filter((w) => !w.parent_id)
          .map((w) => renderWidget(w, selectedSet.has(w.id)))}
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          anchorSize={8}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
        {selectionBox && (
          <Rect
            x={Math.min(selectionBox.startX, selectionBox.endX)}
            y={Math.min(selectionBox.startY, selectionBox.endY)}
            width={Math.abs(selectionBox.endX - selectionBox.startX)}
            height={Math.abs(selectionBox.endY - selectionBox.startY)}
            stroke="#10b981"
            strokeWidth={2}
            dash={[6, 4]}
            fill="rgba(16, 185, 129, 0.08)"
            listening={false}
          />
        )}
      </Layer>
    </Stage>
    </div>
  );
}
