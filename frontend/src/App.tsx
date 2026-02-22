import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas from "./Canvas";
import {listRecipes, compileYaml, listEntities, importRecipe, updateRecipeLabel, deleteRecipe, cloneRecipe, exportRecipe} from "./lib/api";
import { CONTROL_TEMPLATES, type ControlTemplate } from "./controls";
import { DOMAIN_PRESETS } from "./bindings/domains";
import {
  deleteDevice,
  deploy,
  exportDeviceYamlPreview,
  exportDeviceYamlWithExpectedHash,
  getContext,
  getProject,
  getWidgetSchema,
  listAssets,
  listDevices,
  listWidgetSchemas,
  putProject,
  uploadAsset,
  upsertDevice,
  validateRecipe,
  type DeviceSummary,
  type ProjectModel,
  type WidgetSchema,
  type WidgetSchemaIndexItem,
} from "./api";

type Toast = { type: "ok" | "error"; msg: string };

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function friendlyToId(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "device";
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}


function useHistory<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const set = (next: T, commit = true) => {
    if (!commit) {
      setPresent(next);
      return;
    }
    setPast((p) => [...p, present]);
    setPresent(next);
    setFuture([]);
  };

  const undo = () => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [present, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, present]);
      setPresent(next);
      return f.slice(1);
    });
  };

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  return { present, set, undo, redo, canUndo, canRedo };
}

