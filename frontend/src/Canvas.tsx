import React, { useMemo, useRef } from "react";
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

  React.useEffect(() => {
    if (!trRef.current) return;
    const nodes = selectedIds
      .map((id) => stageRef.current?.findOne(`#${id}`))
      .filter(Boolean);
    trRef.current.nodes(nodes);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedIds]);

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

  const absPos = (w: Widget): { ax: number; ay: number } => {
    // parent-relative coordinates: child stores x/y relative to parent
    let ax = w.x;
    let ay = w.y;
    let p = w.parent_id ? widgetById.get(w.parent_id) : undefined;
    // guard against loops
    let guard = 0;
    while (p && guard++ < 10) {
      ax += p.x;
      ay += p.y;
      p = p.parent_id ? widgetById.get(p.parent_id) : undefined;
    }
    return { ax, ay };
  };

  const renderWidget = (w: Widget, isSel: boolean) => {
    const { ax, ay } = absPos(w);
    const override = liveOverrides[w.id];
    // Simple, intentionally lightweight previews (not pixel-perfect LVGL).
    // The goal is to make layouts usable while we keep the runtime YAML generator authoritative.
    const p = w.props || {};
    const s = w.style || {};
    const title = (override?.text !== undefined ? override.text : (p.text ?? p.label ?? p.name ?? w.type)) as string;

    // Style helpers (schema-driven properties land in `style`, but many widgets also keep
    // some legacy/compat props in `props`). We treat style as authoritative when present.
    // Use toFillColor so numeric 0xrrggbb from templates render legibly.
    const bg = toFillColor(s.bg_color ?? s.background_color ?? p.bg_color, "#111827");
    const border = toFillColor(s.border_color ?? p.border_color, isSel ? "#10b981" : "#374151");
    const borderWidth = Number(s.border_width ?? p.border_width ?? 2);
    const opacity = Number(s.opacity ?? 1);
    const radius = Math.min(12, Math.max(0, Number(s.corner_radius ?? p.corner_radius ?? 8)));
    const textColor = toFillColor(s.text_color ?? p.text_color, "#e5e7eb");
    const fontSize = Math.max(10, Math.min(28, Number(s.font_size ?? p.font_size ?? 16)));

    // Base background
    const base = (
      <Rect
        id={w.id}
        x={ax}
        y={ay}
        width={w.w}
        height={w.h}
        fill={bg}
        stroke={border}
        strokeWidth={borderWidth}
        cornerRadius={radius}
        opacity={opacity}
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
    );

    // Type-specific adornments
    const type = w.type.toLowerCase();
    if (type === "image_button") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={w.w - 16} height={w.h - 16} fill="#1f2937" stroke="#4b5563" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={String(p.text ?? "Img")} x={ax} y={ay + (w.h - 14) / 2} width={w.w} align="center" fontSize={12} fill={textColor} listening={false} />
        </Group>
      );
    }

    if (type.includes("label")) {
      return (
        <Group key={w.id}>
          {base}
          <Text
            text={String(title)}
            x={ax + 8}
            y={ay + Math.max(6, (w.h - 18) / 2)}
            fontSize={Math.max(12, Math.min(22, fontSize ?? 18))}
            fill={textColor}
            listening={false}
          />
        </Group>
      );
    }

    if (type.includes("button")) {
      const checked = override?.checked ?? (p as any).checked ?? false;
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
            cornerRadius={Math.min(10, Math.max(0, Number(s.corner_radius ?? p.corner_radius ?? 10)))}
            listening={false}
          />
          <Text
            text={String(title || "Button")}
            x={ax}
            y={ay + (w.h - 16) / 2}
            width={w.w}
            align="center"
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
          <Text text={String(val)} x={ax} y={cy - 8} width={w.w} align="center" fontSize={Math.max(10, fontSize - 2)} fill={textColor} listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + (w.h - size) / 2} width={size} height={size} stroke="#6b7280" strokeWidth={2} cornerRadius={4} fill="transparent" listening={false} />
          {checked && (
            <Text text="✓" x={ax + 6} y={ay + (w.h - size) / 2 - 2} width={size} height={size} align="center" fontSize={size - 4} fill="#10b981" listening={false} />
          )}
          <Text text={String(title || "Checkbox")} x={ax + 6 + size + 8} y={ay + (w.h - 16) / 2} fontSize={fontSize} fill={textColor} listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={ddBg} stroke="#334155" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={displayText} x={ax + 14} y={ay + (w.h - 16) / 2} width={w.w - 36} fontSize={fontSize} fill={textColor} ellipsis listening={false} />
          <Text text="▼" x={ax + w.w - 24} y={ay + (w.h - 12) / 2} width={16} align="center" fontSize={10} fill={textColor} listening={false} />
        </Group>
      );
    }

    if (type === "image" || type === "animimg") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill="#1f2937" stroke="#4b5563" strokeWidth={1} listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={taBg} stroke="#334155" strokeWidth={1} cornerRadius={4} listening={false} />
          <Text text={String(p.text ?? "Text…")} x={ax + 12} y={ay + 12} width={w.w - 24} fontSize={fontSize} fill={textColor} ellipsis listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={rollBg} stroke="#334155" strokeWidth={1} cornerRadius={4} listening={false} />
          {opts.slice(start, start + visible).map((opt: string, i: number) => (
            <Text key={i} text={String(opt).slice(0, 20)} x={ax + 12} y={ay + 8 + i * rowH} width={w.w - 24} fontSize={Math.min(12, rowH - 4)} fill={i + start === selected ? textColor : "#94a3b8"} ellipsis listening={false} />
          ))}
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill="#0b1220" stroke="#374151" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={String(p.value ?? "0")} x={ax + 12} y={ay + (w.h - 16) / 2} width={w.w - 24} align="center" fontSize={fontSize} fill={textColor} listening={false} />
          <Text text="−" x={ax + 8} y={ay + (w.h - 14) / 2} width={20} align="center" fontSize={12} fill="#9ca3af" listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={56} height={tabH} fill={String((w.tab_style || {}).bg_color ?? "#374151")} cornerRadius={4} listening={false} />
          <Rect x={ax + 6} y={ay + 6 + tabH} width={w.w - 12} height={w.h - 12 - tabH} fill={String(s.bg_color ?? "#0b1220")} cornerRadius={0} listening={false} />
          <Text text="Tab1" x={ax + 12} y={ay + 10} fontSize={11} fill={textColor} listening={false} />
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
      const cols = 3;
      const rows = 2;
      const bw = (w.w - pad * (cols + 1)) / cols;
      const bh = Math.min(28, (w.h - pad * (rows + 1)) / rows);
      return (
        <Group key={w.id}>
          {base}
          {Array.from({ length: rows * cols }, (_, i) => (
            <Rect key={i} x={ax + pad + (i % cols) * (bw + pad)} y={ay + pad + Math.floor(i / cols) * (bh + pad)} width={bw} height={bh} fill="#374151" cornerRadius={4} listening={false} />
          ))}
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
      const rowH = 28;
      const count = Math.max(1, Math.floor((w.h - 12) / rowH));
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={String(s.bg_color ?? "#0b1220")} cornerRadius={4} listening={false} />
          {Array.from({ length: count }, (_, i) => (
            <Rect key={i} x={ax + 10} y={ay + 10 + i * rowH} width={w.w - 20} height={rowH - 4} fill="#1f2937" cornerRadius={2} listening={false} />
          ))}
        </Group>
      );
    }
    if (type === "table") {
      const rowH = 22;
      const colW = (w.w - 16) / 3;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill={String(s.bg_color ?? "#0b1220")} stroke="#374151" strokeWidth={1} cornerRadius={4} listening={false} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <Rect key={`${r}-${c}`} x={ax + 8 + c * colW} y={ay + 8 + r * rowH} width={colW - 2} height={rowH - 2} fill={r === 0 ? "#374151" : "#1f2937"} cornerRadius={1} listening={false} />
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
      const r = Math.min(w.w, w.h) / 4 - 4;
      return (
        <Group key={w.id}>
          {base}
          <Circle x={cx} y={cy} radius={r} stroke="#6b7280" strokeWidth={2} listening={false} />
          {[0, 120, 240].map((rot, i) => (
            <Arc key={i} x={cx} y={cy} innerRadius={r * 0.4} outerRadius={r} angle={100} rotation={rot} fill={i === 0 ? "#e11d48" : i === 1 ? "#22c55e" : "#3b82f6"} listening={false} />
          ))}
          <Circle x={cx} y={cy} radius={r * 0.35} fill="#1f2937" stroke="#9ca3af" strokeWidth={1} listening={false} />
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
    const tmpl = e.dataTransfer.getData('application/x-esphome-control-template');
    const type = e.dataTransfer.getData('application/x-esphome-widget-type');
    const payload = tmpl ? `tmpl:${tmpl}` : type;
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
      style={{ background: "#0b0f14", borderRadius: 12, overflow: "hidden" }}
      onMouseDown={(e) => {
        // click on empty space clears selection
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) onSelectNone();
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
      </Layer>
    </Stage>
    </div>
  );
}
