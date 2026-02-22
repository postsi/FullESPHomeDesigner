import React, { useMemo, useRef } from "react";
import { Stage, Layer, Rect, Text, Transformer, Line, Group, Circle } from "react-konva";

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
  onSelect: (id: string, additive: boolean) => void;
  onSelectNone: () => void;
  onDropCreate?: (type: string, x: number, y: number) => void;
  onChangeMany: (patches: { id: string; patch: Partial<Widget> }[], commit?: boolean) => void;
};

function snap(n: number, grid: number) {
  if (!grid || grid <= 1) return n;
  return Math.round(n / grid) * grid;
}


// --- v0.31: simple layout preview for container.flex_* ---
function computeLayoutPositions(widgets: Widget[]): Map<string, {x:number;y:number}> {
  const byId = new Map<string, Widget>();
  widgets.forEach(w => byId.set(w.id, w));
  const children = new Map<string, Widget[]>();
  widgets.forEach(w => {
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
  widgets.filter(w => !w.parent_id).forEach(w => walk(w.id));
  return pos;
}


export default function Canvas({
  widgets,
  selectedIds,
  width,
  height,
  gridSize,
  showGrid,
  onSelect,
  onSelectNone,
  onDropCreate,
  onChangeMany,
}: Props) {
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
    // Simple, intentionally lightweight previews (not pixel-perfect LVGL).
    // The goal is to make layouts usable while we keep the runtime YAML generator authoritative.
    const p = w.props || {};
    const s = w.style || {};
    const title = (p.text ?? p.label ?? p.name ?? w.type) as string;

    // Style helpers (schema-driven properties land in `style`, but many widgets also keep
    // some legacy/compat props in `props`). We treat style as authoritative when present.
    const bg = String(s.bg_color ?? s.background_color ?? p.bg_color ?? "#111827");
    const border = String(s.border_color ?? p.border_color ?? (isSel ? "#10b981" : "#374151"));
    const borderWidth = Number(s.border_width ?? p.border_width ?? 2);
    const opacity = Number(s.opacity ?? 1);
    const radius = Math.min(12, Math.max(0, Number(s.corner_radius ?? p.corner_radius ?? 8)));
    const textColor = String(s.text_color ?? p.text_color ?? "#e5e7eb");
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

          let ww = Math.max(20, node.width() * scaleX);
          let hh = Math.max(20, node.height() * scaleY);
          let xx = node.x();
          let yy = node.y();

          if (!alt) {
            ww = snap(ww, gridSize);
            hh = snap(hh, gridSize);
            xx = snap(xx, gridSize);
            yy = snap(yy, gridSize);
          }

          const parent = w.parent_id ? widgetById.get(w.parent_id) : undefined;
          const parentAbs = parent ? absPos(parent) : { ax: 0, ay: 0 };
          const modelX = xx - parentAbs.ax;
          const modelY = yy - parentAbs.ay;
          onChangeMany([{ id: w.id, patch: { x: modelX, y: modelY, w: ww, h: hh } }], true);
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
      return (
        <Group key={w.id}>
          {base}
          <Rect
            x={ax + 6}
            y={ay + 6}
            width={w.w - 12}
            height={w.h - 12}
            fill={String(s.inner_bg_color ?? "#0b1220")}
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

    if (type.includes("slider") || type.includes("bar")) {
      const barMin = Number(p.min_value ?? p.min ?? 0);
      const barMax = Number(p.max_value ?? p.max ?? 100);
      const val = Number(p.value ?? (barMin + barMax) / 2);
      const norm = barMax > barMin ? (val - barMin) / (barMax - barMin) : 0.5;
      return (
        <Group key={w.id}>
          {base}
          <Rect
            x={ax + 10}
            y={ay + w.h / 2 - 6}
            width={w.w - 20}
            height={12}
            fill={String(s.track_color ?? "#0b1220")}
            stroke={String(s.track_border_color ?? "#1f2937")}
            strokeWidth={Number(s.track_border_width ?? 2)}
            cornerRadius={6}
            listening={false}
          />
          <Rect
            x={ax + 10}
            y={ay + w.h / 2 - 6}
            width={(w.w - 20) * norm}
            height={12}
            fill={String(s.fill_color ?? "#10b981")}
            cornerRadius={6}
            listening={false}
          />
          <Circle
            x={ax + 10 + (w.w - 20) * norm}
            y={ay + w.h / 2}
            radius={10}
            fill={String(s.knob_color ?? "#111827")}
            stroke={String(s.knob_border_color ?? "#10b981")}
            strokeWidth={Number(s.knob_border_width ?? 2)}
            listening={false}
          />
        </Group>
      );
    }

    if (type.includes("arc") || type.includes("gauge") || type === "meter") {
      const r = Math.max(12, Math.min(w.w, w.h) / 2 - 10);
      const cx = ax + w.w / 2;
      const cy = ay + w.h / 2;
      const arcVal = String(p.value ?? p.start_value ?? "");
      return (
        <Group key={w.id}>
          {base}
          <Circle x={cx} y={cy} radius={r} stroke={String(s.track_color ?? "#1f2937")} strokeWidth={Number(s.track_width ?? s.arc_width ?? 12)} listening={false} />
          <Circle x={cx} y={cy} radius={r} stroke={String(s.fill_color ?? "#10b981")} strokeWidth={Number(s.track_width ?? s.arc_width ?? 12)} listening={false} opacity={Number(s.fill_opacity ?? 0.35)} />
          <Text
            text={arcVal}
            x={ax}
            y={cy - 10}
            width={w.w}
            align="center"
            fontSize={fontSize}
            fill={textColor}
            listening={false}
          />
        </Group>
      );
    }

    if (type === "switch") {
      const checked = !!(p.checked ?? p.state);
      const knobX = checked ? ax + w.w - 20 : ax + 4;
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 4} y={ay + 4} width={w.w - 8} height={w.h - 8} fill={checked ? String(s.fill_color ?? "#10b981") : "#1f2937"} cornerRadius={(w.h - 8) / 2} listening={false} />
          <Circle x={knobX + 8} y={ay + w.h / 2} radius={8} fill="#e5e7eb" listening={false} />
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
      const opts = Array.isArray(p.options) ? p.options : ["Option 1", "Option 2"];
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill="#0b1220" stroke="#374151" strokeWidth={1} cornerRadius={6} listening={false} />
          <Text text={String(opts[0] ?? "Select…")} x={ax + 14} y={ay + (w.h - 16) / 2} width={w.w - 36} fontSize={fontSize} fill={textColor} ellipsis listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 6} y={ay + 6} width={w.w - 12} height={w.h - 12} fill="#0b1220" stroke="#374151" strokeWidth={1} cornerRadius={4} listening={false} />
          <Text text={String(p.text ?? "Text…")} x={ax + 12} y={ay + 12} width={w.w - 24} fontSize={fontSize} fill={textColor} ellipsis listening={false} />
        </Group>
      );
    }

    if (type === "roller") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={w.w - 16} height={w.h - 16} fill="#0b1220" stroke="#374151" strokeWidth={1} cornerRadius={4} listening={false} />
          <Text text="▸ ▸ ▸" x={ax} y={ay + (w.h - 14) / 2} width={w.w} align="center" fontSize={12} fill={textColor} listening={false} />
        </Group>
      );
    }

    if (type === "spinner") {
      return (
        <Group key={w.id}>
          {base}
          <Circle x={ax + w.w / 2} y={ay + w.h / 2} radius={Math.min(w.w, w.h) / 4 - 4} stroke="#10b981" strokeWidth={3} listening={false} />
          <Text text="◌" x={ax} y={ay + (w.h - 16) / 2} width={w.w} align="center" fontSize={14} fill="#10b981" listening={false} />
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
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + (w.w - Math.min(w.w, w.h) * 0.6) / 2} y={ay + (w.h - Math.min(w.w, w.h) * 0.6) / 2} width={Math.min(w.w, w.h) * 0.6} height={Math.min(w.w, w.h) * 0.6} fill="#fff" stroke="#374151" listening={false} />
          <Text text="QR" x={ax} y={ay + (w.h - 14) / 2} width={w.w} align="center" fontSize={12} fill="#111827" listening={false} />
        </Group>
      );
    }

    if (type === "led") {
      const on = !!(p.state ?? p.value);
      return (
        <Group key={w.id}>
          {base}
          <Circle x={ax + w.w / 2} y={ay + w.h / 2} radius={Math.min(w.w, w.h) / 4 - 2} fill={on ? String(s.bg_color ?? "#00ff00") : "#1f2937"} stroke={on ? "#34d399" : "#374151"} strokeWidth={2} listening={false} />
        </Group>
      );
    }

    if (type === "chart") {
      return (
        <Group key={w.id}>
          {base}
          <Line points={[ax + 10, ay + w.h - 20, ax + w.w / 4, ay + w.h / 2, ax + w.w / 2, ay + 30, ax + w.w - 10, ay + 50]} stroke="#10b981" strokeWidth={2} listening={false} />
          <Text text="Chart" x={ax} y={ay + 6} fontSize={12} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "line") {
      return (
        <Group key={w.id}>
          {base}
          <Line points={[ax, ay, ax + w.w, ay + w.h]} stroke={String(s.line_color ?? "#10b981")} strokeWidth={Number(s.line_width ?? 2)} listening={false} />
        </Group>
      );
    }

    if (type === "tabview" || type === "tileview") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={60} height={20} fill="#374151" cornerRadius={4} listening={false} />
          <Text text={type} x={ax + 8} y={ay + 36} fontSize={12} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "buttonmatrix") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={(w.w - 24) / 3} height={24} fill="#374151" cornerRadius={4} listening={false} />
          <Rect x={ax + 16 + (w.w - 24) / 3} y={ay + 8} width={(w.w - 24) / 3} height={24} fill="#374151" cornerRadius={4} listening={false} />
          <Rect x={ax + 24 + 2 * (w.w - 24) / 3} y={ay + 8} width={(w.w - 24) / 3} height={24} fill="#374151" cornerRadius={4} listening={false} />
        </Group>
      );
    }

    if (type === "keyboard") {
      return (
        <Group key={w.id}>
          {base}
          <Text text="⌨" x={ax} y={ay + (w.h - 24) / 2} width={w.w} align="center" fontSize={18} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "list" || type === "table") {
      return (
        <Group key={w.id}>
          {base}
          {[0, 1, 2].map((i) => (
            <Rect key={i} x={ax + 8} y={ay + 12 + i * 18} width={w.w - 16} height={14} fill="#1f2937" cornerRadius={2} listening={false} />
          ))}
        </Group>
      );
    }

    if (type === "calendar") {
      return (
        <Group key={w.id}>
          {base}
          <Text text="📅" x={ax} y={ay + (w.h - 24) / 2} width={w.w} align="center" fontSize={18} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "colorwheel") {
      return (
        <Group key={w.id}>
          {base}
          <Circle x={ax + w.w / 2} y={ay + w.h / 2} radius={Math.min(w.w, w.h) / 4 - 4} stroke="#e879f9" strokeWidth={4} listening={false} />
          <Text text="🎨" x={ax} y={ay + 6} width={w.w} align="center" fontSize={12} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    if (type === "canvas") {
      return (
        <Group key={w.id}>
          {base}
          <Rect x={ax + 8} y={ay + 8} width={w.w - 16} height={w.h - 16} fill="#0b1220" stroke="#374151" strokeWidth={1} listening={false} />
          <Text text="canvas" x={ax} y={ay + (w.h - 12) / 2} width={w.w} align="center" fontSize={11} fill="#6b7280" fontStyle="italic" listening={false} />
        </Group>
      );
    }

    if (type === "msgboxes") {
      return (
        <Group key={w.id}>
          {base}
          <Text text="msgbox" x={ax} y={ay + (w.h - 14) / 2} width={w.w} align="center" fontSize={12} fill="#9ca3af" listening={false} />
        </Group>
      );
    }

    // Default: label in top-left
    return (
      <Group key={w.id}>
        {base}
        <Text
          text={w.type}
          x={w.x + 6}
          y={w.y + 6}
          fontSize={14}
          fill="#e5e7eb"
          listening={false}
        />
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