export default function App() {
  const [entryId, setEntryId] = useState<string>("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  // Hardware recipes are loaded once for pickers and metadata display.
  const [recipes, setRecipes] = useState<any[]>([]);
  const setRecipesRef = useRef(setRecipes);
  setRecipesRef.current = setRecipes;
  const [recipeValidateBusy, setRecipeValidateBusy] = useState(false);
  const [recipeValidateErr, setRecipeValidateErr] = useState<string>("");
  const [recipeValidateRes, setRecipeValidateRes] = useState<any>(null);

  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDeviceSlug, setNewDeviceSlug] = useState("");

  // New device wizard: hardware-first flow
  const [newDeviceWizardOpen, setNewDeviceWizardOpen] = useState(false);
  const [newDeviceWizardStep, setNewDeviceWizardStep] = useState<1 | 2>(1);
  const [newDeviceWizardRecipe, setNewDeviceWizardRecipe] = useState<{ id: string; label: string } | null>(null);
  const [newDeviceWizardId, setNewDeviceWizardId] = useState("");
  const [newDeviceWizardName, setNewDeviceWizardName] = useState("");
  const [newDeviceWizardSlug, setNewDeviceWizardSlug] = useState("");

  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const projectHist = useHistory<ProjectModel | null>(null);
  const project = projectHist.present;
  const setProject = projectHist.set;

  const [schemaIndex, setSchemaIndex] = useState<WidgetSchemaIndexItem[]>([]);
  const [newWidgetType, setNewWidgetType] = useState("label");
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const selectedWidgetId = selectedWidgetIds[0] || "";
  const [selectedSchema, setSelectedSchema] = useState<WidgetSchema | null>(null);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Clipboard for copy/paste (v0.19). Stored as raw widget JSON fragments.
  const [clipboard, setClipboard] = useState<any[] | null>(null);

  // v0.22: Post-drop wizard for HA control templates.
  const [tmplWizard, setTmplWizard] = useState<null | { template_id: string; x: number; y: number }>(null);
  const [tmplEntity, setTmplEntity] = useState<string>("");
  const [tmplLabel, setTmplLabel] = useState<string>("");
  // v0.34: entity capabilities (supported_features/attrs) shown in the wizard.
  const [tmplCaps, setTmplCaps] = useState<any>(null);
  // v0.36: allow explicit selection of a variant, otherwise auto-pick based on capabilities.
  const [tmplVariant, setTmplVariant] = useState<string>("auto");

  // v0.60: Card wizard options (cards share the same post-drop wizard).
  const [tmplTapAction, setTmplTapAction] = useState<string>("toggle");
  const [tmplService, setTmplService] = useState<string>("");
  const [tmplServiceData, setTmplServiceData] = useState<string>("");
  const [tmplEntities, setTmplEntities] = useState<string[]>([]);

  // v0.68: Conditional card wizard builder
  const [tmplCondOp, setTmplCondOp] = useState<string>("equals");
  const [tmplCondValue, setTmplCondValue] = useState<string>("on");
  const [tmplCondNumeric, setTmplCondNumeric] = useState<boolean>(false);

  // v0.61: Richer card wizard options
  // Thermostat
  const [tmplThMin, setTmplThMin] = useState<number>(5);
  const [tmplThMax, setTmplThMax] = useState<number>(35);
  const [tmplThStep, setTmplThStep] = useState<number>(1);

  // Media card
  const [tmplMediaShowTransport, setTmplMediaShowTransport] = useState<boolean>(true);
  const [tmplMediaShowVolume, setTmplMediaShowVolume] = useState<boolean>(true);
  const [tmplMediaShowMute, setTmplMediaShowMute] = useState<boolean>(true);
  const [tmplMediaShowSource, setTmplMediaShowSource] = useState<boolean>(true);
  const [tmplMediaDefaultSource, setTmplMediaDefaultSource] = useState<string>("");

  // Cover card
  const [tmplCoverShowTilt, setTmplCoverShowTilt] = useState<boolean>(true);

  // Multi-entity cards
  const [tmplGlanceRows, setTmplGlanceRows] = useState<number>(4);
  const [tmplGridSize, setTmplGridSize] = useState<"2x2" | "3x2" | "3x3">("2x2");


  // v0.24: Design-time entity list snapshot for template wizard + linting.
  const [entities, setEntities] = useState<any[]>([]);

  // Binding Builder: entity picker search + bind target fields.
  const [entityQuery, setEntityQuery] = useState<string>("");
  const [bindEntity, setBindEntity] = useState<string>("");
  const [bindAttr, setBindAttr] = useState<string>("");
  const [bindAction, setBindAction] = useState<string>("label_text");
  const [bindFormat, setBindFormat] = useState<string>("");
  const [bindScale, setBindScale] = useState<number>(1);

  // v0.35: Plugin controls (loaded from API)
  const [pluginControls, setPluginControls] = useState<ControlTemplate[]>([]);

  // v0.24: Lint output shown in the UI (best-effort, purely advisory).
  // --- Assets panel (v0.27) ---
const [assets, setAssets] = React.useState<{name:string; size:number}[]>([]);
const [assetError, setAssetError] = React.useState<string | null>(null);

async function refreshAssets() {
  try {
    const items = await listAssets();
    setAssets(items);
    setAssetError(null);
  } catch (e: any) {
    setAssetError(String(e?.message || e));
  }
}

async function onUploadAssetFile(file: File) {
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  await uploadAsset(file.name, b64);
  await refreshAssets();
}

const [lintOpen, setLintOpen] = useState<boolean>(false);
  const [editorTab, setEditorTab] = useState<"design" | "compile">("design");
  const [compiledYaml, setCompiledYaml] = useState<string>("");
  const [compileErr, setCompileErr] = useState<string>("");
  const [autoCompile, setAutoCompile] = useState<boolean>(true);
  const [compileBusy, setCompileBusy] = useState<boolean>(false);
  const [exportBusy, setExportBusy] = useState<boolean>(false);
  const [exportPreview, setExportPreview] = useState<any>(null);
  const [exportPreviewErr, setExportPreviewErr] = useState<string>("");
  const [exportResult, setExportResult] = useState<any>(null);
  const [exportErr, setExportErr] = useState<string>("");


  // v0.62: Built-in self-check (verification suite) — runs backend checks without deploying.
  const [selfCheckBusy, setSelfCheckBusy] = useState<boolean>(false);
  const [selfCheckResult, setSelfCheckResult] = useState<any>(null);
  const [selfCheckErr, setSelfCheckErr] = useState<string>("");

  // v0.64: Hardware recipe importer (Product Mode)
  const [recipeImportOpen, setRecipeImportOpen] = useState<boolean>(false);
  const [recipeImportYaml, setRecipeImportYaml] = useState<string>("");
  const [recipeImportLabel, setRecipeImportLabel] = useState<string>("");
  const [recipeImportId, setRecipeImportId] = useState<string>("");
  const [recipeImportBusy, setRecipeImportBusy] = useState<boolean>(false);
  const [recipeImportErr, setRecipeImportErr] = useState<string>("");
  const [recipeImportOk, setRecipeImportOk] = useState<any>(null);

  // v0.69: Recipe Manager (Product Mode)
  const [recipeMgrOpen, setRecipeMgrOpen] = useState<boolean>(false);
  const [recipeMgrEdits, setRecipeMgrEdits] = useState<Record<string, string>>({});
  const [recipeMgrBusy, setRecipeMgrBusy] = useState<boolean>(false);
  const [recipeMgrErr, setRecipeMgrErr] = useState<string>("");

  async function doImportRecipe() {
    setRecipeImportBusy(true);
    setRecipeImportErr("");
    setRecipeImportOk(null);
    try {
      const res = await importRecipe(recipeImportYaml, recipeImportLabel || undefined, recipeImportId || undefined);
      setRecipeImportOk(res);
    } catch (e: any) {
      setRecipeImportErr(String(e?.message || e));
    } finally {
      setRecipeImportBusy(false);
    }
  }




  async function refresh() {
    const res = await listDevices(entryId);
    if (!res.ok) return setToast({ type: "error", msg: res.error });
    setDevices(res.devices);
  }

  const refreshRecipes = useCallback(async () => {
    try {
      const rs = await listRecipes();
      setRecipesRef.current(rs);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    refreshRecipes();
    (async () => {
      const ctx = await getContext();
      if (!ctx.ok) return setToast({ type: "error", msg: ctx.error });
      setEntryId(ctx.entry_id);

      const si = await listWidgetSchemas();
      if (si.ok) setSchemaIndex(si.schemas);

      // refresh after entryId set
      const res = await listDevices(ctx.entry_id);
      if (res.ok) setDevices(res.devices);
    })();
  }, []);

  const selectedDeviceObj = useMemo(() => devices.find((d) => d.device_id === selectedDevice) || null, [devices, selectedDevice]);
  const selectedRecipeId = selectedDeviceObj?.hardware_recipe_id || null;

  // v0.68: Validate and display hardware recipe metadata + issues.
  useEffect(() => {
    if (!selectedRecipeId) {
      setRecipeValidateRes(null);
      setRecipeValidateErr("");
      return;
    }
    let cancelled = false;
    (async () => {
      setRecipeValidateBusy(true);
      setRecipeValidateErr("");
      try {
        const r: any = await validateRecipe(selectedRecipeId);
        if (cancelled) return;
        setRecipeValidateRes(r);
      } catch (e: any) {
        if (cancelled) return;
        setRecipeValidateErr(String(e?.message || e));
        setRecipeValidateRes(null);
      } finally {
        if (!cancelled) setRecipeValidateBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRecipeId]);

useEffect(() => {
  // Design-time entity picker (poll-free): fetch snapshot when panel opens.
  listEntities()
    .then((x) => setEntities(Array.isArray(x) ? x : []))
    .catch(() => setEntities([]));
}, []);

useEffect(() => {
  // v0.35: load plugin controls (best-effort)
  (async () => {
    try {
      const r = await fetch("/api/esphome_touch_designer/plugins");
      const j = await r.json();
      const pc: ControlTemplate[] = Array.isArray(j?.controls)
        ? j.controls
            .filter((c: any) => c && c.id && Array.isArray(c.widgets))
            .map((c: any) => ({
              id: String(c.id),
              title: String(c.title || c.id),
              description: String(c.description || "Plugin control"),
              build: (_args: any) => ({ widgets: c.widgets || [], bindings: c.bindings || [], links: c.links || [] }),
            }))
        : [];
      setPluginControls(pc);
    } catch (e) {
      setPluginControls([]);
    }
  })();
}, []);

useEffect(() => {
  // v0.34: when the template wizard has an entity, fetch its capabilities.
  (async () => {
    try {
      if (!tmplWizard) return setTmplCaps(null);
      const eid = (tmplEntity || "").trim();
      if (!eid || !eid.includes(".")) return setTmplCaps(null);
      const r = await fetch(`/api/esphome_touch_designer/ha/entities/${encodeURIComponent(eid)}/capabilities`);
      if (!r.ok) return setTmplCaps(null);
      const j = await r.json();
      setTmplCaps(j);
    } catch {
      setTmplCaps(null);
    }
  })();
}, [tmplWizard, tmplEntity]);

useEffect(() => {
  // v0.61: prefill card options from capabilities when available.
  if (!tmplWizard || !tmplCaps) return;
  try {
    if (tmplWizard.template_id === "thermostat_card") {
      const a = tmplCaps?.attributes || {};
      if (typeof a.min_temp === "number") setTmplThMin(a.min_temp);
      if (typeof a.max_temp === "number") setTmplThMax(a.max_temp);
      if (typeof a.target_temp_step === "number") setTmplThStep(a.target_temp_step);
    }
    if (tmplWizard.template_id === "media_control_card") {
      // Default: only show source row if there is a source_list.
      const a = tmplCaps?.attributes || {};
      if (!Array.isArray(a.source_list) || a.source_list.length === 0) setTmplMediaShowSource(false);
      // Default source if provided.
      if (Array.isArray(a.source_list) && a.source_list.length > 0 && !tmplMediaDefaultSource) {
        setTmplMediaDefaultSource(String(a.source_list[0]));
      }
    }
  } catch {}
}, [tmplCaps, tmplWizard]);

  function templateDomain(template_id: string): string {
    // Convention: ha_<domain>_...
    const m = /^ha_([a-z0-9]+)_/i.exec(template_id || "");
    return (m?.[1] || "").toLowerCase();
  }

  const allTemplatesForWizard = [...CONTROL_TEMPLATES, ...(pluginControls ?? [])];
  const wizardTemplate = tmplWizard ? allTemplatesForWizard.find((t) => t?.id === tmplWizard.template_id) ?? null : null;
  const wizardIsCard = !!(wizardTemplate && String((wizardTemplate as any).title || "").startsWith("Card Library •"));
  const wizardIsMultiEntity = !!(tmplWizard && (tmplWizard.template_id.startsWith("glance_card") || tmplWizard.template_id.startsWith("grid_card_")));
  const wizardWantsTapAction = !!(tmplWizard && (tmplWizard.template_id === "entity_card" || tmplWizard.template_id === "tile_card" || tmplWizard.template_id.startsWith("glance_card") || tmplWizard.template_id.startsWith("grid_card_")));
  const wizardEntitySlots = (() => {
    if (!tmplWizard) return 1;
    if (tmplWizard.template_id.startsWith("glance_card")) return tmplGlanceRows || 4;
    if (tmplWizard.template_id.startsWith("grid_card_")) {
      if (tmplGridSize === "3x3") return 9;
      if (tmplGridSize === "3x2") return 6;
      return 4;
    }
    return 1;
  })();

  function lintProject(p: ProjectModel | null) {
    const res: { level: "error" | "warn"; msg: string }[] = [];
    if (!p) return res;
    const pages = p.pages || [];
    const allWidgets: any[] = [];
    for (const pg of pages) {
      for (const w of (pg?.widgets || [])) allWidgets.push(w);
    }
    const widgetIds = new Set(allWidgets.map((w) => w?.id).filter(Boolean));

    const bindings = (p as any).bindings || [];
    const links = (p as any).links || [];

    for (const b of bindings) {
      const eid = String(b?.entity_id || "").trim();
      if (!eid) res.push({ level: "warn", msg: "Binding has empty entity_id (will compile to nothing)." });
      else if (!eid.includes(".")) res.push({ level: "warn", msg: `Binding entity_id looks invalid: ${eid}` });
    }

    for (const ln of links) {
      const wid = String(ln?.target?.widget_id || "").trim();
      const eid = String(ln?.source?.entity_id || "").trim();
      if (wid && !widgetIds.has(wid)) res.push({ level: "error", msg: `Link targets missing widget id: ${wid}` });
      if (eid && !eid.includes(".")) res.push({ level: "warn", msg: `Link source entity_id looks invalid: ${eid}` });
      if (!eid) res.push({ level: "warn", msg: "Link source has empty entity_id (live updates will not work)." });
      if (!wid) res.push({ level: "warn", msg: "Link target has empty widget_id (live updates will not work)." });
    }

    const entitySet = new Set((entities || []).map((e) => e?.entity_id).filter(Boolean));
    for (const b of bindings) {
      const eid = String(b?.entity_id || "").trim();
      if (eid && entitySet.size > 0 && !entitySet.has(eid)) {
        res.push({ level: "warn", msg: `Binding entity_id not found in current HA snapshot: ${eid}` });
      }
    }

    return res;
  }

  function openTemplateWizard(template_id: string, x: number, y: number) {
    setTmplWizard({ template_id, x, y });
    setTmplEntity("");
    setTmplLabel("");
    setTmplCaps(null);
    setTmplVariant("auto");

    // v0.60: card wizard extras
    setTmplTapAction(template_id === "entity_card" ? "more-info" : template_id === "tile_card" ? "toggle" : "toggle");
    setTmplService("");
    setTmplServiceData("");
    setTmplEntities([]);

    // v0.61: defaults for richer card options
    setTmplThMin(5); setTmplThMax(35); setTmplThStep(1);
    setTmplMediaShowTransport(true); setTmplMediaShowVolume(true); setTmplMediaShowMute(true); setTmplMediaShowSource(true); setTmplMediaDefaultSource("");
    setTmplCoverShowTilt(true);
    setTmplGlanceRows(4);
    setTmplGridSize("2x2");
  }

  function pickCapabilityVariant(baseTemplateId: string, caps: any | null, chosen: string): string {
    // v0.36: capability-driven variants for HA controls.
    if (chosen && chosen !== "auto") return chosen;
    const dom = templateDomain(baseTemplateId);
    if (dom === "light") {
      const modes = caps?.attributes?.supported_color_modes;
      if (Array.isArray(modes) && modes.includes("color_temp")) return "ha_light_ct";
      // Default to brightness + toggle, which is widely supported.
      return "ha_light_full";
    }
    if (dom === "cover") {
      // Heuristic: if HA exposes tilt position attributes, prefer the tilt control.
      const hasTilt = caps?.attributes && (caps.attributes.current_tilt_position !== undefined || caps.attributes.tilt_position !== undefined);
      if (hasTilt) return "ha_cover_tilt";
      return "ha_cover_basic";
    }
    if (dom === "media_player") {
      // If HA provides media metadata, prefer the richer template when available.
      const a = caps?.attributes || {};
      const hasMeta = a.media_title !== undefined || a.media_artist !== undefined || a.source_list !== undefined;
      if (hasMeta) return "ha_media_player_full";
      return "ha_media_basic";
    }
    // (Future) climate/cover/media variants.
    return baseTemplateId;
  }

  function applyTemplateWizard() {
    if (!project || !tmplWizard) return;
    const p2 = clone(project);
    const allTemplates = [...CONTROL_TEMPLATES, ...pluginControls];
    let baseId = tmplWizard.template_id;

// v0.61: grid size selector allows choosing a variant at insert time.
if (baseId.startsWith("grid_card_")) {
  if (tmplGridSize === "3x2") baseId = "grid_card_3x2";
  else if (tmplGridSize === "3x3") baseId = "grid_card_3x3";
  else baseId = "grid_card_2x2";
}

// v0.61: glance rows selector chooses a specific template id.
if (baseId.startsWith("glance_card")) {
  if (tmplGlanceRows === 6) baseId = "glance_card_6";
  else if (tmplGlanceRows === 3) baseId = "glance_card_3";
  else if (tmplGlanceRows === 2) baseId = "glance_card_2";
  else baseId = "glance_card";
}

const resolvedId = pickCapabilityVariant(baseId, tmplCaps, tmplVariant);
    const tmpl = allTemplates.find((t) => t.id === resolvedId);
    if (!tmpl) return;

    const entity_id = tmplEntity.trim();
    const label = tmplLabel.trim() || undefined;
    const built = tmpl.build({
      entity_id,
      entities: tmplEntities,
      x: tmplWizard.x,
      y: tmplWizard.y,
      label,
      tap_action: tmplTapAction,
      service: tmplService,
      service_data: tmplServiceData,
      caps: tmplCaps,

      // v0.68: conditional card wizard
      condition: (() => {
        if (baseId !== "conditional_card") return undefined;
        const v = String(tmplCondValue || "").trim();
        if (!v) return 'x == "on"';
        if (tmplCondNumeric) {
          const num = Number(v);
          if (Number.isFinite(num)) {
            const f = `atof(x.c_str())`;
            if (tmplCondOp === "gt") return `${f} > ${num}`;
            if (tmplCondOp === "lt") return `${f} < ${num}`;
            if (tmplCondOp === "neq") return `${f} != ${num}`;
            return `${f} == ${num}`;
          }
        }
        const esc = v.replaceAll('"', '\\"');
        if (tmplCondOp === "contains") return `x.find(\"${esc}\") != std::string::npos`;
        if (tmplCondOp === "neq") return `x != \"${esc}\"`;
        return `x == \"${esc}\"`;
      })(),

      // v0.61: richer card options
      th_min: tmplThMin,
      th_max: tmplThMax,
      th_step: tmplThStep,

      media_show_transport: tmplMediaShowTransport,
      media_show_volume: tmplMediaShowVolume,
      media_show_mute: tmplMediaShowMute,
      media_show_source: tmplMediaShowSource,
      media_default_source: tmplMediaDefaultSource,

      cover_show_tilt: tmplCoverShowTilt,
    });

    // v0.35: best-effort placeholder substitution for plugin templates.
    const replaceEntity = (s: string) => {
      if (!entity_id) return s;
      return s
        .replaceAll("${entity_id}", entity_id)
        .replaceAll("light.example", entity_id)
        .replaceAll("climate.example", entity_id)
        .replaceAll("cover.example", entity_id)
        .replaceAll("media_player.example", entity_id)
        .replaceAll("switch.example", entity_id);
    };
    for (const w of (built.widgets || [])) {
      if (w?.events) {
        for (const k of Object.keys(w.events)) {
          if (typeof w.events[k] === "string") w.events[k] = replaceEntity(w.events[k]);
        }
      }
      if (label && w?.props?.text && typeof w.props.text === "string") {
        // Optional: if plugin template uses ${label}
        w.props.text = String(w.props.text).replaceAll("${label}", label);
      }
    }
    for (const b of (built.bindings || [])) {
      if (entity_id && (!b.entity_id || String(b.entity_id).endsWith(".example"))) b.entity_id = entity_id;
    }
    for (const l of (built.links || [])) {
      if (entity_id && l?.source && (!l.source.entity_id || String(l.source.entity_id).endsWith(".example"))) l.source.entity_id = entity_id;
    }
    const ws = (built.widgets || []).map((w: any) => ({
      ...w,
      id: uid(w.type || "w"),
    }));
    // Preserve template internal links by remapping ids.
    const idMap = new Map<string, string>();
    for (let i = 0; i < (built.widgets || []).length; i++) {
      idMap.set(built.widgets[i].id, ws[i].id);
    }
    const links = (built.links || []).map((l: any) => {
      const wid = l?.target?.widget_id;
      if (wid && idMap.has(wid)) {
        return { ...l, target: { ...l.target, widget_id: idMap.get(wid) } };
      }
      return l;
    });

    const page = p2.pages?.[safePageIndex];
    if (!page?.widgets) return;
    page.widgets.push(...ws);
    (p2 as any).bindings = Array.isArray((p2 as any).bindings) ? (p2 as any).bindings : [];
    (p2 as any).links = Array.isArray((p2 as any).links) ? (p2 as any).links : [];
    (p2 as any).bindings.push(...(built.bindings || []));
    (p2 as any).links.push(...links);

    setProject(p2, true);
    if (ws[0]?.id) setSelectedWidgetIds([ws[0].id]);
    setTmplWizard(null);
  }

  async function addDevice() {
    if (!newDeviceName.trim() || !newDeviceId.trim()) return;
    setBusy(true);
    try {
      const res = await upsertDevice(entryId, {
        device_id: newDeviceId.trim(),
        name: newDeviceName.trim() || newDeviceId.trim(),
        slug: newDeviceSlug.trim() || undefined,
      });
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: "Device saved" });
      setNewDeviceId(""); setNewDeviceName(""); setNewDeviceSlug("");
      await refresh();
    } finally { setBusy(false); }
  }

  async function createNewDeviceFromWizard() {
    if (!newDeviceWizardRecipe || !newDeviceWizardId.trim()) return;
    const did = newDeviceWizardId.trim();
    setBusy(true);
    try {
      const res = await upsertDevice(entryId, {
        device_id: did,
        name: newDeviceWizardName.trim() || did,
        slug: newDeviceWizardSlug.trim() || undefined,
        hardware_recipe_id: newDeviceWizardRecipe.id,
      });
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: "Device created" });
      setNewDeviceWizardOpen(false);
      setNewDeviceWizardStep(1);
      setNewDeviceWizardRecipe(null);
      setNewDeviceWizardId("");
      setNewDeviceWizardName("");
      setNewDeviceWizardSlug("");
      await refresh();
      setEditorTab("design");
      await loadDevice(did);
    } finally { setBusy(false); }
  }

  function openNewDeviceWizard() {
    setNewDeviceWizardOpen(true);
    setNewDeviceWizardStep(1);
    setNewDeviceWizardRecipe(null);
    setNewDeviceWizardId("");
    setNewDeviceWizardName("");
    setNewDeviceWizardSlug("");
    refreshRecipes(); // Refetch recipes when wizard opens (handles late load or retry)
  }

  function wizardSelectRecipe(r: { id: string; label: string }) {
    setNewDeviceWizardRecipe(r);
    const derived = friendlyToId(r.label || r.id);
    setNewDeviceWizardName(r.label || r.id);
    setNewDeviceWizardId(derived);
    setNewDeviceWizardSlug(derived);
    setNewDeviceWizardStep(2);
  }

  async function removeDevice(id: string) {
    if (!confirm(`Delete ${id}?`)) return;
    setBusy(true);
    try {
      const res = await deleteDevice(entryId, id);
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: "Device deleted" });
      if (selectedDevice === id) { setSelectedDevice(""); setProject(null); }
      await refresh();
    } finally { setBusy(false); }
  }

  async function loadDevice(id: string) {
    setBusy(true);
    try {
      const res = await getProject(entryId, id);
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setSelectedDevice(id);
      setProject(res.project);
      setSelectedWidgetIds([]);
      setSelectedSchema(null);
      setCurrentPageIndex(0);
      setToast({ type: "ok", msg: `Loaded project for ${id}` });
    } finally { setBusy(false); }
  }

  const pages = project?.pages ?? [];
  const safePageIndex = Math.max(0, Math.min(currentPageIndex, Math.max(0, pages.length - 1)));
  const widgets = pages?.[safePageIndex]?.widgets ?? [];
  function _findWidget(id: string) {
    return widgets.find((w: any) => w.id === id);
  }

  function _childrenOf(parentId: string) {
    return widgets.filter((w: any) => w.parent_id === parentId);
  }

  function _absPos(w: any): { ax: number; ay: number } {
    let ax = Number(w.x || 0);
    let ay = Number(w.y || 0);
    let p = w.parent_id ? _findWidget(w.parent_id) : null;
    let guard = 0;
    while (p && guard++ < 10) {
      ax += Number(p.x || 0);
      ay += Number(p.y || 0);
      p = p.parent_id ? _findWidget(p.parent_id) : null;
    }
    return { ax, ay };
  }

  // v0.18: Grouping as a container widget (children become parent-relative).
  function groupSelected() {
    if (!project) return;
    if (selectedWidgetIds.length < 2) return;
    const sel = selectedWidgetIds.map(_findWidget).filter(Boolean) as any[];
    if (sel.length < 2) return;
    // Only group widgets with the same parent (simple rule for now)
    const parentId = sel[0].parent_id || "";
    if (!sel.every((w) => (w.parent_id || "") === parentId)) {
      setToast({ type: "error", msg: "Grouping currently requires all selected widgets to share the same parent." });
      return;
    }

    const abs = sel.map((w) => ({ w, ..._absPos(w) }));
    const minX = Math.min(...abs.map((x) => x.ax));
    const minY = Math.min(...abs.map((x) => x.ay));
    const maxX = Math.max(...abs.map((x) => x.ax + (x.w.w || 0)));
    const maxY = Math.max(...abs.map((x) => x.ay + (x.w.h || 0)));

    const parentWidget = parentId ? _findWidget(parentId) : null;
    const parentAbs = parentWidget ? _absPos(parentWidget) : { ax: 0, ay: 0 };
    const containerId = uid("container");
    const container = {
      id: containerId,
      type: "container",
      x: minX - parentAbs.ax,
      y: minY - parentAbs.ay,
      w: Math.max(40, maxX - minX),
      h: Math.max(40, maxY - minY),
      parent_id: parentId || undefined,
      props: { clickable: false, scrollable: false, layout: "NONE" },
      style: { border_width: 1, border_color: "#10b981", bg_color: "#00000000" },
      events: {},
    };

    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    // Insert container just before the first selected widget to keep approximate z-order.
    const firstIdx = Math.min(...sel.map((w) => list.findIndex((x) => x.id === w.id)).filter((i) => i >= 0));
    list.splice(firstIdx >= 0 ? firstIdx : list.length, 0, container);

    // Re-parent selected widgets under container with relative coords.
    for (const entry of abs) {
      const w = list.find((x) => x.id === entry.w.id);
      if (!w) continue;
      w.parent_id = containerId;
      w.x = entry.ax - minX;
      w.y = entry.ay - minY;
    }

    setProject(p2, true);
    setSelectedWidgetIds([containerId]);
  }

  // v0.18: Ungroup (only works when selecting a container).
  function ungroupSelected() {
    if (!project) return;
    if (selectedWidgetIds.length !== 1) return;
    const w0 = _findWidget(selectedWidgetIds[0]);
    if (!w0 || String(w0.type).toLowerCase() !== "container") return;
    const kids = _childrenOf(w0.id);

    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const container = list.find((x) => x.id === w0.id);
    if (!container) return;
    const parentId = container.parent_id || "";
    const containerAbs = _absPos(container);
    const parentWidget = parentId ? _findWidget(parentId) : null;
    const parentAbs = parentWidget ? _absPos(parentWidget) : { ax: 0, ay: 0 };

    for (const k of kids) {
      const kk = list.find((x) => x.id === k.id);
      if (!kk) continue;
      // Convert from container-relative -> parent-relative (or top-level absolute)
      const absKx = containerAbs.ax + Number(kk.x || 0);
      const absKy = containerAbs.ay + Number(kk.y || 0);
      kk.parent_id = parentId || undefined;
      kk.x = absKx - parentAbs.ax;
      kk.y = absKy - parentAbs.ay;
    }

    // Remove container
    const idx = list.findIndex((x) => x.id === container.id);
    if (idx >= 0) list.splice(idx, 1);
    setProject(p2, true);
    setSelectedWidgetIds(kids.map((k) => k.id));
  }

  // v0.18: Z-order within the current page list (only within same parent).
  function moveZ(direction: "front" | "back") {
    if (!project) return;
    if (!selectedWidgetIds.length) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x.id === id)).filter(Boolean) as any[];
    if (!sel.length) return;
    const parentId = sel[0].parent_id || "";
    if (!sel.every((w) => (w.parent_id || "") === parentId)) {
      setToast({ type: "error", msg: "Z-order moves currently require all selected widgets to share the same parent." });
      return;
    }
    const idxs = sel.map((w) => list.findIndex((x) => x.id === w.id)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    // We'll treat the list order as z-order; move block up/down by 1.
    if (direction === "front") {
      const last = idxs[idxs.length - 1];
      if (last >= list.length - 1) return;
      const block = idxs.map((i) => list[i]);
      // remove from back to front
      for (let i = idxs.length - 1; i >= 0; i--) list.splice(idxs[i], 1);
      list.splice(last + 1 - idxs.length + 1, 0, ...block);
    } else {
      const first = idxs[0];
      if (first <= 0) return;
      const block = idxs.map((i) => list[i]);
      for (let i = idxs.length - 1; i >= 0; i--) list.splice(idxs[i], 1);
      list.splice(first - 1, 0, ...block);
    }
    setProject(p2, true);
  }

  // v0.19: Copy/Paste selected widgets (within the active page).
  function copySelected() {
    if (!selectedWidgetIds.length) return;
    const sel = selectedWidgetIds.map(_findWidget).filter(Boolean);
    if (!sel.length) return;
    // Copy as deep-cloned fragments.
    setClipboard(sel.map((w) => clone(w)));
    setToast({ type: "ok", msg: `Copied ${sel.length} widget(s)` });
  }

  function pasteClipboard() {
    if (!project) return;
    if (!clipboard?.length) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];

    // Paste offset: 12px right/down each time.
    const offset = 12;
    const idMap = new Map<string, string>();
    const pasted: any[] = [];

    // Only paste widgets that either have no parent or whose parent also exists in the clipboard.
    const clipIds = new Set(clipboard.map((w) => w.id));
    const clipRoots = clipboard.filter((w) => !w.parent_id || clipIds.has(w.parent_id));

    for (const w0 of clipRoots) {
      const w = clone(w0);
      const newId = uid(w.type || "widget");
      idMap.set(w.id, newId);
      w.id = newId;
      // Update parent_id if parent in clipboard
      if (w.parent_id && idMap.has(w.parent_id)) w.parent_id = idMap.get(w.parent_id);
      // Apply offset in its own coordinate space.
      w.x = Number(w.x || 0) + offset;
      w.y = Number(w.y || 0) + offset;
      pasted.push(w);
    }

    // Second pass to fix parent_ids for children pasted after parents.
    for (const w of pasted) {
      if (w.parent_id && idMap.has(w.parent_id)) w.parent_id = idMap.get(w.parent_id);
    }

    list.push(...pasted);
    setProject(p2, true);
    setSelectedWidgetIds(pasted.map((w) => w.id));
  }

  
function nudgeSelected(dx: number, dy: number, step: number) {
    if (!project) return;
    if (!selectedWidgetIds.length) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x.id === id)).filter(Boolean) as any[];
    if (!sel.length) return;

    // Group by parent to keep relative semantics predictable.
    const byParent = new Map<string, any[]>();
    for (const w of sel) {
      const pid = String(w.parent_id || "");
      let arr = byParent.get(pid);
      if (!arr) { arr = []; byParent.set(pid, arr); }
      arr.push(w);
    }

    for (const [pid, items] of byParent.entries()) {
      for (const w of items) {
        w.x = (w.x || 0) + dx * step;
        w.y = (w.y || 0) + dy * step;
      }
    }

    setProject(p2, true);
  }

  function alignSelected(mode: "left"|"center"|"right"|"top"|"middle"|"bottom") {
    if (!project) return;
    if (selectedWidgetIds.length < 2) return;

    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x.id === id)).filter(Boolean) as any[];
    if (sel.length < 2) return;

    // Align only within shared-parent groups (predictable for nested containers)
    const byParent = new Map<string, any[]>();
    for (const w of sel) {
      const pid = String(w.parent_id || "");
      let arr = byParent.get(pid);
      if (!arr) { arr = []; byParent.set(pid, arr); }
      arr.push(w);
    }

    for (const items of byParent.values()) {
      if (items.length < 2) continue;
      const left = Math.min(...items.map((w) => w.x || 0));
      const top = Math.min(...items.map((w) => w.y || 0));
      const right = Math.max(...items.map((w) => (w.x || 0) + (w.w || 0)));
      const bottom = Math.max(...items.map((w) => (w.y || 0) + (w.h || 0)));
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;

      for (const w of items) {
        if (mode === "left") w.x = left;
        if (mode === "center") w.x = cx - (w.w || 0) / 2;
        if (mode === "right") w.x = right - (w.w || 0);
        if (mode === "top") w.y = top;
        if (mode === "middle") w.y = cy - (w.h || 0) / 2;
        if (mode === "bottom") w.y = bottom - (w.h || 0);
      }
    }

    setProject(p2, true);
  }

  function distributeSelected(axis: "h"|"v") {
    if (!project) return;
    if (selectedWidgetIds.length < 3) return;

    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x.id === id)).filter(Boolean) as any[];
    if (sel.length < 3) return;

    const byParent = new Map<string, any[]>();
    for (const w of sel) {
      const pid = String(w.parent_id || "");
      let arr = byParent.get(pid);
      if (!arr) { arr = []; byParent.set(pid, arr); }
      arr.push(w);
    }

    for (const items of byParent.values()) {
      if (items.length < 3) continue;
      if (axis === "h") {
        const sorted = [...items].sort((a, b) => (a.x - b.x) || a.id.localeCompare(b.id));
        const left = sorted[0].x || 0;
        const right = (sorted[sorted.length - 1].x || 0) + (sorted[sorted.length - 1].w || 0);
        const totalW = sorted.reduce((acc, w) => acc + (w.w || 0), 0);
        const gap = (right - left - totalW) / (sorted.length - 1);
        let x = left;
        for (const w of sorted) {
          w.x = x;
          x += (w.w || 0) + gap;
        }
      } else {
        const sorted = [...items].sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
        const top = sorted[0].y || 0;
        const bottom = (sorted[sorted.length - 1].y || 0) + (sorted[sorted.length - 1].h || 0);
        const totalH = sorted.reduce((acc, w) => acc + (w.h || 0), 0);
        const gap = (bottom - top - totalH) / (sorted.length - 1);
        let y = top;
        for (const w of sorted) {
          w.y = y;
          y += (w.h || 0) + gap;
        }
      }
    }

    setProject(p2, true);
  }

function deleteSelected() {
    if (!project) return;
    if (!selectedWidgetIds.length) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const toDelete = new Set(selectedWidgetIds);
    // If a container is deleted, also delete its descendants.
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of list) {
        if (w.parent_id && toDelete.has(w.parent_id) && !toDelete.has(w.id)) {
          toDelete.add(w.id);
          changed = true;
        }
      }
    }
    const kept = list.filter((w) => !toDelete.has(w.id));
    page.widgets = kept;
    setProject(p2, true);
    setSelectedWidgetIds([]);
  }
  const selectedWidget = selectedWidgetId ? widgets.find((w: any) => w.id === selectedWidgetId) : null;

  function addPage() {
    if (!project) return;
    const p2 = clone(project);
    const pid = uid("page");
    p2.pages = p2.pages || [];
    p2.pages.push({ page_id: pid, name: `Page ${p2.pages.length + 1}`, widgets: [] } as any);
    setProject(p2);
    setCurrentPageIndex(p2.pages.length - 1);
    setSelectedWidgetIds([]);
  }

  async function addWidget() {
    if (!project) return;
    const sr = await getWidgetSchema(newWidgetType);
    if (!sr.ok) return setToast({ type: "error", msg: sr.error });
    const s = sr.schema;

    const props: any = {};
    const style: any = {};
    const events: any = {};
    // Only apply defaults when they are explicitly set and non-null.
    // This avoids generating YAML like `text: null` which ESPHome can reject.
    for (const [k, defAny] of Object.entries(s.props ?? {})) {
      const def = defAny as any;
      if (def.default !== undefined && def.default !== null) props[k] = def.default;
    }
    for (const [k, defAny] of Object.entries(s.style ?? {})) {
      const def = defAny as any;
      if (def.default !== undefined && def.default !== null) style[k] = def.default;
    }
    for (const [k, defAny] of Object.entries(s.events ?? {})) {
      const def = defAny as any;
      if (def.default !== undefined && def.default !== null) events[k] = def.default;
    }

    const w = { id: uid(newWidgetType), type: newWidgetType, x: 10, y: 10, w: 160, h: 60, props, style, events };

    const p2 = clone(project);
    const page = p2.pages?.[safePageIndex];
    if (!page?.widgets) return setToast({ type: "error", msg: "No page to add widget to" });
    page.widgets.push(w);
    setProject(p2);
    setSelectedWidgetIds([w.id]);
    setSelectedSchema(s);
  }

  async function selectWidget(id: string, additive = false) {
    if (!project) return;
    const w = widgets.find((x: any) => x.id === id);
    if (!w) return;
    setSelectedWidgetIds((prev) => {
      if (!additive) return [id];
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
    const sr = await getWidgetSchema(w.type);
    if (sr.ok) setSelectedSchema(sr.schema);
  }

  // v0.19: Editor keyboard shortcuts
  useEffect(() => {
    const isTypingTarget = (t: any) => {
      const tag = String(t?.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || !!t?.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) projectHist.redo();
        else projectHist.undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        projectHist.redo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      // v0.62: Nudge selected widgets with arrow keys.
      // - Arrow: move by grid size
      // - Shift+Arrow: move by 1px
      // - Alt+Arrow: move by 5px
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!selectedWidgetIds.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : (e.altKey ? 5 : ((project as any)?.ui?.gridSize || 10));
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        nudgeSelected(dx, dy, step);
        return;
      }

      // v0.62: Quick align shortcuts (Ctrl+Alt+Arrows)
      if (ctrl && e.altKey) {
        if (e.key === "ArrowLeft") { e.preventDefault(); alignSelected("left"); return; }
        if (e.key === "ArrowRight") { e.preventDefault(); alignSelected("right"); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); alignSelected("top"); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); alignSelected("bottom"); return; }
      }

      if (ctrl && e.key === "]") {
        e.preventDefault();
        moveZ("front");
        return;
      }
      if (ctrl && e.key === "[") {
        e.preventDefault();
        moveZ("back");
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWidgetIds, clipboard, project]);

  // v0.57.2: Live compile preview (Compile tab) — debounced and based on the current in-memory project model.
  // This does not write to disk; it calls the backend compile endpoint with a project override.
  useEffect(() => {
    if (!project || !selectedDevice) return;
    if (editorTab !== "compile") return;
    if (!autoCompile) return;

    const t = window.setTimeout(async () => {
      setCompileBusy(true);
      setCompileErr("");
      try {
        const yaml = await compileYaml(selectedDevice, project as any);
        setCompiledYaml(yaml || "");
      } catch (e: any) {
        setCompileErr(String(e?.message || e));
      } finally {
        setCompileBusy(false);
      }
    }, 500);

    return () => window.clearTimeout(t);
  }, [project, selectedDevice, editorTab, autoCompile]);

  async function refreshCompile() {
    if (!project || !selectedDevice) return;
    setCompileBusy(true);
    setCompileErr("");
    try {
      const yaml = await compileYaml(selectedDevice, project as any);
      setCompiledYaml(yaml || "");
    } catch (e: any) {
      setCompileErr(String(e?.message || e));
    } finally {
      setCompileBusy(false);
    }
  }

  async function previewExport() {
    if (!selectedDevice || !entryId) return;
    setExportBusy(true);
    setExportPreviewErr("");
    try {
      const res: any = await exportDeviceYamlPreview(selectedDevice, entryId);
      if (!res?.ok) throw new Error(res?.error || "preview_failed");
      setExportPreview(res);
    } catch (e: any) {
      setExportPreviewErr(String(e?.message || e));
    } finally {
      setExportBusy(false);
    }
  }

  async function doExport() {
    if (!selectedDevice || !entryId) return;
    setExportBusy(true);
    setExportErr("");
    try {
      const expected = exportPreview?.existing_hash || "";
      const res: any = await exportDeviceYamlWithExpectedHash(selectedDevice, expected, entryId);
      if (!res?.ok) throw new Error(res?.error || "export_failed");
      setExportResult(res);
      // Refresh preview so hashes/diff reflect latest write.
      await previewExport();
    } catch (e: any) {
      setExportErr(String(e?.message || e));
    } finally {
      setExportBusy(false);
    }
  }


  async function runSelfCheck() {
    setSelfCheckBusy(true);
    setSelfCheckErr("");
    setSelfCheckResult(null);
    try {
      const r = await fetch("/api/esphome_touch_designer/self_check", { credentials: "include" });
      if (!r.ok) throw new Error(`self_check failed: ${r.status}`);
      const data = await r.json();
      setSelfCheckResult(data);
    } catch (e: any) {
      setSelfCheckErr(String(e?.message || e));
    } finally {
      setSelfCheckBusy(false);
    }
  }

  function updateField(section: "props"|"style"|"events", key: string, value: any) {
    if (!project || !selectedWidgetId) return;
    const p2 = clone(project);
    const page = p2.pages?.[safePageIndex];
    if (!page?.widgets) return;
    const w = page.widgets.find((x: any) => x.id === selectedWidgetId);
    if (!w) return;
    w[section] = w[section] || {};
    // If the UI clears a field, remove it entirely so the compiler won't emit it.
    if (value === undefined) {
      delete w[section][key];
    } else {
      w[section][key] = value;
    }
    setProject(p2);
  }

  async function saveProject() {
    if (!project || !selectedDevice) return;
    setBusy(true);
    try {
      const res = await putProject(entryId, selectedDevice, project);
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: "Project saved" });
    } finally { setBusy(false); }
  }

  async function deploySelected() {
    if (!selectedDevice) return;
    setBusy(true);
    try {
      const res = await deploy(entryId, selectedDevice);
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: `Deployed: ${res.path}` });
    } finally { setBusy(false); }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>ESPHome Touch Designer</h1>
          <div className="muted">v0.68.0 — Product Mode: recipe metadata + deployment diff viewer + conditional wizard</div>
        </div>
        <div className="pill"><span className="muted">entry_id</span><code>{entryId || "…"}</code></div>
      </header>

      {toast && (
        <div className={toast.type === "ok" ? "toast ok" : "toast error"} onClick={() => setToast(null)}>
          {toast.msg} <span className="muted">(click to dismiss)</span>
        </div>
      )}

      {tmplWizard && (
        <div className="modalOverlay" onClick={() => setTmplWizard(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="title">{wizardIsCard ? "Add Card" : "Add Home Assistant Control"}</div>
                <div className="muted">
                  Template: <code>{tmplWizard.template_id}</code>{wizardTemplate ? <span> • {String((wizardTemplate as any).title || "")}</span> : null}
                </div>
              </div>
              <button className="ghost" onClick={() => setTmplWizard(null)}>✕</button>
            </div>

            <div className="field">
              <div className="fieldLabel">{wizardIsMultiEntity ? "entities" : "entity_id"}</div>
              {!wizardIsMultiEntity ? (
                <>
                  {/* v0.24: datalist is domain-filtered (best-effort) */}
                  <input
                    list="ha_entities"
                    placeholder={`e.g. ${(templateDomain(tmplWizard.template_id) || 'light')}.kitchen`}
                    value={tmplEntity}
                    onChange={(e) => setTmplEntity(e.target.value)}
                  />
                  <datalist id="ha_entities">
                    {entities
                      .filter((e) => {
                        const dom = templateDomain(tmplWizard.template_id);
                        if (!dom) return true;
                        return String(e?.entity_id || "").startsWith(dom + ".");
                      })
                      .slice(0, 500)
                      .map((e) => (
                        <option key={e.entity_id} value={e.entity_id}>
                          {(e.friendly_name || e.entity_id) as any}
                        </option>
                      ))}
                  </datalist>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Tip: start typing to pick from Home Assistant entities (domain-filtered by template).
                  </div>
                </>
              ) : (
                <>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Add up to 4 entities (you can paste/type, or pick from the list).
                  </div>
                  {Array.from({ length: wizardEntitySlots }).map((_, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <input
                        list="ha_entities_any"
                        placeholder={`entity ${i + 1} (e.g. light.kitchen)`}
                        value={tmplEntities[i] || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTmplEntities((prev) => {
                            const p = Array.isArray(prev) ? [...prev] : [];
                            while (p.length < wizardEntitySlots) p.push("");
                            p[i] = v;
                            return p;
                          });
                        }}
                      />
                      <button
                        className="tiny secondary"
                        type="button"
                        onClick={() =>
                          setTmplEntities((prev) => {
                            const p = Array.isArray(prev) ? [...prev] : [];
                            while (p.length < wizardEntitySlots) p.push("");
                            p[i] = "";
                            return p;
                          })
                        }
                      >
                        clear
                      </button>
                    </div>
                  ))}
                  <datalist id="ha_entities_any">
                    {entities.slice(0, 800).map((e) => (
                      <option key={e.entity_id} value={e.entity_id}>
                        {(e.friendly_name || e.entity_id) as any}
                      </option>
                    ))}
                  </datalist>
                </>
              )}

              
              {wizardWantsTapAction && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">tap action</div>
                  <select value={tmplTapAction} onChange={(e) => setTmplTapAction(e.target.value)}>
                    <option value="toggle">toggle</option>
                    <option value="more-info">more-info</option>
                    <option value="call-service">call-service</option>
                  </select>

                  {tmplTapAction === "call-service" && (
                    <div style={{ marginTop: 10 }}>
                      <div className="fieldLabel">service</div>
                      <input
                        placeholder="e.g. script.some_action"
                        value={tmplService}
                        onChange={(e) => setTmplService(e.target.value)}
                      />
                      <div className="muted" style={{ marginTop: 6 }}>
                        Optional: service data YAML (will be merged under data:).
                      </div>
                      <textarea
                        rows={5}
                        placeholder={'brightness_pct: 50\ntransition: 1'}
                        value={tmplServiceData}
                        onChange={(e) => setTmplServiceData(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* v0.68: Conditional card wizard builder */}
              {tmplWizard && tmplWizard.template_id === "conditional_card" && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">condition</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Choose when the card should be shown. This generates a condition expression over <code>x</code> (the entity value).
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={tmplCondNumeric} onChange={(e) => setTmplCondNumeric(e.target.checked)} /> numeric
                    </label>
                    <select value={tmplCondOp} onChange={(e) => setTmplCondOp(e.target.value)}>
                      {!tmplCondNumeric ? (
                        <>
                          <option value="equals">equals</option>
                          <option value="neq">not equals</option>
                          <option value="contains">contains</option>
                        </>
                      ) : (
                        <>
                          <option value="equals">=</option>
                          <option value="neq">≠</option>
                          <option value="gt">&gt;</option>
                          <option value="lt">&lt;</option>
                        </>
                      )}
                    </select>
                    <input
                      placeholder={tmplCondNumeric ? "e.g. 25" : "e.g. on"}
                      value={tmplCondValue}
                      onChange={(e) => setTmplCondValue(e.target.value)}
                      style={{ width: 180 }}
                    />
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    Preview: <code>{(() => {
                      const v = String(tmplCondValue || "").trim() || "…";
                      if (tmplCondNumeric) {
                        const op = tmplCondOp === "gt" ? ">" : tmplCondOp === "lt" ? "<" : tmplCondOp === "neq" ? "!=" : "==";
                        return `atof(x.c_str()) ${op} ${v}`;
                      }
                      const esc = v.replaceAll('"', '\\"');
                      if (tmplCondOp === "contains") return `x.find(\"${esc}\") != std::string::npos`;
                      const op = tmplCondOp === "neq" ? "!=" : "==";
                      return `x ${op} \"${esc}\"`;
                    })()}</code>
                  </div>
                </div>
              )}

              {/* v0.61: Card-specific options */}
              {tmplWizard && tmplWizard.template_id === "thermostat_card" && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">thermostat setpoint range</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label className="muted">min
                      <input type="number" value={tmplThMin} onChange={(e)=>setTmplThMin(Number(e.target.value))} style={{ width: 80, marginLeft: 6 }} />
                    </label>
                    <label className="muted">max
                      <input type="number" value={tmplThMax} onChange={(e)=>setTmplThMax(Number(e.target.value))} style={{ width: 80, marginLeft: 6 }} />
                    </label>
                    <label className="muted">step
                      <input type="number" value={tmplThStep} onChange={(e)=>setTmplThStep(Math.max(0.1, Number(e.target.value)))} style={{ width: 80, marginLeft: 6 }} />
                    </label>
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Tip: if the entity exposes min_temp/max_temp/target_temp_step, we’ll prefill these when capabilities are loaded.
                  </div>
                </div>
              )}

              {tmplWizard && tmplWizard.template_id === "media_control_card" && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">media card sections</div>
                  <label className="muted" style={{ display: "block", marginTop: 6 }}>
                    <input type="checkbox" checked={tmplMediaShowTransport} onChange={(e)=>setTmplMediaShowTransport(e.target.checked)} /> transport controls
                  </label>
                  <label className="muted" style={{ display: "block", marginTop: 6 }}>
                    <input type="checkbox" checked={tmplMediaShowVolume} onChange={(e)=>setTmplMediaShowVolume(e.target.checked)} /> volume slider
                  </label>
                  <label className="muted" style={{ display: "block", marginTop: 6 }}>
                    <input type="checkbox" checked={tmplMediaShowMute} onChange={(e)=>setTmplMediaShowMute(e.target.checked)} /> mute + vol buttons
                  </label>
                  <label className="muted" style={{ display: "block", marginTop: 6 }}>
                    <input type="checkbox" checked={tmplMediaShowSource} onChange={(e)=>setTmplMediaShowSource(e.target.checked)} /> source row (best-effort)
                  </label>
                  {tmplMediaShowSource && (
                    <div style={{ marginTop: 8 }}>
                      <div className="fieldLabel">default source (optional)</div>
                      <input placeholder="e.g. HDMI 1" value={tmplMediaDefaultSource} onChange={(e)=>setTmplMediaDefaultSource(e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              {tmplWizard && tmplWizard.template_id === "cover_card" && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">cover card options</div>
                  <label className="muted" style={{ display: "block", marginTop: 6 }}>
                    <input type="checkbox" checked={tmplCoverShowTilt} onChange={(e)=>setTmplCoverShowTilt(e.target.checked)} /> show tilt controls when available
                  </label>
                </div>
              )}

              {tmplWizard && tmplWizard.template_id.startsWith("glance_card") && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">glance rows</div>
                  <select value={tmplGlanceRows} onChange={(e)=>setTmplGlanceRows(Number(e.target.value) as any)}>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                  </select>
                </div>
              )}

              {tmplWizard && tmplWizard.template_id.startsWith("grid_card_") && (
                <div style={{ marginTop: 12 }}>
                  <div className="fieldLabel">grid size</div>
                  <select value={tmplGridSize} onChange={(e)=>setTmplGridSize(e.target.value as any)}>
                    <option value="2x2">2×2 (4 tiles)</option>
                    <option value="3x2">3×2 (6 tiles)</option>
                    <option value="3x3">3×3 (9 tiles)</option>
                  </select>
                  <div className="muted" style={{ marginTop: 6 }}>Adjust entity slots accordingly after choosing size.</div>
                </div>
              )}

{tmplCaps && (
                <div className="muted" style={{ marginTop: 10 }}>
                  <div><strong>Detected capabilities</strong></div>
                  <div>
                    domain: <code>{tmplCaps.domain}</code> • supported_features: <code>{String(tmplCaps.supported_features ?? "-")}</code>
                  </div>
                  {tmplCaps?.attributes?.supported_color_modes && (
                    <div>
                      supported_color_modes: <code>{String((tmplCaps.attributes.supported_color_modes || []).join(", ") || "-")}</code>
                    </div>
                  )}
                  {tmplCaps?.attributes?.hvac_modes && (
                    <div>
                      hvac_modes: <code>{String((tmplCaps.attributes.hvac_modes || []).join(", ") || "-")}</code>
                    </div>
                  )}

                  {/* v0.50: raw capability dump to help template debugging / parity work */}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer" }}>Raw capabilities</summary>
                    <pre style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>{JSON.stringify(tmplCaps, null, 2)}</pre>
                  </details>
                </div>
              )}

              {templateDomain(tmplWizard.template_id) === "light" && (
                <div style={{ marginTop: 10 }}>
                  <div className="fieldLabel">Variant</div>
                  <select value={tmplVariant} onChange={(e) => setTmplVariant(e.target.value)}>
                    <option value="auto">Auto (recommended)</option>
                    <option value="ha_light_toggle">Toggle only</option>
                    <option value="ha_light_full">Toggle + Brightness</option>
                    <option value="ha_light_ct">Toggle + Brightness + Color Temp</option>
                  </select>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Auto will pick the best match based on supported_color_modes.
                  </div>
                </div>
              )}
            </div>

            <div className="field">
              <div className="fieldLabel">label (optional)</div>
              <input
                placeholder="Override title text"
                value={tmplLabel}
                onChange={(e) => setTmplLabel(e.target.value)}
              />
            </div>

            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button className="ghost" onClick={() => setTmplWizard(null)}>Cancel</button>
              <button onClick={applyTemplateWizard} disabled={!project}>
                {wizardIsCard ? "Insert card" : "Insert control"}
              </button>
            </div>
          </div>
        </div>
      )}


      {recipeImportOpen && (
        <div className="modalOverlay" onClick={() => setRecipeImportOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Import hardware recipe</h3>
            <div className="muted" style={{ marginTop: 4 }}>
              Paste a full ESPHome device YAML. We will normalize it into a hardware-focused recipe and inject the LVGL marker.
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <div className="fieldLabel">label (optional)</div>
              <input value={recipeImportLabel} onChange={(e)=>setRecipeImportLabel(e.target.value)} placeholder="e.g. Sunton 8048S043 800×480" />
            </div>

            <div className="field">
              <div className="fieldLabel">id/slug (optional)</div>
              <input value={recipeImportId} onChange={(e)=>setRecipeImportId(e.target.value)} placeholder="e.g. sunton_8048s043_800x480" />
              <div className="muted" style={{ marginTop: 6 }}>If omitted, we derive a safe id from the label.</div>
            </div>

            <div className="field">
              <div className="fieldLabel">device YAML</div>
              <textarea
                value={recipeImportYaml}
                onChange={(e)=>setRecipeImportYaml(e.target.value)}
                style={{ width: "100%", minHeight: 220, fontFamily: "monospace" }}
                placeholder="Paste YAML here…"
              />
            </div>

            {recipeImportErr && <div className="error" style={{ marginTop: 10 }}>{recipeImportErr}</div>}
            {recipeImportOk && (
              <div className="ok" style={{ marginTop: 10 }}>
                Imported as <code>{recipeImportOk.id}</code>
              </div>
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="ghost" onClick={() => setRecipeImportOpen(false)}>Close</button>
              <button disabled={recipeImportBusy || !recipeImportYaml.trim()} onClick={doImportRecipe}>
                {recipeImportBusy ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {recipeMgrOpen && (
        <div className="modalOverlay" onClick={() => setRecipeMgrOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Recipe Manager</h3>
            <div className="muted" style={{ marginTop: 4 }}>
              Rename or delete your custom hardware recipes. Built-in recipes cannot be edited.
            </div>

            {recipeMgrErr && <div className="error" style={{ marginTop: 10 }}>{recipeMgrErr}</div>}

            <div style={{ marginTop: 12, maxHeight: 420, overflow: "auto", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "10px 12px" }}>Label</th>
                    <th style={{ padding: "10px 12px" }}>ID</th>
                    <th style={{ padding: "10px 12px" }}>Stored at</th>
                    <th style={{ padding: "10px 12px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  
                  {recipes.map((r) => {
                    const val = recipeMgrEdits[r.id] ?? r.label ?? r.id;
                    const canEdit = !r.builtin;
                    return (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          {canEdit ? (
                            <input
                              value={val}
                              onChange={(e) => setRecipeMgrEdits((m) => ({ ...m, [r.id]: e.target.value }))}
                              style={{ width: "100%" }}
                            />
                          ) : (
                            <div>{r.label || r.id}</div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}><code>{r.id}</code></td>
                        <td style={{ padding: "10px 12px" }}>
                          <code style={{ fontSize: 12 }}>{r.path || ""}</code>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <button
                            className="secondary"
                            disabled={recipeMgrBusy}
                            title="Download recipe.yaml + metadata as JSON"
                            onClick={async () => {
                              setRecipeMgrBusy(true);
                              setRecipeMgrErr("");
                              try {
                                const data = await exportRecipe(r.id);
                                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${r.id}.recipe.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                                setToast({ type: 'ok', msg: `Exported: ${r.id}` });
                              } catch (e: any) {
                                setRecipeMgrErr(String(e?.message || e));
                              } finally {
                                setRecipeMgrBusy(false);
                              }
                            }}
                          >Export</button>

                          <button
                            className="secondary"
                            style={{ marginLeft: 8 }}
                            disabled={recipeMgrBusy}
                            title="Clone this recipe into a custom (user) recipe so you can edit it"
                            onClick={async () => {
                              const newLabel = prompt('New recipe label (optional):', r.label || r.id) || '';
                              const newId = prompt('New recipe id/slug (optional):', '') || '';
                              setRecipeMgrBusy(true);
                              setRecipeMgrErr('');
                              try {
                                await cloneRecipe(r.id, newLabel || undefined, newId || undefined);
                                await refreshRecipes();
                                setToast({ type: 'ok', msg: `Cloned: ${r.id}` });
                              } catch (e: any) {
                                setRecipeMgrErr(String(e?.message || e));
                              } finally {
                                setRecipeMgrBusy(false);
                              }
                            }}
                          >Duplicate</button>

                          {canEdit && (
                            <>
                              <button
                                className="secondary"
                                style={{ marginLeft: 8 }}
                                disabled={recipeMgrBusy || val.trim() === (r.label || "").trim()}
                                onClick={async () => {
                                  setRecipeMgrBusy(true);
                                  setRecipeMgrErr("");
                                  try {
                                    await updateRecipeLabel(r.id, val);
                                    await refreshRecipes();
                                    setToast({ type: "ok", msg: `Updated label: ${r.id}` });
                                  } catch (e: any) {
                                    setRecipeMgrErr(String(e?.message || e));
                                  } finally {
                                    setRecipeMgrBusy(false);
                                  }
                                }}
                              >Save</button>
                              <button
                                className="danger"
                                style={{ marginLeft: 8 }}
                                disabled={recipeMgrBusy}
                                onClick={async () => {
                                  if (!confirm(`Delete recipe "${r.label}"? This cannot be undone.`)) return;
                                  setRecipeMgrBusy(true);
                                  setRecipeMgrErr("");
                                  try {
                                    await deleteRecipe(r.id);
                                    await refreshRecipes();
                                    setToast({ type: "ok", msg: `Deleted recipe: ${r.id}` });
                                  } catch (e: any) {
                                    setRecipeMgrErr(String(e?.message || e));
                                  } finally {
                                    setRecipeMgrBusy(false);
                                  }
                                }}
                              >Delete</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {recipes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted" style={{ padding: "12px" }}>
                        No recipes discovered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ justifyContent: "space-between", gap: 8, marginTop: 12 }}>
              <button className="secondary" onClick={refreshRecipes} disabled={recipeMgrBusy}>Refresh</button>
              <button className="ghost" onClick={() => setRecipeMgrOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {newDeviceWizardOpen && (
        <div className="modalOverlay">
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <div className="title">New device</div>
                <div className="muted">
                  {newDeviceWizardStep === 1 ? "Step 1: Choose a hardware profile" : "Step 2: Device details"}
                </div>
              </div>
              <button className="ghost" onClick={() => setNewDeviceWizardOpen(false)}>✕</button>
            </div>
            {newDeviceWizardStep === 1 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  Select the hardware recipe for this device. The canvas size will match the recipe resolution.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                  {recipes.map((r: any) => (
                    <button
                      key={r.id}
                      type="button"
                      className={newDeviceWizardRecipe?.id === r.id ? "" : "secondary"}
                      style={{ textAlign: "left", padding: 12 }}
                      onClick={() => wizardSelectRecipe({ id: r.id, label: String(r.label || r.id) })}
                    >
                      <div className="title" style={{ fontSize: 14 }}>{r.label || r.id}</div>
                      <div className="muted" style={{ fontSize: 12 }}><code>{r.id}</code></div>
                    </button>
                  ))}
                </div>
                {recipes.length === 0 && (
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="muted">No recipes found. The integration ships with built-in recipes — if none appear, try Refresh or check the Home Assistant logs.</div>
                    <button className="secondary" onClick={refreshRecipes}>Refresh</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  Profile: <strong>{newDeviceWizardRecipe?.label}</strong>
                </div>
                <label className="label">Friendly name</label>
                <input
                  value={newDeviceWizardName}
                  onChange={(e) => {
                    const name = e.target.value;
                    setNewDeviceWizardName(name);
                    const derived = friendlyToId(name);
                    setNewDeviceWizardId(derived);
                    setNewDeviceWizardSlug(derived);
                  }}
                  placeholder="e.g. Living Room Display"
                />
                <label className="label">device_id</label>
                <input value={newDeviceWizardId} onChange={(e) => { setNewDeviceWizardId(e.target.value); setNewDeviceWizardSlug(e.target.value); }} placeholder="Derived from name" />
                <label className="label">Filename</label>
                <input value={newDeviceWizardSlug} onChange={(e) => setNewDeviceWizardSlug(e.target.value)} placeholder="Defaults to device_id, used for .yaml file" />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    className="secondary"
                    onClick={() => { setNewDeviceWizardStep(1); setNewDeviceWizardRecipe(null); }}
                  >
                    Back
                  </button>
                  <button
                    disabled={busy || !newDeviceWizardName.trim()}
                    onClick={createNewDeviceFromWizard}
                  >
                    Create device
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="grid">
        <section className="card">
          <h2>Create / Update Device</h2>
          <label className="label">Friendly name</label>
          <input
            value={newDeviceName}
            onChange={(e) => {
              const name = e.target.value;
              setNewDeviceName(name);
              const derived = friendlyToId(name);
              setNewDeviceId(derived);
              setNewDeviceSlug(derived);
            }}
            placeholder="e.g. Living Room Display"
          />
          <label className="label">device_id</label>
          <input value={newDeviceId} onChange={(e) => { setNewDeviceId(e.target.value); setNewDeviceSlug(e.target.value); }} placeholder="Derived from name" />
          <label className="label">Filename</label>
          <input value={newDeviceSlug} onChange={(e) => setNewDeviceSlug(e.target.value)} placeholder="Defaults to device_id, used for .yaml file" />
          <button disabled={busy || !entryId || !newDeviceName.trim()} onClick={addDevice} title={!entryId ? "Waiting for integration context. Reload the page or check HA logs." : !newDeviceName.trim() ? "Enter a friendly name" : ""}>Save device</button>
          {!entryId && <div className="muted" style={{ marginTop: 6 }}>Integration not ready — reload the page or check Settings → Devices & Services.</div>}
        
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div className="muted">Canvas</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span className="muted" style={{ marginRight: 4 }}>Align:</span>
                    <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("left")}>Left</button>
                    <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("center")}>Center</button>
                    <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("right")}>Right</button>
                    <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("top")}>Top</button>
                    <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("middle")}>Middle</button>
                    <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("bottom")}>Bottom</button>
                    <span className="muted" style={{ margin: "0 4px" }}>Distribute:</span>
                    <button className="secondary" disabled={selectedWidgetIds.length < 3} onClick={() => distributeSelected("h")}>H</button>
                    <button className="secondary" disabled={selectedWidgetIds.length < 3} onClick={() => distributeSelected("v")}>V</button>
                  </div>
                </div>
                <Canvas
                  widgets={widgets}
                  selectedIds={selectedWidgetIds}
                  width={(project as any)?.device?.screen?.width || 800}
                  height={(project as any)?.device?.screen?.height || 480}
                  gridSize={(project as any)?.ui?.gridSize || 10}
                  showGrid={((project as any)?.ui?.showGrid ?? true) as any}
                  onSelect={(id, additive) => selectWidget(id, additive)}
                  onSelectNone={() => setSelectedWidgetIds([])}
                  onDropCreate={(type, x, y) => {
                    if (!project) return;
                    const p2 = clone(project);
                    // v0.21: allow dropping either a raw widget type OR a control template (tmpl:<id>)
                    if (String(type).startsWith("tmpl:")) {
                      const tid = String(type).slice(5);
                      // v0.22: open a post-drop wizard so we can capture entity_id/label.
                      openTemplateWizard(tid, x, y);
                      return;
                    }

                    const id = uid(type);
                    const w = {
                      id,
                      type,
                      x,
                      y,
                      w: 120,
                      h: 48,
                      props: {},
                      style: {},
                      events: {},
                    };
                    const pg = p2.pages?.[safePageIndex];
                    if (!pg?.widgets) return;
                    pg.widgets.push(w as any);
                    setProject(p2, true);
                    setSelectedWidgetIds([id]);
                  }}
                  onChangeMany={(patches, commit) => {
                    if (!project) return;
                    const p2 = clone(project);
                    const pg = (p2 as any).pages?.[safePageIndex];
                    if (!pg?.widgets) return;
                    for (const { id, patch } of patches) {
                      const w = pg.widgets.find((x: any) => x.id === id);
                      if (!w) continue;
                      Object.assign(w, patch);
                    }
                    setProject(p2, commit ?? true);
                  }}
                />
              </div>

        </section>

        <section className="card">
          <h2 style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            Devices
            <button className="secondary" disabled={busy || !entryId} onClick={openNewDeviceWizard} title="Create a new device with a hardware profile">New device</button>
          </h2>
          <ul className="list">
            {devices.map((d) => (
              <li key={d.device_id} className={d.device_id === selectedDevice ? "row selected" : "row"}>
                <div className="grow clickable" onClick={() => loadDevice(d.device_id)}>
                  <div className="title">{d.name}</div>
                  <div className="muted"><code>{d.device_id}</code> → <code>{(d.slug || d.device_id)}.yaml</code></div>
                </div>
                <button className="danger" disabled={busy} onClick={() => removeDevice(d.device_id)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <h2>Editor</h2>
          <div className="bar" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className={editorTab === "design" ? "" : "secondary"}
                onClick={() => setEditorTab("design")}
                title="Designer tools"
              >
                Design
              </button>
              <button
                className={editorTab === "compile" ? "" : "secondary"}
                onClick={() => { setEditorTab("compile"); }}
                title="Live compiled YAML preview"
              >
                Compile
              </button>
              <span className="muted" style={{ marginLeft: 8 }}>
                {editorTab === "compile" ? "Live preview updates as you edit." : ""}
              </span>
            </div>

            {editorTab === "compile" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} />
                  auto
                </label>
                <button className="secondary" disabled={compileBusy || !project} onClick={refreshCompile}>
                  {compileBusy ? "Compiling…" : "Refresh"}
                </button>
                <button
                  className="secondary"
                  disabled={!compiledYaml}
                  onClick={() => navigator.clipboard.writeText(compiledYaml)}
                  title="Copy YAML to clipboard"
                >
                  Copy
                </button>
                <button
                  className="secondary"
                  onClick={() => { setRecipeImportOpen(true); setRecipeImportErr(""); setRecipeImportOk(null); }}
                  title="Import a raw ESPHome device YAML and convert it into a hardware recipe"
                >
                  Import recipe…
                </button>
                <button
                  className="secondary"
                  onClick={() => { setRecipeMgrOpen(true); setRecipeMgrErr(""); }}
                  title="Manage user hardware recipes (rename / delete)"
                >
                  Manage recipes…
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, maxHeight: "70vh", overflowY: "auto", marginTop: 8 }}>
          {!selectedDevice || !project ? (
            <div className="muted" style={{ marginTop: 12 }}>
              Select a device to edit: click <strong>New device</strong> (recommended) to create with a hardware profile, or use the form above for devices without a recipe. Use the <strong>Design</strong> tab to see palettes and drag widgets onto the canvas.
            </div>
          ) : (
            <>
              {editorTab === "compile" ? (
                <>
                <div className="section">
                  <div className="sectionTitle">Hardware (recipe)</div>
                  <div className="muted">
                    Select a hardware recipe for this device. The recipe defines the ESPHome hardware scaffold; the designer only owns the LVGL block.
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <select
                      value={selectedRecipeId || ""}
                      onChange={async (e) => {
                        if (!selectedDeviceObj) return;
                        const rid = e.target.value || null;
                        setBusy(true);
                        try {
                          const res = await upsertDevice(entryId, {
                            device_id: selectedDeviceObj.device_id,
                            name: selectedDeviceObj.name,
                            slug: selectedDeviceObj.slug,
                            hardware_recipe_id: rid,
                          });
                          if (!res.ok) throw new Error(res.error);
                          await refresh();
                          setToast({ type: "ok", msg: rid ? `Recipe set: ${rid}` : "Recipe cleared" });
                        } catch (err: any) {
                          setToast({ type: "error", msg: String(err?.message || err) });
                        } finally {
                          setBusy(false);
                        }
                      }}
                      title="Hardware recipe"
                    >
                      <option value="">(none)</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label || r.id}
                        </option>
                      ))}
                    </select>
                    {recipeValidateBusy && <span className="muted">validating…</span>}
                    {recipeValidateRes?.ok && <span className="toast ok" style={{ padding: "6px 10px" }}>valid</span>}
                    {recipeValidateRes && !recipeValidateRes.ok && <span className="toast error" style={{ padding: "6px 10px" }}>needs attention</span>}
                  </div>

                  {recipeValidateErr && (
                    <div className="toast error" style={{ marginTop: 8 }}>
                      Recipe check error: {recipeValidateErr}
                    </div>
                  )}

                  {selectedRecipeId && (
                    <div style={{ marginTop: 10 }}>
                      {/* Metadata panel */}
                      {recipeValidateRes?.meta && (
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {recipeValidateRes.meta?.platform && (
                            <div className="pill"><span className="muted">platform</span> <code>{recipeValidateRes.meta.platform}</code></div>
                          )}
                          {recipeValidateRes.meta?.board && (
                            <div className="pill"><span className="muted">board</span> <code>{recipeValidateRes.meta.board}</code></div>
                          )}
                          {recipeValidateRes.meta?.resolution?.width && recipeValidateRes.meta?.resolution?.height && (
                            <div className="pill"><span className="muted">resolution</span> <code>{recipeValidateRes.meta.resolution.width}×{recipeValidateRes.meta.resolution.height}</code></div>
                          )}
                          {recipeValidateRes.meta?.touch?.platform && (
                            <div className="pill"><span className="muted">touch</span> <code>{recipeValidateRes.meta.touch.platform}</code></div>
                          )}
                          {recipeValidateRes.meta?.backlight_pin && (
                            <div className="pill"><span className="muted">backlight</span> <code>{String(recipeValidateRes.meta.backlight_pin)}</code></div>
                          )}
                          {typeof recipeValidateRes.meta?.psram === "boolean" && (
                            <div className="pill"><span className="muted">psram</span> <code>{recipeValidateRes.meta.psram ? "yes" : "no"}</code></div>
                          )}
                        </div>
                      )}

                      {/* Validation issues */}
                      {Array.isArray(recipeValidateRes?.issues) && recipeValidateRes.issues.length > 0 && (
                        <div className="toast error" style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Recipe warnings</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {recipeValidateRes.issues.map((it: string, idx: number) => (
                              <li key={idx}>{it}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="sectionTitle">Compiled YAML (live preview)</div>
                  <div className="muted">
                    This is the YAML generated from your current project model. It updates as you edit (when auto is enabled).
                  </div>
                  {compileErr && (
                    <div className="toast error" style={{ marginTop: 8 }}>
                      Compile error: {compileErr}
                    </div>
                  )}
                  <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
{compiledYaml || (compileBusy ? "Compiling…" : "No YAML yet.")}
                  </pre>
                </div>
                <div className="section" style={{ marginTop: 16 }}>
                  <div className="sectionTitle">Self-check (verification suite)</div>
                  <div className="muted">
                    Runs quick sanity checks (compile determinism, marker safety, and basic invariants). This does not deploy anything.
                  </div>
                  {selfCheckErr && (
                    <div className="toast error" style={{ marginTop: 8 }}>
                      Self-check error: {selfCheckErr}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <button className="secondary" disabled={selfCheckBusy} onClick={runSelfCheck}>
                      {selfCheckBusy ? "Running…" : "Run self-check"}
                    </button>
                    {selfCheckResult?.ok ? (
                      <span className="toast ok" style={{ padding: "6px 10px" }}>PASS</span>
                    ) : selfCheckResult && (
                      <span className="toast error" style={{ padding: "6px 10px" }}>FAIL</span>
                    )}
                  </div>
                  {selfCheckResult && (
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
{JSON.stringify(selfCheckResult, null, 2)}
                    </pre>
                  )}

                <div className="section" style={{ marginTop: 16 }}>
                  <div className="sectionTitle">Deployment (export)</div>
                  <div className="muted">
                    Preview a safe-merge export (with diff) and then write to <code>/config/esphome/{selectedDevice ? devices.find(d=>d.device_id===selectedDevice)?.slug : "device"}.yaml</code>.
                  </div>

                  {exportPreviewErr && (
                    <div className="toast error" style={{ marginTop: 8 }}>
                      Preview error: {exportPreviewErr}
                    </div>
                  )}
                  {exportErr && (
                    <div className="toast error" style={{ marginTop: 8 }}>
                      Export error: {exportErr}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <button className="secondary" disabled={exportBusy || !entryId || !selectedDevice} onClick={previewExport} title={!entryId ? "Integration context missing" : !selectedDevice ? "Select a device" : ""}>
                      {exportBusy ? "Working…" : "Preview export"}
                    </button>
                    <button className="" disabled={exportBusy || !entryId || !exportPreview || exportPreview?.error || exportPreview?.externally_modified} onClick={doExport} title={exportPreview?.externally_modified ? "File changed externally — re-run preview then export" : !entryId ? "Integration context missing" : ""}>
                      Export to /config/esphome/
                    </button>
                    <button className="secondary" onClick={() => window.open("/esphome", "_blank")} title="Opens the ESPHome dashboard panel (if installed at /esphome)">
                      Open ESPHome Dashboard
                    </button>

                    {exportPreview?.ok && (
                      <>
                        <span className="toast ok" style={{ padding: "6px 10px" }}>
                          {exportPreview.mode === "merged" ? "merge" : "new"}
                        </span>
                        {exportPreview.externally_modified && (
                          <span className="toast error" style={{ padding: "6px 10px" }}>
                            External change detected — preview again
                          </span>
                        )}
                      </>
                    )}
                    {exportResult?.ok && (
                      <span className="toast ok" style={{ padding: "6px 10px" }}>
                        Exported ({exportResult.mode})
                      </span>
                    )}
                  </div>

                  {exportPreview?.ok && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          className="secondary"
                          disabled={!exportPreview?.diff}
                          onClick={() => navigator.clipboard.writeText(exportPreview.diff || "")}
                          title="Copy unified diff"
                        >
                          Copy diff
                        </button>
                        <span className="muted">
                          {(() => {
                            const d = String(exportPreview.diff || "");
                            const adds = d.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
                            const dels = d.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
                            return `+${adds.length} / -${dels.length} lines`;
                          })()}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          padding: 12,
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          overflowX: "auto",
                          fontFamily: "monospace",
                          fontSize: 12,
                          lineHeight: 1.45,
                        }}
                      >
                        {(exportPreview.diff || "(no diff)").split("\n").map((line: string, idx: number) => {
                          const isAdd = line.startsWith("+") && !line.startsWith("+++");
                          const isDel = line.startsWith("-") && !line.startsWith("---");
                          const isHdr = line.startsWith("@@") || line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");
                          return (
                            <div
                              key={idx}
                              style={{
                                whiteSpace: "pre",
                                opacity: isHdr ? 0.9 : 1,
                                background: isAdd
                                  ? "rgba(0,255,0,0.08)"
                                  : isDel
                                  ? "rgba(255,0,0,0.08)"
                                  : "transparent",
                                borderLeft: isAdd
                                  ? "3px solid rgba(0,255,0,0.35)"
                                  : isDel
                                  ? "3px solid rgba(255,0,0,0.35)"
                                  : isHdr
                                  ? "3px solid rgba(255,255,255,0.15)"
                                  : "3px solid transparent",
                                paddingLeft: 8,
                              }}
                            >
                              {line}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                </div>

                </>
              ) : (
                <>
              <div className="bar" style={{ flexShrink: 0 }}>
                <select
                  value={safePageIndex}
                  onChange={(e) => {
                    setCurrentPageIndex(Number(e.target.value));
                    setSelectedWidgetIds([]);
                    setSelectedSchema(null);
                  }}
                  title="Page"
                >
                  {pages.map((p, idx) => (
                    <option key={p.page_id} value={idx}>
                      {p.name || `Page ${idx + 1}`}
                    </option>
                  ))}
                </select>
                <button className="secondary" disabled={busy || !project} onClick={addPage}>Add page</button>
                <button className="secondary" disabled={!projectHist.canUndo} onClick={projectHist.undo} title="Undo (Ctrl/Cmd+Z)">Undo</button>
                <button className="secondary" disabled={!projectHist.canRedo} onClick={projectHist.redo} title="Redo (Ctrl/Cmd+Y)">Redo</button>
                <select value={newWidgetType} onChange={(e) => setNewWidgetType(e.target.value)}>
                  {(schemaIndex ?? []).filter(Boolean).map((s) => <option key={s?.type ?? ""} value={s?.type ?? ""}>{s?.title ?? s?.type ?? ""}</option>)}
                </select>
                <button className="secondary" disabled={busy} onClick={addWidget}>Add widget</button>
                <button className="secondary" disabled={!selectedWidgetIds.length} onClick={copySelected} title="Copy (Ctrl/Cmd+C)">Copy</button>
                <button className="secondary" disabled={!clipboard?.length} onClick={pasteClipboard} title="Paste (Ctrl/Cmd+V)">Paste</button>
                <button className="secondary" disabled={!selectedWidgetIds.length} onClick={deleteSelected} title="Delete">Del</button>
                <button className="secondary" disabled={!selectedWidgetIds.length} onClick={() => moveZ("back")} title="Send backward">◀</button>
                <button className="secondary" disabled={!selectedWidgetIds.length} onClick={() => moveZ("front")} title="Bring forward">▶</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={groupSelected} title="Group into a container">Group</button>
                <button className="secondary" disabled={selectedWidgetIds.length !== 1 || String(_findWidget(selectedWidgetIds[0])?.type).toLowerCase() !== "container"} onClick={ungroupSelected} title="Ungroup container">Ungroup</button>
                <button className="secondary" disabled={busy} onClick={saveProject}>Save project</button>
                <button className="secondary" disabled={busy} onClick={deploySelected}>Deploy</button>
                <button className="secondary" disabled={!project} onClick={() => setLintOpen(!lintOpen)} title="Show project lint warnings">
                  Lint
                </button>
              </div>

              {lintOpen && (
                <div className="section" style={{ marginTop: 12 }}>
                  <div className="sectionTitle">Project lint (advisory)</div>
                  {(() => {
                    const diags = lintProject(project);
                    if (diags.length === 0) return <div className="muted">No issues found.</div>;
                    return (
                      <ul>
                        {diags.slice(0, 50).map((d, i) => (
                          <li key={i}>
                            <b>{d.level.toUpperCase()}</b>: {d.msg}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                  <div className="muted" style={{ marginTop: 8 }}>
                    Note: lint is best-effort. It doesn’t block saving/compiling.
                  </div>
                </div>
              )}

              
<div className="section" style={{ marginTop: 12 }}>
  <div className="sectionTitle">Palette (drag onto canvas)</div>
  <div className="palette">
    {(schemaIndex ?? []).filter(Boolean).map((s) => (
      <div
        key={s?.type ?? ""}
        className="paletteItem"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-esphome-widget-type", s?.type ?? "");
          e.dataTransfer.effectAllowed = "copy";
        }}
        title={`Drag ${s?.title ?? s?.type ?? ""} onto the canvas`}
      >
        {s?.title ?? s?.type ?? ""}
      </div>
    ))}
  </div>
  <div className="muted" style={{ marginTop: 8 }}>
    Tip: hold <code>ALT</code> while dragging existing widgets to disable grid snapping.
  </div>
</div>

<div className="section" style={{ marginTop: 12 }}>
  <div className="sectionTitle">Controls (drag onto canvas)</div>
  <div className="muted" style={{ marginBottom: 8 }}>
    These are multi-widget macros (button+slider+labels, etc.). After dropping, set entity IDs in the bindings section.
  </div>

  <div className="palette">
    {(() => {
      const all = [...CONTROL_TEMPLATES, ...(pluginControls || [])].filter((t): t is ControlTemplate => !!t && !!(t as any).id);
      const cards = all.filter((t) => String((t as any).title ?? "").startsWith("Card Library"));
      const ha = all.filter((t) => (t as any).id === "ha_auto" || String((t as any).id ?? "").startsWith("ha_"));
      const other = all.filter((t) => !cards.includes(t) && !ha.includes(t));

      return (
        <>
          {cards.length > 0 && <div className="paletteSectionTitle">Card Library</div>}
          {cards.map((t) => (
            <div
              key={t.id}
              className="paletteItem"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-esphome-control-template", t.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title={t.description ?? ""}
            >
              {t.title ?? t.id}
              {(pluginControls ?? []).some((p) => p && p.id === t.id) ? " (plugin)" : ""}
            </div>
          ))}

          <div className="paletteSectionTitle">Home Assistant Controls</div>
          {ha.map((t) => (
            <div
              key={t.id}
              className="paletteItem"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-esphome-control-template", t.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title={t.description ?? ""}
            >
              {t.title ?? t.id}
              {(pluginControls ?? []).some((p) => p && p.id === t.id) ? " (plugin)" : ""}
            </div>
          ))}

          {other.length > 0 && <div className="paletteSectionTitle">Other</div>}
          {other.map((t) => (
            <div
              key={t.id}
              className="paletteItem"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-esphome-control-template", t.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title={t.description ?? ""}
            >
              {t.title ?? t.id}
              {(pluginControls ?? []).some((p) => p && p.id === t.id) ? " (plugin)" : ""}
            </div>
          ))}
        </>
      );
    })()}
  </div>
</div>


<div className="split">
                <div>
                  <div className="muted">Widgets</div>
                  <ul className="list compact">
                    {widgets.map((w: any) => (
                      <li key={w.id} className={w.id === selectedWidgetId ? "row selected" : "row"}>
                        <div className="grow clickable" onClick={() => selectWidget(w.id)}>
                          <div className="title">{w.type}</div>
                          <div className="muted"><code>{w.id}</code></div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="muted">Properties</div>
                  {!selectedWidget || !selectedSchema ? (
                    <div className="muted">Select a widget to edit its properties.</div>
                  ) : (
                    <Inspector widget={selectedWidget} schema={selectedSchema} onChange={updateField} assets={assets} />
                  )}
                </div>
              </div>
            


<div className="section" style={{ marginTop: 12 }}>
  <div className="sectionTitle">Home Assistant Bindings</div>
  <div className="muted">Generates ESPHome homeassistant sensors so controls can reflect HA state.</div>
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <select
      value={(window as any).__bindDomain || ""}
      onChange={(e)=>{ (window as any).__bindDomain = e.target.value; setProject(JSON.parse(JSON.stringify(project))); }}
    >
      <option value="">(domain)</option>
      {DOMAIN_PRESETS.map((d)=> <option key={d.domain} value={d.domain}>{d.title}</option>)}
    </select>
    <input
      placeholder="entity_id (e.g. light.kitchen)"
      value={(window as any).__bindEntity || ""}
      onChange={(e)=>{ (window as any).__bindEntity = e.target.value; setProject(JSON.parse(JSON.stringify(project))); }}
    />
    <button
      onClick={() => {
        if (!project) return;
        const domain = (window as any).__bindDomain || "";
        const entity_id = (window as any).__bindEntity || "";
        const preset = DOMAIN_PRESETS.find((x)=>x.domain===domain);
        if (!preset || !entity_id) return;
        const p2 = JSON.parse(JSON.stringify(project));
        (p2 as any).bindings = (p2 as any).bindings || [];
        for (const b of preset.recommended) {
          (p2 as any).bindings.push({ ...b, entity_id });
        }
        setProject(p2);
      }}
    >Add recommended</button>
  </div>
  <div style={{ marginTop: 8 }} className="muted">
    Current bindings: {(project as any)?.bindings?.length || 0}
                </div>
                <div style={{ marginTop: 4 }} className="muted">
                  Current links: {(project as any)?.links?.length || 0}
  </div>
</div>


<div className="section" style={{ marginTop: 12 }}>
  <div className="sectionTitle">Binding Builder</div>
  <div className="muted">
    Bind the currently selected widget to a Home Assistant entity attribute/state and generate bindings + live links automatically.
  </div>
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
    <input
      placeholder="search entities..."
      value={entityQuery}
      onChange={(e)=>setEntityQuery(e.target.value)}
      style={{ width: 220 }}
    />
    <select value={bindEntity} onChange={(e)=>{ setBindEntity(e.target.value); setBindAttr(''); }}>
      <option value="">(select entity)</option>
      {entities
        .filter((e)=> !entityQuery || String(e.entity_id).includes(entityQuery) || String(e.friendly_name||'').toLowerCase().includes(entityQuery.toLowerCase()))
        .slice(0, 250)
        .map((e)=> (
          <option key={e.entity_id} value={e.entity_id}>
            {e.entity_id}{e.friendly_name ? ` — ${e.friendly_name}` : ""}
          </option>
        ))}
    </select>
    <select value={bindAttr} onChange={(e)=>setBindAttr(e.target.value)}>
      <option value="">(state)</option>
      {((e)=>e?.attributes ? Object.keys(e.attributes) : [])(entities.find((x)=>x.entity_id===bindEntity))
        .sort()
        .slice(0, 200)
        .map((k)=> <option key={k} value={k}>{k}</option>)}
    </select>
    <select value={bindAction} onChange={(e)=>setBindAction(e.target.value)}>
      <option value="label_text">label: text</option>
      <option value="slider_value">slider: value</option>
      <option value="arc_value">arc: value</option>
      <option value="widget_checked">widget: checked</option>
    </select>
    <input
      placeholder="format (numeric)"
      value={bindFormat}
      onChange={(e)=>setBindFormat(e.target.value)}
      style={{ width: 120 }}
    />
    <input
      type="number"
      value={bindScale}
      onChange={(e)=>setBindScale(Number(e.target.value || 1))}
      step="0.1"
      style={{ width: 100 }}
    />
    <button
      disabled={!project || !selectedWidgetIds.length || !bindEntity}
      onClick={() => {
        if (!project) return;
        const widget_id = selectedWidgetIds[0]; // first pass: bind primary selection
        const ent = bindEntity;
        const attr = bindAttr;
        const p2 = clone(project);
        (p2 as any).bindings = (p2 as any).bindings || [];
        (p2 as any).links = (p2 as any).links || [];
        // Determine binding kind
        let kind: any = "state";
        if (bindAction === "widget_checked") kind = "binary";
        else if (attr) kind = "attribute_number"; // default numeric when attribute chosen; user can adjust later
        // If attribute exists and looks non-numeric, treat as text
        const v = entities.find((x)=>x.entity_id===ent)?.attributes?.[attr];
        if (attr && (typeof v === "string" || Array.isArray(v) || (v && typeof v === "object"))) kind = "attribute_text";
        if (!attr && (bindAction === "label_text")) kind = "state";
        // Add binding
        (p2 as any).bindings.push({ entity_id: ent, kind, attribute: attr || undefined });
        // Add link
        (p2 as any).links.push({
          source: { entity_id: ent, kind, attribute: attr || "" },
          target: { widget_id, action: bindAction, format: bindFormat, scale: bindScale }
        });
        setProject(p2, true);
      }}
    >
      Bind selected widget
    </button>
  </div>
  <div className="muted" style={{ marginTop: 8 }}>
    Note: This is a first-pass binder. Next iteration will add per-widget property menus and type-safe bind kinds.
  </div>
</div>

<div className="section" style={{ marginTop: 12 }}>
  <div className="sectionTitle">Advanced YAML Injection</div>
  <div className="muted">Optional raw YAML injected into the compiled file. Use with care.</div>
  <div className="field">
    <div className="fieldLabel">yaml_pre (prepended or replaces #__USER_YAML_PRE__ marker)</div>
    <textarea
      rows={6}
      value={String((project as any)?.advanced?.yaml_pre ?? "")}
      onChange={(e) => {
        if (!project) return;
        const p2 = JSON.parse(JSON.stringify(project));
        (p2 as any).advanced = (p2 as any).advanced || {};
        (p2 as any).advanced.yaml_pre = e.target.value;
        setProject(p2);
      }}
    />
  </div>
  <div className="field">
    <div className="fieldLabel">yaml_post (appended or replaces #__USER_YAML_POST__ marker)</div>
    <textarea
      rows={6}
      value={String((project as any)?.advanced?.yaml_post ?? "")}
      onChange={(e) => {
        if (!project) return;
        const p2 = JSON.parse(JSON.stringify(project));
        (p2 as any).advanced = (p2 as any).advanced || {};
        (p2 as any).advanced.yaml_post = e.target.value;
        setProject(p2);
      }}
    />
  </div>
</div>
                </>
              )}

            </>
          )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Inspector(props: { widget: any; schema: WidgetSchema; onChange: (section: any, key: string, value: any) => void; assets: {name:string; size:number}[] }) {
  const { widget, schema, onChange, assets } = props;
  const fontFiles = (assets || []).map(a=>a.name).filter(n=>/\.(ttf|otf)$/i.test(n));
  const fontSizes = [10,12,14,16,18,20,24,28,32,36,40];

  const [fieldFilter, setFieldFilter] = useState<string>("");
  const [modifiedOnly, setModifiedOnly] = useState<boolean>(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);


  const renderSection = (title: string, section: "props"|"style"|"events", fields?: Record<string, any>) => {
    const entriesAll = Object.entries(fields ?? {});
    const entries = entriesAll.filter(([k, def]: any) => {
      const title = String(def?.title ?? k).toLowerCase();
      const keyLc = String(k).toLowerCase();
      const q = fieldFilter.trim().toLowerCase();
      const matches = !q || title.includes(q) || keyLc.includes(q);
      const hasValue = Object.prototype.hasOwnProperty.call((widget[section] || {}), k);
      const modOk = !modifiedOnly || hasValue;
      return matches && modOk;
    });
    if (!entries.length) return null;
    return (
      <div className="section">
        <div className="sectionTitle" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>{title}<button type="button" className="tiny secondary" title="Clear all modified values in this section" onClick={() => {
  if (!confirm(`Clear all modified values in ${title}?`)) return;
  for (const [k2] of entriesAll) {
    const hasV = Object.prototype.hasOwnProperty.call((widget[section] || {}), k2);
    if (hasV) onChange(section as any, k2, undefined);
  }
}}>clear section</button></div>
        {entries.map(([k, def]) => (
          <div key={k} className="field">
            <div className="fieldLabel" title={def.description || def.desc || ""}>{def.title ?? k}</div>
            {renderField(section, k, def)}
          </div>
        ))}
      </div>
    );
  };

  const renderField = (section: "props"|"style"|"events", key: string, def: any) => {
    const hasValue = Object.prototype.hasOwnProperty.call((widget[section] || {}), key);
    const value = hasValue ? (widget[section] || {})[key] : (def.default ?? "");

    const resetBtn = (def && Object.prototype.hasOwnProperty.call(def, "default")) ? (
      <button
        type="button"
        className="tiny secondary"
        style={{ marginLeft: 8 }}
        title="Reset to default"
        onClick={() => onChange(section, key, def.default)}
      >
        reset
      </button>
    ) : null;

    const clearBtn = hasValue ? (
      <button
        type="button"
        className="tiny secondary"
        style={{ marginLeft: 8 }}
        title="Remove this property so it will not be emitted into YAML"
        onClick={() => onChange(section, key, undefined)}
      >
        clear
      </button>
    ) : null;

    if (def.type === "enum") {
      return (
        <div style={{ display: "flex", alignItems: "center" }}>
          <select value={value} onChange={(e) => onChange(section, key, e.target.value)}>
            {(def.values ?? []).map((v: string) => <option key={v} value={v}>{v}</option>)}
          </select>
          {resetBtn}{clearBtn}
        </div>
      );
    }
    if (def.type === "boolean") {
      return (
        <div style={{ display: "flex", alignItems: "center" }}>
          <select value={String(value)} onChange={(e) => onChange(section, key, e.target.value === "true")}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
          {resetBtn}{clearBtn}
        </div>
      );
    }
    if (def.type === "yaml_block") {
      return (
        <div>
          <textarea rows={6} value={String(value ?? "")} onChange={(e) => onChange(section, key, e.target.value)} />
          <div style={{ marginTop: 6 }}>{resetBtn}{clearBtn}</div>
        </div>
      );
    }
    if (def.type === "number") {
      const min = def.min;
      const max = def.max;
      const step = def.step ?? 1;
      const useSlider = typeof min === "number" && typeof max === "number" && max - min <= 255;
      return (
        <div style={{ display: "flex", alignItems: "center" }}>
          {useSlider ? (
            <input
              type="range"
              value={Number(value ?? min)}
              min={min}
              max={max}
              step={step}
              onChange={(e) => onChange(section, key, Number(e.target.value))}
              style={{ width: 140, marginRight: 8 }}
            />
          ) : null}
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return onChange(section, key, undefined);
              return onChange(section, key, Number(raw));
            }}
          />
          {resetBtn}{clearBtn}
        </div>
      );
    }
    if (def.type === "color") {
      const asStr = String(value ?? "");
      const hexMatch = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(asStr);
      return (
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            type="color"
            value={hexMatch ? asStr.slice(0, 7) : "#000000"}
            onChange={(e) => {
              const newHex = e.target.value;
              const alpha = hexMatch && asStr.length === 9 ? asStr.slice(7) : "";
              const full = newHex + alpha;
              onChange(section, key, full);
              setRecentColors((arr) => {
                const next = [full, ...arr.filter((c) => c !== full)];
                return next.slice(0, 8);
              });
            }}
            style={{ width: 42, height: 28, padding: 0, border: "none", background: "transparent" }}
          />
          <input
            value={asStr}
            placeholder="#RRGGBB or #RRGGBBAA"
            onChange={(e) => onChange(section, key, e.target.value)}
            style={{ marginLeft: 8 }}
          />
          {resetBtn}{clearBtn}
        </div>
      );
    }
    // v0.46: font picker helper.
    // Convention: widget.props.font can be set to "asset:MyFont.ttf:24" (compiler emits font: section)
    // or to a generated id (font_xxx) if user manually manages fonts.
    if (key === "font") {
      const raw = String(value ?? "");
      const isAsset = raw.trim().startsWith("asset:");
      let curFile = "";
      let curSize = 16;
      if (isAsset) {
        try {
          const rest = raw.trim().slice("asset:".length);
          const parts = rest.split(":");
          curFile = parts.slice(0, -1).join(":") || "";
          curSize = parseInt(parts[parts.length - 1] || "16", 10) || 16;
        } catch {}
      }
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={isAsset ? curFile : ""}
            onChange={(e) => {
              const fn = e.target.value;
              if (!fn) return onChange(section, key, undefined);
              onChange(section, key, `asset:${fn}:${curSize}`);
            }}
          >
            <option value="">(select font asset)</option>
            {fontFiles.map((fn) => (
              <option key={fn} value={fn}>{fn}</option>
            ))}
          </select>
          <input
            type="number"
            value={curSize}
            min={6}
            max={96}
            onChange={(e) => {
              const n = parseInt(e.target.value || "16", 10) || 16;
              if (!isAsset || !curFile) return onChange(section, key, raw);
              onChange(section, key, `asset:${curFile}:${n}`);
            }}
            style={{ width: 72 }}
          />
          <select
            value={String(curSize)}
            onChange={(e) => {
              const n = parseInt(e.target.value || "16", 10) || 16;
              if (!curFile) return;
              onChange(section, key, `asset:${curFile}:${n}`);
            }}
          >
            {fontSizes.map((n) => (<option key={n} value={n}>{n}px</option>))}
          </select>
          {resetBtn}{clearBtn}
        </div>
      );
    }

    if (def.type === "string_list") {
      const txt = Array.isArray(value) ? value.join("\n") : String(value);
      return (
        <div>
          <textarea rows={4} value={txt} onChange={(e) => onChange(section, key, e.target.value.split(/\r?\n/).filter(Boolean))} />
          <div style={{ marginTop: 6 }}>{resetBtn}{clearBtn}</div>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center" }}>
        <input value={value} onChange={(e) => onChange(section, key, e.target.value)} />
        {resetBtn}{clearBtn}
      </div>
    );
  };

  return (
    <div>
      <div className="muted" style={{ marginBottom: 8 }}><strong>{schema.title}</strong> <span className="muted">({schema.type})</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          placeholder="Search properties…"
          style={{ width: 220 }}
        />
        <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={modifiedOnly} onChange={(e) => setModifiedOnly(e.target.checked)} />
          modified only
        </label>
        <button type="button" className="tiny secondary" onClick={() => { setFieldFilter(""); setModifiedOnly(false); }}>
          reset filters
        </button>
      </div>
      {renderSection("Props", "props", schema.props)}
      {renderSection("Style", "style", schema.style)}
      {renderSection("Events", "events", schema.events)}
    </div>
  );
}
