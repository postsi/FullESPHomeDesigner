import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Canvas from "./Canvas";
import {listRecipes, compileYaml, validateYaml, listEntities, importRecipe, updateRecipeLabel, deleteRecipe, cloneRecipe, exportRecipe} from "./lib/api";
import { CONTROL_TEMPLATES, type ControlTemplate } from "./controls";
import { PREBUILT_WIDGETS, type PrebuiltWidget } from "./prebuiltWidgets";
import { DOMAIN_PRESETS } from "./bindings/domains";
import {
  getDisplayActionsForType,
  getEventsForType,
  getServicesForDomain,
  domainFromEntityId,
  DISPLAY_ACTION_LABELS,
  EVENT_LABELS,
} from "./bindings/bindingConfig";
import {
  deleteDevice,
  deploy,
  exportDeviceYamlPreview,
  exportDeviceYamlWithExpectedHash,
  fetchStateBatch,
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

/** Derive a friendly widget id from entity_id + attribute (e.g. climate.living_room + friendly_name → living_room_friendly_name). */
function friendlyWidgetIdFromBinding(entity_id: string, attribute: string, usedIds: Set<string>): string {
  const parts = String(entity_id || "").trim().split(".");
  const slug = parts.length > 1 ? (parts[1] || parts[0]) : (parts[0] || "entity");
  const attr = String(attribute || "state").trim() || "state";
  const base = friendlyToId(slug) + "_" + friendlyToId(attr);
  if (!base) return uid("w");
  let id = base;
  let n = 1;
  while (usedIds.has(id)) {
    id = base + "_" + (++n);
  }
  return id;
}

/** Rename a widget id everywhere in the project (page.widgets, links, parent_id). Returns updated project. */
function renameWidgetInProject(
  proj: any,
  pageIndex: number,
  oldId: string,
  newId: string
): { project: any; ok: boolean; newId?: string; error?: string } {
  if (!oldId || !newId || oldId === newId) return { project: proj, ok: false };
  const sanitized = newId.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "") || null;
  if (!sanitized) return { project: proj, ok: false, error: "Invalid id" };
  const p2 = clone(proj);
  const page = p2?.pages?.[pageIndex];
  if (!page?.widgets) return { project: proj, ok: false };
  const existingIds = new Set(page.widgets.map((w: any) => w?.id).filter(Boolean));
  if (existingIds.has(sanitized) && sanitized !== oldId) return { project: proj, ok: false, error: "Id already in use" };
  const w = page.widgets.find((x: any) => x?.id === oldId);
  if (!w) return { project: proj, ok: false };
  w.id = sanitized;
  const links = (p2 as any).links;
  if (Array.isArray(links)) {
    for (const l of links) {
      if (l?.target?.widget_id === oldId) l.target = { ...l.target, widget_id: sanitized };
    }
  }
  const actionBindings = (p2 as any).action_bindings;
  if (Array.isArray(actionBindings)) {
    for (const ab of actionBindings) {
      if (ab?.widget_id === oldId) ab.widget_id = sanitized;
    }
  }
  for (const widget of page.widgets) {
    if (widget?.parent_id === oldId) widget.parent_id = sanitized;
  }
  return { project: p2, ok: true, newId: sanitized };
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
  const [newDeviceApiKey, setNewDeviceApiKey] = useState("");

  // New device wizard: hardware-first flow
  const [editDeviceModalOpen, setEditDeviceModalOpen] = useState(false);
  const [newDeviceWizardOpen, setNewDeviceWizardOpen] = useState(false);
  const [newDeviceWizardStep, setNewDeviceWizardStep] = useState<1 | 2>(1);
  const [newDeviceWizardRecipe, setNewDeviceWizardRecipe] = useState<{ id: string; label: string } | null>(null);
  const [newDeviceWizardId, setNewDeviceWizardId] = useState("");
  const [newDeviceWizardName, setNewDeviceWizardName] = useState("");
  const [newDeviceWizardSlug, setNewDeviceWizardSlug] = useState("");
  const [newDeviceWizardApiKey, setNewDeviceWizardApiKey] = useState("");

  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const projectHist = useHistory<ProjectModel | null>(null);
  const project = projectHist.present;
  const setProject = projectHist.set;
  const [projectDirty, setProjectDirty] = useState(false);

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
  // Entity combobox: show dropdown when open; filter list by domain (from template) + typed search.
  const [tmplEntityDropdownOpen, setTmplEntityDropdownOpen] = useState(false);

  // Binding Builder: entity picker search + bind target fields.
  const [entityQuery, setEntityQuery] = useState<string>("");
  const [bindEntity, setBindEntity] = useState<string>("");
  const [bindAttr, setBindAttr] = useState<string>("");
  const [bindAction, setBindAction] = useState<string>("label_text");
  const [bindFormat, setBindFormat] = useState<string>("");
  const [bindScale, setBindScale] = useState<number>(1);
  const [builderMode, setBuilderMode] = useState<"display" | "action">("display");
  const [bindingsListExpanded, setBindingsListExpanded] = useState<Record<string, boolean>>({});
  const [builderEntityDropdownOpen, setBuilderEntityDropdownOpen] = useState(false);
  // Action binding form
  const [actionEvent, setActionEvent] = useState<string>("on_click");
  const [actionService, setActionService] = useState<string>("");
  const [actionEntity, setActionEntity] = useState<string>("");
  const [editingLinkOverride, setEditingLinkOverride] = useState<{ widgetId: string; entityId: string; attribute: string; action: string } | null>(null);
  const [editingActionOverride, setEditingActionOverride] = useState<{ widgetId: string; event: string } | null>(null);
  const [editingOverrideYaml, setEditingOverrideYaml] = useState<string>("");

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
  const [paletteTab, setPaletteTab] = useState<"std" | "cards" | "widgets">("std");
  const [snippetModalPrebuilt, setSnippetModalPrebuilt] = useState<PrebuiltWidget | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"properties" | "bindings" | "builder">("properties");
  const [editingWidgetId, setEditingWidgetId] = useState<string>("");
  useEffect(() => {
    setEditingWidgetId("");
  }, [selectedWidgetIds.join(",")]);
  const [compileModalOpen, setCompileModalOpen] = useState(false);
  const [compiledYaml, setCompiledYaml] = useState<string>("");
  const [compileErr, setCompileErr] = useState<string>("");
  const [autoCompile, setAutoCompile] = useState<boolean>(true);
  const [compileBusy, setCompileBusy] = useState<boolean>(false);
  const [validateYamlBusy, setValidateYamlBusy] = useState<boolean>(false);
  const [validateYamlResult, setValidateYamlResult] = useState<{ ok: boolean; stdout?: string; stderr?: string; error?: string } | null>(null);
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

  // Live HA state for design-time preview (bound widgets show current HA values).
  const [liveEntityStates, setLiveEntityStates] = useState<Record<string, { state: string; attributes: Record<string, any> }>>({});

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
        const raw = String(e?.message || e);
        const is404 = raw.includes("404") || raw.includes("Not Found");
        setRecipeValidateErr(is404
          ? "Recipe validation unavailable (update integration to v0.70.61+ and restart HA)."
          : raw);
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

// Live HA state for design-time preview: WebSocket + polling fallback (polling ensures updates when WS is unavailable).
useEffect(() => {
  const links = (project as any)?.links;
  if (!Array.isArray(links) || links.length === 0) {
    setLiveEntityStates({});
    return;
  }
  const entityIds = Array.from(
    new Set(
      links
        .map((l: any) => l?.source?.entity_id)
        .filter((e: any) => e && typeof e === "string" && e.includes("."))
    )
  ) as string[];
  if (entityIds.length === 0) return;
  let cancelled = false;

  const applyBatch = (states: Record<string, { state: string; attributes: Record<string, any> }>) => {
    if (cancelled) return;
    setLiveEntityStates((prev) => ({ ...prev, ...states }));
  };

  // WebSocket for real-time updates when supported
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${proto}//${window.location.host}/api/esphome_touch_designer/state/ws`;
  let ws: WebSocket | null = null;
  const connect = () => {
    if (cancelled) return;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (cancelled || !ws) return;
        ws.send(JSON.stringify({ type: "subscribe", entity_ids: entityIds }));
      };
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "state" && data?.entity_id) {
            applyBatch({ [data.entity_id]: { state: data.state ?? "", attributes: data.attributes ?? {} } });
          }
        } catch (_) {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        ws = null;
        if (!cancelled) setTimeout(connect, 2000);
      };
    } catch (_) {}
  };
  connect();

  // Polling fallback: initial fetch + interval so canvas gets HA state even when WebSocket fails or isn't supported
  const poll = () => {
    if (cancelled) return;
    fetchStateBatch(entityIds).then(applyBatch).catch(() => {});
  };
  const t0 = setTimeout(poll, 500);
  const iv = setInterval(poll, 8000);

  return () => {
    cancelled = true;
    clearTimeout(t0);
    clearInterval(iv);
    if (ws) try { ws.close(); } catch (_) {}
  };
}, [project]);

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
      if (!pg) continue;
      for (const w of (pg.widgets || []).filter((w: any) => w && typeof w === "object" && w.id != null)) {
        allWidgets.push(w);
      }
    }
    const widgetIds = new Set(allWidgets.map((w) => w.id).filter(Boolean));

    const bindings = ((p as any).bindings || []).filter((b: any) => b && typeof b === "object");
    const links = ((p as any).links || []).filter((l: any) => l && typeof l === "object");

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
    if (!project || !tmplWizard) {
      if (!project) setToast({ type: "error", msg: "No project loaded. Select a device and open a project first." });
      return;
    }
    const entity_id = tmplEntity.trim();
    let built: { widgets?: any[]; bindings?: any[]; links?: any[] } | undefined;
    try {
    const p2 = clone(project);
    const allTemplates = [...CONTROL_TEMPLATES, ...(pluginControls || [])].filter((t) => t != null && typeof t === "object");
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

// ha_auto returns empty widgets; must resolve to real template from entity domain + caps
    // Card Library templates are never resolved via pickCapabilityVariant (that's for ha_* only)
    const isCardLibrary = (tid: string) => {
      const t = allTemplates.find((x) => x?.id === tid);
      return t && String((t as any).title ?? "").startsWith("Card Library •");
    };
    let resolvedId = baseId;
    if (isCardLibrary(baseId)) {
      resolvedId = baseId;
    } else if (baseId === "ha_auto") {
      const dom = entity_id.split(".")[0]?.toLowerCase() || "";
      const caps = tmplCaps;
      if (dom === "light") resolvedId = pickCapabilityVariant("ha_light_full", caps, tmplVariant);
      else if (dom === "cover") resolvedId = pickCapabilityVariant("ha_cover_basic", caps, tmplVariant);
      else if (dom === "media_player") resolvedId = pickCapabilityVariant("ha_media_basic", caps, tmplVariant);
      else if (dom === "climate") {
        const modes = caps?.attributes?.hvac_modes;
        if (Array.isArray(modes) && (modes.includes("cool") || modes.includes("heat_cool"))) resolvedId = "ha_climate_heat_cool";
        else if (Array.isArray(modes) && modes.includes("heat")) resolvedId = "ha_climate_heat_only";
        else resolvedId = "ha_climate_full";
      }
      else if (dom === "switch") resolvedId = "ha_switch_parity";
      else if (dom === "lock") resolvedId = "ha_lock_parity";
      else if (dom === "fan") resolvedId = "ha_fan_parity";
      else if (dom === "alarm_control_panel") resolvedId = "ha_alarm_parity";
      else if (dom === "select") resolvedId = "ha_select_parity";
      else if (dom === "number") resolvedId = "ha_number_parity";
      else if (dom === "input_boolean") resolvedId = "ha_input_boolean";
      else if (dom === "input_number") resolvedId = "ha_input_number";
      else if (dom === "input_select") resolvedId = "ha_input_select";
      else if (dom === "input_text") resolvedId = "ha_input_text";
      else if (dom === "sensor") resolvedId = "ha_sensor_tile";
      else { setToast({ type: "error", msg: `No template for domain: ${dom || "(enter entity_id)"}` }); return; }
    } else {
      resolvedId = pickCapabilityVariant(baseId, tmplCaps, tmplVariant);
    }
    const tmpl = allTemplates.find((t) => t && t.id === resolvedId);
    if (!tmpl) {
      setToast({ type: "error", msg: `Template not found: ${resolvedId}` });
      return;
    }

    const label = tmplLabel.trim() || undefined;
    built = tmpl.build({
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
    for (const w of (built.widgets || []).filter((w: any) => w && typeof w === "object")) {
      if (w.events) {
        for (const k of Object.keys(w.events)) {
          if (typeof w.events[k] === "string") w.events[k] = replaceEntity(w.events[k]);
        }
      }
      if (label && w.props?.text && typeof w.props.text === "string") {
        w.props.text = String(w.props.text).replaceAll("${label}", label);
      }
    }
    for (const b of (built.bindings || []).filter((x: any) => x && typeof x === "object")) {
      if (entity_id && (!b.entity_id || String(b.entity_id).endsWith(".example"))) b.entity_id = entity_id;
    }
    for (const l of (built.links || []).filter((x: any) => x && typeof x === "object")) {
      if (entity_id && l.source && (!l.source.entity_id || String(l.source.entity_id).endsWith(".example"))) l.source.entity_id = entity_id;
    }
    const rawWidgets = (built.widgets || []).filter((w: any) => w != null && typeof w === "object");
    if (rawWidgets.length === 0) {
      setToast({ type: "error", msg: "Template returned no widgets." });
      return;
    }
    const validLinksForInsert = (built.links || []).filter((l: any) => l && typeof l === "object");
    const usedIds = new Set<string>((p2?.pages?.[safePageIndex]?.widgets || []).map((x: any) => x?.id).filter(Boolean));
    const ws: any[] = [];
    const idMap = new Map<string, string>();
    for (let i = 0; i < rawWidgets.length; i++) {
      const w = rawWidgets[i];
      const linkToThis = validLinksForInsert.find((l: any) => l?.target?.widget_id === w.id);
      const newId = linkToThis?.source?.entity_id
        ? friendlyWidgetIdFromBinding(
            linkToThis.source.entity_id,
            linkToThis.source.attribute ?? "",
            usedIds
          )
        : uid(w.type || "w");
      usedIds.add(newId);
      const obj = { ...w, id: newId };
      if (obj.id == null) {
        console.warn("[Insert] Widget at index", i, "had no id after spread:", w);
        continue;
      }
      ws.push(obj);
      if (w.id != null) idMap.set(String(w.id), newId);
    }
    if (ws.length === 0) {
      setToast({ type: "error", msg: "Template returned no valid widgets (check console)." });
      return;
    }
    const validLinks = (built.links || []).filter((l: any) => l && typeof l === "object");
    const links = validLinks.map((l: any) => {
      const wid = l?.target?.widget_id;
      if (wid && idMap.has(wid)) {
        return { ...l, target: { ...l.target, widget_id: idMap.get(wid) } };
      }
      return l;
    });

    const insertX = tmplWizard.x;
    const insertY = tmplWizard.y;
    const isCard = /_card$/.test(tmplWizard.template_id);

    if (isCard && ws.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w of ws) {
        const x = Number(w.x ?? 0), y = Number(w.y ?? 0), ww = Number(w.w ?? 0), hh = Number(w.h ?? 0);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + ww); maxY = Math.max(maxY, y + hh);
      }
      const gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
      const firstIsContainer = ws[0].type === "container";
      if (firstIsContainer) {
        ws[0].x = insertX;
        ws[0].y = insertY;
        ws[0].w = gw;
        ws[0].h = gh;
        for (let i = 1; i < ws.length; i++) {
          ws[i].parent_id = ws[0].id;
          ws[i].x = Number(ws[i].x ?? 0) - minX;
          ws[i].y = Number(ws[i].y ?? 0) - minY;
        }
      } else {
        const groupId = uid("group");
        const groupWidget = {
          id: groupId,
          type: "container",
          x: insertX,
          y: insertY,
          w: gw,
          h: gh,
          props: {},
          style: { bg_color: 0x1e1e1e, radius: 10 },
        };
        for (const w of ws) {
          w.parent_id = groupId;
          w.x = Number(w.x ?? 0) - minX;
          w.y = Number(w.y ?? 0) - minY;
        }
        ws.unshift(groupWidget as any);
      }
    } else {
      for (const w of ws) {
        w.x = Number(w.x ?? 0) + insertX;
        w.y = Number(w.y ?? 0) + insertY;
      }
    }

    // Ensure pages structure exists (defensive for edge-case project shapes)
    if (!Array.isArray(p2.pages) || p2.pages.length === 0) {
      p2.pages = [{ page_id: uid("page"), name: "Main", widgets: [] }];
    }
    const page = p2.pages[safePageIndex] ?? p2.pages[0];
    if (!page) return setToast({ type: "error", msg: "No page to add widgets to" });
    if (!Array.isArray(page.widgets)) page.widgets = [];
    // Strip any null/undefined from existing page.widgets so next render never sees them
    const beforeLen = page.widgets.length;
    page.widgets = page.widgets.filter((w: any) => w != null && typeof w === "object" && w.id != null);
    if (page.widgets.length < beforeLen) {
      console.warn("[Insert] Removed", beforeLen - page.widgets.length, "invalid widget(s) from current page (existing data).");
    }
    page.widgets.push(...ws);
    (p2 as any).bindings = Array.isArray((p2 as any).bindings) ? (p2 as any).bindings : [];
    (p2 as any).links = Array.isArray((p2 as any).links) ? (p2 as any).links : [];
    (p2 as any).bindings.push(
      ...(built.bindings || []).filter((b: any) => b && typeof b === "object")
    );
    (p2 as any).links.push(...links.filter((l: any) => l && typeof l === "object"));
    if (Array.isArray((built as any).scripts) && (built as any).scripts.length > 0) {
      (p2 as any).scripts = Array.isArray((p2 as any).scripts) ? (p2 as any).scripts : [];
      for (const s of (built as any).scripts) {
        if (s && typeof s === "object" && s.id && s.entity_id) {
          let scriptEntity = s.entity_id;
          if (entity_id && (String(scriptEntity || "").endsWith(".example") || !scriptEntity)) scriptEntity = entity_id;
          (p2 as any).scripts.push({ ...s, entity_id: scriptEntity });
        }
      }
    }
    if (Array.isArray((built as any).action_bindings) && (built as any).action_bindings.length > 0) {
      (p2 as any).action_bindings = Array.isArray((p2 as any).action_bindings) ? (p2 as any).action_bindings : [];
      for (const ab of (built as any).action_bindings) {
        if (ab && typeof ab === "object" && ab.widget_id) {
          const newWid = idMap.get(ab.widget_id);
          (p2 as any).action_bindings.push({
            ...ab,
            widget_id: newWid != null ? newWid : ab.widget_id,
          });
        }
      }
    }

    setProject(p2, true);
    setProjectDirty(true);
    if (ws[0]?.id) {
      setSelectedWidgetIds([ws[0].id]);
      setInspectorTab("properties");
      getWidgetSchema(ws[0].type).then((sr) => { if (sr.ok) setSelectedSchema(sr.schema); });
    }
    setTmplWizard(null);
    setToast({ type: "ok", msg: `Added ${ws.length} widget(s) to canvas` });
    } catch (err) {
      try {
        const msg = String(err instanceof Error ? err.message : err ?? "unknown");
        setToast({ type: "error", msg: `Insert failed: ${msg}` });
        console.error("[Insert] applyTemplateWizard failed:", msg, "template_id:", tmplWizard?.template_id);
        if (typeof built !== "undefined") {
          const w = (built as any).widgets;
          console.error("[Insert] built.widgets:", Array.isArray(w) ? w.length + " items" : typeof w, Array.isArray(w) ? w.slice(0, 10).map((x: any, i: number) => (x != null && x.id != null ? x.id : "null/undefined@" + i)) : []);
        }
      } catch (_) {
        setToast({ type: "error", msg: "Insert failed (see console)." });
      }
      console.error(err);
    }
  }

  async function saveEditedDevice() {
    if (!selectedDevice || !newDeviceName.trim()) return;
    setBusy(true);
    try {
      const res = await upsertDevice(entryId, {
        device_id: selectedDevice,
        name: newDeviceName.trim(),
        slug: newDeviceSlug.trim() || undefined,
        api_key: newDeviceApiKey.trim() || undefined,
      });
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: "Device updated" });
      setEditDeviceModalOpen(false);
      setNewDeviceId(""); setNewDeviceName(""); setNewDeviceSlug(""); setNewDeviceApiKey("");
      await refresh();
    } finally { setBusy(false); }
  }

  function regenerateApiKey() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const base64 = btoa(String.fromCharCode(...arr));
    setNewDeviceApiKey(base64);
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
        api_key: newDeviceWizardApiKey.trim() || undefined,
      });
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setToast({ type: "ok", msg: "Device created" });
      setNewDeviceWizardOpen(false);
      setNewDeviceWizardStep(1);
      setNewDeviceWizardRecipe(null);
      setNewDeviceWizardId("");
      setNewDeviceWizardName("");
      setNewDeviceWizardSlug("");
      setNewDeviceWizardApiKey("");
      await refresh();
      await loadDevice(did);
    } finally { setBusy(false); }
  }

  function openEditDeviceModal() {
    if (!selectedDeviceObj) return;
    setNewDeviceId(selectedDeviceObj.device_id);
    setNewDeviceName(selectedDeviceObj.name || "");
    setNewDeviceSlug(selectedDeviceObj.slug || selectedDeviceObj.device_id || "");
    setNewDeviceApiKey(selectedDeviceObj.api_key ?? "");
    setEditDeviceModalOpen(true);
  }

  function openNewDeviceWizard() {
    setNewDeviceWizardOpen(true);
    setNewDeviceWizardStep(1);
    setNewDeviceWizardRecipe(null);
    setNewDeviceWizardId("");
    setNewDeviceWizardName("");
    setNewDeviceWizardSlug("");
    setNewDeviceWizardApiKey("");
    refreshRecipes(); // Refetch recipes when wizard opens (handles late load or retry)
  }

  function regenerateWizardApiKey() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setNewDeviceWizardApiKey(btoa(String.fromCharCode(...arr)));
  }

  function wizardSelectRecipe(r: { id: string; label: string }) {
    setNewDeviceWizardRecipe(r);
    const derived = friendlyToId(r.label || r.id);
    setNewDeviceWizardName(r.label || r.id);
    setNewDeviceWizardId(derived);
    setNewDeviceWizardSlug(derived);
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setNewDeviceWizardApiKey(btoa(String.fromCharCode(...arr)));
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
      setProjectDirty(false);
      setSelectedWidgetIds([]);
      setSelectedSchema(null);
      setCurrentPageIndex(0);
      setToast({ type: "ok", msg: `Loaded project for ${id}` });
    } finally { setBusy(false); }
  }

  const pages = project?.pages ?? [];
  const safePageIndex = Math.max(0, Math.min(currentPageIndex, Math.max(0, pages.length - 1)));
  const widgets = useMemo(
    () =>
      (pages?.[safePageIndex]?.widgets ?? []).filter(
        (w: any) => w && typeof w === "object" && w.id != null
      ),
    [pages, safePageIndex]
  );

  // Live overrides for canvas: from links + liveEntityStates, compute per-widget display values.
  const liveOverrides = useMemo(() => {
    const links = (project as any)?.links ?? [];
    const overrides: Record<string, { text?: string; value?: number; checked?: boolean }> = {};
    for (const ln of links) {
      const src = ln?.source;
      const tgt = ln?.target;
      const widgetId = tgt?.widget_id;
      const entityId = src?.entity_id;
      const kind = src?.kind || "state";
      const attr = src?.attribute ?? "";
      const action = tgt?.action || "";
      const fmt = tgt?.format ?? "%.1f";
      const scale = typeof tgt?.scale === "number" ? tgt.scale : 1;
      if (!widgetId || !entityId) continue;
      const data = liveEntityStates[entityId];
      if (!data) continue;
      let raw: any = data.state;
      if (kind === "attribute_number" && attr) {
        const v = data.attributes?.[attr];
        raw = typeof v === "number" ? v : (typeof v === "string" ? parseFloat(v) : NaN);
        if (Number.isNaN(raw) && typeof data.state === "string") raw = parseFloat(data.state);
      } else if (kind === "attribute_text" && attr) {
        raw = data.attributes?.[attr] ?? "";
        if (raw === "" && typeof data.state === "string") raw = data.state;
      } else if (kind === "binary") {
        raw = (data.state || "").toLowerCase() === "on";
      }
      if (action === "label_text") {
        if (typeof raw === "number" && !Number.isNaN(raw)) {
          const n = raw * scale;
          const s = fmt.replace("%.2f", n.toFixed(2)).replace("%.1f", n.toFixed(1)).replace("%.0f", String(Math.round(n)));
          overrides[widgetId] = { ...overrides[widgetId], text: s };
        } else {
          overrides[widgetId] = { ...overrides[widgetId], text: String(raw ?? "") };
        }
      } else if (action === "label_number") {
        if (typeof raw === "number" && !Number.isNaN(raw)) {
          const n = raw * scale;
          overrides[widgetId] = { ...overrides[widgetId], text: String(Math.round(n)) };
        }
      } else if (action === "arc_value" || action === "slider_value") {
        const num = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isNaN(num)) overrides[widgetId] = { ...overrides[widgetId], value: num * scale };
      } else if (action === "widget_checked") {
        overrides[widgetId] = { ...overrides[widgetId], checked: !!raw };
      }
    }
    return overrides;
  }, [project, liveEntityStates]);

  // Derive canvas size: device.screen from project, or extract from hardware_recipe_id (e.g. jc1060p470_esp32p4_1024x600)
  const screenSize = useMemo(() => {
    const dev = (project as any)?.device;
    const sw = dev?.screen?.width;
    const sh = dev?.screen?.height;
    if (sw && sh) return { width: sw, height: sh, source: "device.screen" as const };
    const rid = selectedDeviceObj?.hardware_recipe_id ?? dev?.hardware_recipe_id ?? "";
    const m = /(\d{3,4})x(\d{3,4})/i.exec(String(rid));
    if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10), source: "recipe_id" as const };
    return { width: 800, height: 480, source: "default" as const };
  }, [project, selectedDeviceObj?.hardware_recipe_id]);
  function _findWidget(id: string) {
    return widgets.find((w: any) => w && w.id === id);
  }

  function _childrenOf(parentId: string) {
    return widgets.filter((w: any) => w && w.parent_id === parentId);
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
    const firstIdx = Math.min(...sel.map((w) => list.findIndex((x) => x && x.id === w.id)).filter((i) => i >= 0));
    list.splice(firstIdx >= 0 ? firstIdx : list.length, 0, container);

    // Re-parent selected widgets under container with relative coords.
    for (const entry of abs) {
      const w = list.find((x) => x && x.id === entry.w.id);
      if (!w) continue;
      w.parent_id = containerId;
      w.x = entry.ax - minX;
      w.y = entry.ay - minY;
    }

    setProject(p2, true);
    setProjectDirty(true);
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
    const container = list.find((x) => x && x.id === w0.id);
    if (!container) return;
    const parentId = container.parent_id || "";
    const containerAbs = _absPos(container);
    const parentWidget = parentId ? _findWidget(parentId) : null;
    const parentAbs = parentWidget ? _absPos(parentWidget) : { ax: 0, ay: 0 };

    for (const k of kids) {
      const kk = list.find((x) => x && x.id === k.id);
      if (!kk) continue;
      // Convert from container-relative -> parent-relative (or top-level absolute)
      const absKx = containerAbs.ax + Number(kk.x || 0);
      const absKy = containerAbs.ay + Number(kk.y || 0);
      kk.parent_id = parentId || undefined;
      kk.x = absKx - parentAbs.ax;
      kk.y = absKy - parentAbs.ay;
    }

    // Remove container
    const idx = list.findIndex((x) => x && x.id === container.id);
    if (idx >= 0) list.splice(idx, 1);
    setProject(p2, true);
    setProjectDirty(true);
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
    const sel = selectedWidgetIds.map((id) => list.find((x) => x && x.id === id)).filter(Boolean) as any[];
    if (!sel.length) return;
    const parentId = sel[0].parent_id || "";
    if (!sel.every((w) => (w.parent_id || "") === parentId)) {
      setToast({ type: "error", msg: "Z-order moves currently require all selected widgets to share the same parent." });
      return;
    }
    const idxs = sel.map((w) => list.findIndex((x) => x && x.id === w.id)).filter((i) => i >= 0).sort((a, b) => a - b);
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
    setProjectDirty(true);
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
    const clipIds = new Set(clipboard.filter((w) => w && w.id).map((w) => w.id));
    const clipRoots = clipboard.filter((w) => w && w.id && (!w.parent_id || clipIds.has(w.parent_id)));

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
    setProjectDirty(true);
    setSelectedWidgetIds(pasted.map((w) => w.id));
  }

  
function nudgeSelected(dx: number, dy: number, step: number) {
    if (!project) return;
    if (!selectedWidgetIds.length) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x && x.id === id)).filter(Boolean) as any[];
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
    setProjectDirty(true);
  }

  function alignSelected(mode: "left"|"center"|"right"|"top"|"middle"|"bottom") {
    if (!project) return;
    if (selectedWidgetIds.length < 2) return;

    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x && x.id === id)).filter(Boolean) as any[];
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
    setProjectDirty(true);
  }

  function distributeSelected(axis: "h"|"v") {
    if (!project) return;
    if (selectedWidgetIds.length < 3) return;

    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    const list = page.widgets as any[];
    const sel = selectedWidgetIds.map((id) => list.find((x) => x && x.id === id)).filter(Boolean) as any[];
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
    setProjectDirty(true);
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
        if (!w || !w.id) continue;
        if (w.parent_id && toDelete.has(w.parent_id) && !toDelete.has(w.id)) {
          toDelete.add(w.id);
          changed = true;
        }
      }
    }
    const kept = list.filter((w) => w && w.id && !toDelete.has(w.id));
    page.widgets = kept;
    // Remove any links and action_bindings that reference deleted widget ids.
    const links = (p2 as any).links;
    if (Array.isArray(links)) {
      (p2 as any).links = links.filter((l: any) => !toDelete.has(String(l?.target?.widget_id || "")));
    }
    const actionBindings = (p2 as any).action_bindings;
    if (Array.isArray(actionBindings)) {
      (p2 as any).action_bindings = actionBindings.filter((ab: any) => !toDelete.has(String(ab?.widget_id || "")));
    }
    setProject(p2, true);
    setProjectDirty(true);
    setSelectedWidgetIds([]);
  }
  const selectedWidget = selectedWidgetId ? widgets.find((w: any) => w && w.id === selectedWidgetId) : null;

  function addPage() {
    if (!project) return;
    const p2 = clone(project);
    const pid = uid("page");
    p2.pages = p2.pages || [];
    p2.pages.push({ page_id: pid, name: `Page ${p2.pages.length + 1}`, widgets: [] } as any);
    setProject(p2);
    setProjectDirty(true);
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
    setProjectDirty(true);
    setSelectedWidgetIds([w.id]);
    setSelectedSchema(s);
  }

  async function selectWidget(id: string, additive = false) {
    if (!project) return;
    const w = widgets.find((x: any) => x && x.id === id);
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
      if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
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
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!selectedWidgetIds.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : (e.altKey ? 5 : ((project as any)?.ui?.gridSize || 10));
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        nudgeSelected(dx, dy, step);
        return;
      }
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
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (projectDirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWidgetIds, clipboard, project, projectDirty]);

  // v0.57.2: Live compile preview — debounced when compile modal is open.
  useEffect(() => {
    if (!project || !selectedDevice) return;
    if (!compileModalOpen) return;
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
  }, [project, selectedDevice, compileModalOpen, autoCompile]);

  async function refreshCompile() {
    if (!project || !selectedDevice) return;
    setCompileBusy(true);
    setCompileErr("");
    setValidateYamlResult(null);
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

  function updateField(section: string, key: string, value: any) {
    if (!project || !selectedWidgetId) return;
    const p2 = clone(project);
    const page = p2.pages?.[safePageIndex];
    if (!page?.widgets) return;
    const w = page.widgets.find((x: any) => x && x.id === selectedWidgetId);
    if (!w) return;
    w[section] = w[section] || {};
    // If the UI clears a field, remove it entirely so the compiler won't emit it.
    if (value === undefined) {
      delete w[section][key];
    } else {
      w[section][key] = value;
    }
    setProject(p2);
    setProjectDirty(true);
  }

  async function saveProject() {
    if (!project || !selectedDevice) return;
    setBusy(true);
    try {
      const res = await putProject(entryId, selectedDevice, project);
      if (!res.ok) return setToast({ type: "error", msg: res.error });
      setProjectDirty(false);
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
          <div className="muted">v0.70.69 — Friendly widget IDs, colour picker, dropdown HA</div>
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
              <div className="fieldLabel">{wizardIsMultiEntity ? "entities" : "Home Assistant Entity"}</div>
              {!wizardIsMultiEntity ? (
                <>
                  {/* Filterable dropdown: list comes from template entityDomain (or ha_<domain>_), filter by typing */}
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder={`Select or type… (${(wizardTemplate as any)?.entityDomain || templateDomain(tmplWizard.template_id) || "any"})`}
                      value={tmplEntity}
                      onChange={(e) => {
                        setTmplEntity(e.target.value);
                        setTmplEntityDropdownOpen(true);
                      }}
                      onFocus={() => setTmplEntityDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setTmplEntityDropdownOpen(false), 150)}
                      autoComplete="off"
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                    {tmplEntityDropdownOpen && (() => {
                      const dom = (wizardTemplate as any)?.entityDomain || templateDomain(tmplWizard.template_id);
                      const search = (tmplEntity || "").trim().toLowerCase();
                      const list = entities
                        .filter((e) => {
                          if (!e?.entity_id) return false;
                          if (dom && !String(e.entity_id).startsWith(dom + ".")) return false;
                          if (!search) return true;
                          const eid = String(e.entity_id).toLowerCase();
                          const name = String(e?.friendly_name || "").toLowerCase();
                          return eid.includes(search) || name.includes(search);
                        })
                        .slice(0, 300);
                      return (
                        <div
                          className="dropdownList"
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: "100%",
                            marginTop: 2,
                            maxHeight: 260,
                            overflow: "auto",
                            background: "var(--panel-bg, #1e1e1e)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 8,
                            zIndex: 1000,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                          }}
                        >
                          {list.length === 0 ? (
                            <div style={{ padding: "10px 12px", color: "var(--muted, #888)" }}>
                              {entities.length === 0 ? "Loading entities…" : "No matching entities."}
                            </div>
                          ) : (
                            list.map((e) => (
                              <div
                                key={e.entity_id}
                                role="option"
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  setTmplEntity(e.entity_id);
                                  setTmplEntityDropdownOpen(false);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                className="dropdownOption"
                              >
                                <span style={{ fontWeight: 500 }}>{e.entity_id}</span>
                                {e.friendly_name ? (
                                  <span style={{ color: "var(--muted, #888)", marginLeft: 8 }}>— {e.friendly_name}</span>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    List shows only entities for this card type. Type to filter or pick from the list.
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

      {editDeviceModalOpen && selectedDeviceObj && (
        <div className="modalOverlay" onClick={() => setEditDeviceModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modalHeader">
              <div className="title">Edit device</div>
              <button className="ghost" onClick={() => setEditDeviceModalOpen(false)}>✕</button>
            </div>
            <div className="muted" style={{ marginBottom: 12 }}><code>{selectedDeviceObj.device_id}</code></div>
            <label className="label">Friendly name</label>
            <input
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="e.g. Living Room Display"
            />
            <label className="label">Filename</label>
            <input
              value={newDeviceSlug}
              onChange={(e) => setNewDeviceSlug(e.target.value)}
              placeholder="Used for .yaml export"
            />
            <label className="label">API key</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                autoComplete="off"
                value={newDeviceApiKey}
                onChange={(e) => setNewDeviceApiKey(e.target.value)}
                placeholder={newDeviceApiKey ? "" : "No key—click Regenerate to create one"}
                style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
              />
              <button type="button" className="secondary" onClick={regenerateApiKey} title="Generate new API key">Regenerate</button>
              <button type="button" className="secondary" disabled={!newDeviceApiKey} onClick={() => newDeviceApiKey && navigator.clipboard.writeText(newDeviceApiKey)} title="Copy to clipboard">Copy</button>
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              Required for Home Assistant API. Visible for debugging. Saves with device; paste into ESPHome secrets or ensure it matches configuration.yaml.
            </div>
            {!entryId && <div className="muted" style={{ marginTop: 6 }}>Integration not ready.</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => setEditDeviceModalOpen(false)}>Cancel</button>
              <button disabled={busy || !newDeviceName.trim()} onClick={saveEditedDevice}>Save</button>
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
                <label className="label">API key</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    autoComplete="off"
                    value={newDeviceWizardApiKey}
                    onChange={(e) => setNewDeviceWizardApiKey(e.target.value)}
                    placeholder="32-byte base64 (auto-generated)"
                    style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  />
                  <button type="button" className="secondary" onClick={regenerateWizardApiKey} title="Generate new API key">Regenerate</button>
                  <button type="button" className="secondary" disabled={!newDeviceWizardApiKey} onClick={() => newDeviceWizardApiKey && navigator.clipboard.writeText(newDeviceWizardApiKey)} title="Copy to clipboard">Copy</button>
                </div>
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

      {compileModalOpen && (
        <div className="modalOverlay" onClick={() => setCompileModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="modalHeader">
              <div className="title">Compile</div>
              <button className="ghost" onClick={() => setCompileModalOpen(false)}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 8 }}>
              {!selectedDevice || !project ? (
                <div className="muted">Select a device first.</div>
              ) : (
                <>
                  <div className="section">
                    <div className="sectionTitle">Hardware (recipe)</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        value={selectedRecipeId || ""}
                        onChange={async (e) => {
                          if (!selectedDeviceObj) return;
                          const rid = e.target.value || null;
                          setBusy(true);
                          try {
                            const res = await upsertDevice(entryId, { device_id: selectedDeviceObj.device_id, name: selectedDeviceObj.name, slug: selectedDeviceObj.slug, hardware_recipe_id: rid });
                            if (!res.ok) throw new Error(res.error);
                            await refresh();
                            setToast({ type: "ok", msg: rid ? `Recipe set: ${rid}` : "Recipe cleared" });
                          } catch (err: any) {
                            setToast({ type: "error", msg: String(err?.message || err) });
                          } finally { setBusy(false); }
                        }}
                        title="Hardware recipe"
                      >
                        <option value="">(none)</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>{r.label || r.id}</option>
                        ))}
                      </select>
                      {recipeValidateRes?.ok && <span className="toast ok" style={{ padding: "6px 10px" }}>valid</span>}
                      {recipeValidateRes && !recipeValidateRes.ok && <span className="toast error" style={{ padding: "6px 10px" }}>needs attention</span>}
                    </div>
                  </div>
                  <div className="section">
                    <div className="sectionTitle">Compiled YAML</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} /> auto
                      </label>
                      <button className="secondary" disabled={compileBusy || !project} onClick={refreshCompile}>{compileBusy ? "Compiling…" : "Refresh"}</button>
                      <button className="secondary" disabled={!compiledYaml} onClick={() => navigator.clipboard.writeText(compiledYaml)}>Copy</button>
                      <button
                        className="secondary"
                        disabled={validateYamlBusy || !compiledYaml}
                        onClick={async () => {
                          if (!compiledYaml) return;
                          setValidateYamlBusy(true);
                          setValidateYamlResult(null);
                          try {
                            const res = await validateYaml(compiledYaml);
                            setValidateYamlResult(res);
                            if (res.ok) setToast({ type: "ok", msg: "ESPHome config valid" });
                          } catch (e) {
                            setValidateYamlResult({ ok: false, stderr: String(e?.message || e) });
                          } finally {
                            setValidateYamlBusy(false);
                          }
                        }}
                        title="Run esphome compile to validate config (requires ESPHome CLI on the server)"
                      >
                        {validateYamlBusy ? "Validating…" : "Validate with ESPHome"}
                      </button>
                      <button className="secondary" onClick={() => { setRecipeImportOpen(true); setRecipeImportErr(""); setRecipeImportOk(null); }}>Import recipe…</button>
                      <button className="secondary" onClick={() => { setRecipeMgrOpen(true); setRecipeMgrErr(""); }}>Manage recipes…</button>
                    </div>
                    {validateYamlResult && (
                      <div style={{ marginBottom: 8 }}>
                        {validateYamlResult.ok ? (
                          <div className="toast ok" style={{ padding: "8px 12px" }}>Config valid — esphome compile succeeded.</div>
                        ) : (
                          <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                            <div className="muted" style={{ marginBottom: 4 }}>Validation failed {validateYamlResult.error ? `(${validateYamlResult.error})` : ""}</div>
                            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, margin: 0 }}>{(validateYamlResult.stderr || validateYamlResult.stdout || "No output").trim()}</pre>
                          </div>
                        )}
                      </div>
                    )}
                    {compileErr && <div className="toast error" style={{ marginBottom: 8 }}>Compile error: {compileErr}</div>}
                    <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "rgba(255,255,255,0.02)", maxHeight: 300, overflowY: "auto" }}>
                      {compiledYaml || (compileBusy ? "Compiling…" : "No YAML yet.")}
                    </pre>
                  </div>
                  <div className="section">
                    <div className="sectionTitle">Deployment</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button className="secondary" disabled={exportBusy || !entryId || !selectedDevice} onClick={previewExport}>Preview export</button>
                      <button disabled={exportBusy || !entryId || !exportPreview || exportPreview?.error || exportPreview?.externally_modified} onClick={doExport}>Export to /config/esphome/</button>
                      <button className="secondary" onClick={() => window.open("/esphome", "_blank")}>Open ESPHome Dashboard</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className="bar" style={{ padding: "10px 16px", gap: 12, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--color-border, #333)" }}>
        <select
          value={selectedDevice}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            if (projectDirty && !window.confirm("You have unsaved changes. Load another device anyway? Changes will be lost.")) return;
            loadDevice(id);
          }}
          title="Select device"
          style={{ minWidth: 180, padding: "6px 10px" }}
        >
          <option value="">Select device…</option>
          {devices.map((d) => (
            <option key={d.device_id} value={d.device_id}>
              {d.name || d.device_id}
            </option>
          ))}
        </select>
        <button className="secondary" disabled={busy || !entryId} onClick={openNewDeviceWizard} title="Create a new device with a hardware profile">New device</button>
        <button className="secondary" disabled={busy || !selectedDevice} onClick={openEditDeviceModal} title="Edit the selected device">Edit device</button>
        <button className="danger" disabled={busy || !selectedDevice} onClick={() => selectedDevice && removeDevice(selectedDevice)} title="Delete selected device">Delete</button>
        <button className={projectDirty ? "primary" : "secondary"} disabled={busy || !selectedDevice || !project} onClick={saveProject} title="Save project to server (Ctrl+S)">{projectDirty ? "Save (unsaved)" : "Save"}</button>
        <button className="secondary" disabled={busy || !selectedDevice} onClick={() => { setCompileModalOpen(true); refreshCompile(); }} title="Compile and view YAML">Compile</button>
      </nav>

      <main
        className="designerLayout"
        style={
          selectedDevice && project
            ? { gridTemplateColumns: `200px ${12 + 36 + screenSize.width + 12}px 260px`, gap: 20 }
            : undefined
        }
      >
        <aside className="designerPanel designerPanelLeft" style={{ minWidth: 200, maxWidth: 220 }}>
          <div className="panelTabs">
            <button type="button" className={`panelTab ${paletteTab === "std" ? "active" : ""}`} onClick={() => setPaletteTab("std")}>Std LVGL</button>
            <button type="button" className={`panelTab ${paletteTab === "cards" ? "active" : ""}`} onClick={() => setPaletteTab("cards")}>Card Library</button>
            <button type="button" className={`panelTab ${paletteTab === "widgets" ? "active" : ""}`} onClick={() => setPaletteTab("widgets")}>Widgets</button>
          </div>
          <div className="panelContent">
            {paletteTab === "std" && (
              <>
                <div className="sectionTitle">LVGL widgets</div>
                <div className="palette">
                  {(schemaIndex ?? []).filter(Boolean).map((s) => (
                    <div key={s?.type ?? ""} className="paletteItem" draggable onDragStart={(e) => { e.dataTransfer.setData("application/x-esphome-widget-type", s?.type ?? ""); e.dataTransfer.effectAllowed = "copy"; }} title={`Drag ${s?.title ?? s?.type ?? ""} onto canvas`}>
                      {s?.title ?? s?.type ?? ""}
                    </div>
                  ))}
                </div>
              </>
            )}
            {paletteTab === "cards" && (
              <>
                <div className="sectionTitle">Card Library</div>
                <div className="palette">
                  {[...(CONTROL_TEMPLATES || []), ...(pluginControls || [])].filter((t: any) => t && String((t as any).title ?? "").startsWith("Card Library • ") && !String((t as any).title ?? "").startsWith("Card Library disabled • ")).map((t: any) => (
                    <div
                      key={t.id}
                      className="paletteItem"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("application/x-esphome-control-template", t.id); e.dataTransfer.effectAllowed = "copy"; }}
                      onClick={() => { if (project && selectedDevice) openTemplateWizard(t.id, 80, 80); else setToast({ type: "error", msg: "Select a device first, then add cards" }); }}
                      title={String((t as any).description ?? "") + " (click or drag onto canvas)"}
                    >
                      {t.title ?? t.id}
                    </div>
                  ))}
                </div>
              </>
            )}
            {paletteTab === "widgets" && (
              <>
                <div className="sectionTitle">Prebuilt widgets</div>
                <div className="palette">
                  {PREBUILT_WIDGETS.map((pw) => (
                    <div
                      key={pw.id}
                      className="paletteItem"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("application/x-esphome-prebuilt-widget", pw.id); e.dataTransfer.effectAllowed = "copy"; }}
                      onClick={() => {
                        if (!project) return;
                        const p2 = clone(project);
                        const pg = p2.pages?.[safePageIndex];
                        if (!pg?.widgets) return;
                        const built = pw.build({ x: 80, y: 80 });
                        const widgets = built.widgets || [];
                        for (const w of widgets) pg.widgets.push(w);
                        if (Array.isArray(built.action_bindings) && built.action_bindings.length > 0) {
                          (p2 as any).action_bindings = Array.isArray((p2 as any).action_bindings) ? (p2 as any).action_bindings : [];
                          for (const ab of built.action_bindings) (p2 as any).action_bindings.push(ab);
                        }
                        if (Array.isArray(built.scripts) && built.scripts.length > 0) {
                          (p2 as any).scripts = Array.isArray((p2 as any).scripts) ? (p2 as any).scripts : [];
                          for (const s of built.scripts) (p2 as any).scripts.push(s);
                        }
                        setProject(p2, true);
                        setProjectDirty(true);
                        setSelectedWidgetIds(widgets.length ? [widgets[0].id] : []);
                        setInspectorTab("properties");
                      }}
                      title={pw.description ? `${pw.description} (drag or click to add)` : "Drag or click to add"}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>{pw.title}</span>
                      <button
                        type="button"
                        className="secondary"
                        style={{ flexShrink: 0, padding: "2px 6px", fontSize: 10 }}
                        title="View YAML snippet"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSnippetModalPrebuilt(pw); }}
                      >
                        YAML
                      </button>
                    </div>
                  ))}
                </div>
                {snippetModalPrebuilt && (
                  <div className="modalBackdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSnippetModalPrebuilt(null)}>
                    <div className="panelContent" style={{ maxWidth: 480, maxHeight: "80vh", overflow: "auto", padding: 16 }} onClick={(e) => e.stopPropagation()}>
                      <div className="sectionTitle" style={{ marginBottom: 8 }}>YAML snippet — {snippetModalPrebuilt.title}</div>
                      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{snippetModalPrebuilt.description}</p>
                      <pre style={{ background: "#1e293b", padding: 12, borderRadius: 8, fontSize: 11, overflow: "auto", whiteSpace: "pre-wrap", marginBottom: 12 }}>{snippetModalPrebuilt.yamlSnippet || "No snippet for this widget. Use the Bindings panel to link entities and actions."}</pre>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="secondary" onClick={() => { const t = snippetModalPrebuilt.yamlSnippet || ""; if (t) navigator.clipboard.writeText(t); setToast({ type: "ok", msg: "Copied to clipboard" }); }}>Copy</button>
                        <button type="button" className="secondary" onClick={() => setSnippetModalPrebuilt(null)}>Close</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Drag onto canvas. Hold <code>ALT</code> to disable snapping.</div>
          </div>
        </aside>

        <div className="designerPanelCenter">
          {!selectedDevice || !project ? (
            <div className="muted" style={{ padding: 24 }}>
              Select a device from the dropdown above, or click <strong>New device</strong> to create one.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <select value={safePageIndex} onChange={(e) => { setCurrentPageIndex(Number(e.target.value)); setSelectedWidgetIds([]); setSelectedSchema(null); }} title="Page">
                  {pages.map((p, idx) => (
                    <option key={p?.page_id ?? `page-${idx}`} value={idx}>{p?.name || `Page ${idx + 1}`}</option>
                  ))}
                </select>
                <button className="secondary" disabled={busy} onClick={addPage}>Add page</button>
                <button className="secondary" disabled={!projectHist.canUndo} onClick={projectHist.undo}>Undo</button>
                <button className="secondary" disabled={!projectHist.canRedo} onClick={projectHist.redo}>Redo</button>
                <span className="muted">|</span>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("left")}>Align L</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("center")}>C</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("right")}>R</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("top")}>T</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("middle")}>M</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 2} onClick={() => alignSelected("bottom")}>B</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 3} onClick={() => distributeSelected("h")}>Dist H</button>
                <button className="secondary" disabled={selectedWidgetIds.length < 3} onClick={() => distributeSelected("v")}>Dist V</button>
                <span className="muted">|</span>
                <button className="secondary" disabled={!clipboard?.length} onClick={pasteClipboard}>Paste</button>
                <button className="secondary" disabled={!selectedWidgetIds.length} onClick={copySelected}>Copy</button>
                <button className="secondary" disabled={!selectedWidgetIds.length} onClick={deleteSelected}>Del</button>
                <button className="secondary" disabled={busy} onClick={saveProject}>Save</button>
              </div>
              {/* Physical screen dimensions - prominent box above canvas */}
              <div style={{
                marginBottom: 12,
                padding: "10px 14px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ha-text-primary)",
              }}>
                <span style={{ marginRight: 8 }}>Physical screen:</span>
                <span>{screenSize.width} × {screenSize.height} px</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: 12, fontWeight: 400 }}>({screenSize.source})</span>
              </div>
              <div className="canvasAxis" style={{ alignSelf: "flex-start" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "36px " + screenSize.width + "px",
                  gridTemplateRows: screenSize.height + "px 24px",
                  alignItems: "stretch",
                  justifyItems: "stretch",
                }}>
                  <div className="canvasAxisY" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingTop: 4, paddingBottom: 4, paddingRight: 6, fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
                    {(() => {
                      const ticks: number[] = [];
                      for (let v = 0; v <= screenSize.height; v += 100) ticks.push(v);
                      if (ticks[ticks.length - 1] !== screenSize.height) ticks.push(screenSize.height);
                      return ticks.map((y) => <span key={y}>{y}</span>);
                    })()}
                  </div>
                  <div style={{ minWidth: 0, outline: "2px solid rgba(16, 185, 129, 0.4)", borderRadius: 12 }}>
                    <Canvas
                  widgets={widgets}
                  selectedIds={selectedWidgetIds}
                  width={screenSize.width}
                  height={screenSize.height}
                  gridSize={(project as any)?.ui?.gridSize || 10}
                  showGrid={((project as any)?.ui?.showGrid ?? true) as any}
                  dispBgColor={(project as any)?.disp_bg_color}
                  liveOverrides={liveOverrides}
                  onSelect={(id, additive) => selectWidget(id, additive)}
                  onSelectNone={() => setSelectedWidgetIds([])}
                  onDropCreate={(type, x, y) => {
                    if (!project) return;
                    const p2 = clone(project);
                    // Prebuilt widgets: insert directly without wizard
                    if (String(type).startsWith("prebuilt:")) {
                      const prebuiltId = String(type).slice(9);
                      const pw = PREBUILT_WIDGETS.find((p) => p.id === prebuiltId);
                      if (pw) {
                        const pg = p2.pages?.[safePageIndex];
                        if (pg?.widgets) {
                          const built = pw.build({ x, y });
                          const widgets = built.widgets || [];
                          for (const w of widgets) pg.widgets.push(w);
                          if (Array.isArray(built.action_bindings) && built.action_bindings.length > 0) {
                            (p2 as any).action_bindings = Array.isArray((p2 as any).action_bindings) ? (p2 as any).action_bindings : [];
                            for (const ab of built.action_bindings) (p2 as any).action_bindings.push(ab);
                          }
                          if (Array.isArray(built.scripts) && built.scripts.length > 0) {
                            (p2 as any).scripts = Array.isArray((p2 as any).scripts) ? (p2 as any).scripts : [];
                            for (const s of built.scripts) (p2 as any).scripts.push(s);
                          }
                          setProject(p2, true);
                          setProjectDirty(true);
                          setSelectedWidgetIds(widgets.length ? [widgets[0].id] : []);
                          setInspectorTab("properties");
                        }
                      }
                      return;
                    }
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
                    setProjectDirty(true);
                    setSelectedWidgetIds([id]);
                    setInspectorTab("properties");
                    getWidgetSchema(type).then((sr) => { if (sr.ok) setSelectedSchema(sr.schema); });
                  }}
                  onChangeMany={(patches, commit) => {
                    if (!project) return;
                    const p2 = clone(project);
                    const pg = (p2 as any).pages?.[safePageIndex];
                    if (!pg?.widgets) return;
                    for (const { id, patch } of patches) {
                      const w = pg.widgets.find((x: any) => x && x.id === id);
                      if (!w) continue;
                      Object.assign(w, patch);
                    }
                    setProject(p2, commit ?? true);
                    setProjectDirty(true);
                  }}
                />
                  </div>
                  <div />
                  <div className="canvasAxisX" style={{ display: "flex", justifyContent: "space-between", alignSelf: "start", width: screenSize.width, fontSize: 11, color: "var(--muted)", direction: "ltr" }}>
                    {(() => {
                      const ticks: number[] = [];
                      for (let v = 0; v <= screenSize.width; v += 100) ticks.push(v);
                      if (ticks[ticks.length - 1] !== screenSize.width) ticks.push(screenSize.width);
                      return ticks.map((x) => <span key={x} style={{ flex: "0 0 auto" }}>{x}</span>);
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="designerPanel designerPanelRight" style={{ minWidth: 260 }}>
          <div className="panelTabs">
            <button type="button" className={`panelTab ${inspectorTab === "properties" ? "active" : ""}`} onClick={() => setInspectorTab("properties")}>Properties</button>
            <button type="button" className={`panelTab ${inspectorTab === "bindings" ? "active" : ""}`} onClick={() => setInspectorTab("bindings")}>HA Bindings</button>
            <button type="button" className={`panelTab ${inspectorTab === "builder" ? "active" : ""}`} onClick={() => setInspectorTab("builder")}>Binding Builder</button>
          </div>
          <div className="panelContent">
            {selectedDevice && project && (
              <div className="muted" style={{ marginBottom: 12, padding: 8, background: "rgba(255,255,255,.04)", borderRadius: 8, fontSize: 13 }}>
                <strong>Physical Pixels:</strong> {screenSize.width} × {screenSize.height}
                <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>({screenSize.source})</span>
              </div>
            )}
            {project && (
              <div style={{ marginBottom: 12, padding: 10, background: "rgba(255,255,255,.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)" }}>
                <div className="sectionTitle" style={{ fontSize: 12, marginBottom: 8 }}>Canvas background</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test((project as any).disp_bg_color || "") ? (project as any).disp_bg_color : "#0b0f14"}
                    onChange={(e) => {
                      const hex = e.target.value;
                      setProject({ ...project, disp_bg_color: hex }, true);
                      setProjectDirty(true);
                    }}
                    style={{ width: 42, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={(project as any).disp_bg_color || ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setProject({ ...project, disp_bg_color: v || undefined }, true);
                      setProjectDirty(true);
                    }}
                    placeholder="None (device default)"
                    style={{ flex: 1, fontSize: 12, fontFamily: "ui-monospace, monospace" }}
                  />
                  {((project as any).disp_bg_color) && (
                    <button
                      type="button"
                      className="secondary"
                      style={{ fontSize: 11 }}
                      onClick={() => {
                        const { disp_bg_color: _, ...rest } = project as any;
                        setProject(rest, true);
                        setProjectDirty(true);
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Sets disp_bg_color under lvgl in generated YAML</div>
              </div>
            )}
            {inspectorTab === "properties" && (
              <div>
                <div className="muted">Properties</div>
                {selectedWidgetIds.length === 0 && (
                  <div className="muted">Select a widget on the canvas.</div>
                )}
                {selectedWidgetIds.length === 1 && selectedWidget && (
                  <>
                    <div className="inspectorWidgetId" style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(255,255,255,.06)", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)" }}>
                      <div className="inspectorWidgetIdLabel">Widget ID (YAML)</div>
                      <input
                        type="text"
                        value={editingWidgetId !== "" ? editingWidgetId : selectedWidget.id}
                        onChange={(e) => setEditingWidgetId(e.target.value)}
                        onBlur={() => {
                          const raw = editingWidgetId !== "" ? editingWidgetId : selectedWidget.id;
                          const next = raw.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").trim();
                          if (next && next !== selectedWidget.id) {
                            const result = renameWidgetInProject(project, safePageIndex, selectedWidget.id, next);
                            if (result.ok && result.newId) {
                              setProject(result.project, true);
                              setProjectDirty(true);
                              setSelectedWidgetIds([result.newId]);
                            } else {
                              setToast({ type: "error", msg: result.error || "Cannot rename" });
                            }
                          }
                          setEditingWidgetId("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        placeholder="e.g. living_room_temperature"
                        style={{ width: "100%", marginTop: 6, fontSize: 13, fontFamily: "ui-monospace, monospace" }}
                      />
                    </div>
                    <div className="section" style={{ marginBottom: 12 }}>
                      <div className="sectionTitle" style={{ fontSize: 12 }}>Group</div>
                      {selectedWidget.parent_id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="muted">Parent:</span>
                          <code>{selectedWidget.parent_id}</code>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              if (!project) return;
                              const p2 = clone(project);
                              const pg = (p2 as any).pages?.[safePageIndex];
                              const w = pg?.widgets?.find((x: any) => x?.id === selectedWidget.id);
                              if (w) { w.parent_id = undefined; delete w.parent_id; }
                              setProject(p2, true);
                              setProjectDirty(true);
                            }}
                          >
                            Remove from group
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="muted">Parent: None</span>
                          <select
                            value=""
                            onChange={(e) => {
                              const parentId = e.target.value;
                              if (!parentId || !project) return;
                              const p2 = clone(project);
                              const pg = (p2 as any).pages?.[safePageIndex];
                              const w = pg?.widgets?.find((x: any) => x?.id === selectedWidget.id);
                              if (w) w.parent_id = parentId;
                              setProject(p2, true);
                              setProjectDirty(true);
                              e.target.value = "";
                            }}
                          >
                            <option value="">Add to group…</option>
                            {widgets.filter((w: any) => w?.type === "container" && w?.id !== selectedWidget?.id).map((w: any) => (
                              <option key={w.id} value={w.id}>{w.id}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {selectedWidget.type === "container" && (
                        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                          Children: {widgets.filter((w: any) => w?.parent_id === selectedWidget.id).length}
                        </div>
                      )}
                    </div>
                    {selectedSchema ? (
                      <Inspector widget={selectedWidget} schema={selectedSchema} onChange={updateField} assets={assets} />
                    ) : (
                      <div className="muted">No schema for this widget type.</div>
                    )}
                  </>
                )}
                {selectedWidgetIds.length > 1 && (
                  <MultiSelectProperties
                    widgetIds={selectedWidgetIds}
                    widgets={widgets}
                    project={project}
                    setProject={setProject}
                    setProjectDirty={setProjectDirty}
                    safePageIndex={safePageIndex}
                    clone={clone}
                  />
                )}
              </div>
            )}
            {inspectorTab === "bindings" && (
              <div className="section">
                <div className="sectionTitle">Home Assistant Bindings</div>
                <div className="muted">Generates ESPHome homeassistant sensors.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  <select value={(window as any).__bindDomain || ""} onChange={(e)=>{ (window as any).__bindDomain = e.target.value; setProject(JSON.parse(JSON.stringify(project || {}))); }}>
                    <option value="">(domain)</option>
                    {DOMAIN_PRESETS.map((d)=> <option key={d.domain} value={d.domain}>{d.title}</option>)}
                  </select>
                  <input placeholder="entity_id (e.g. light.kitchen)" value={(window as any).__bindEntity || ""} onChange={(e)=>{ (window as any).__bindEntity = e.target.value; setProject(JSON.parse(JSON.stringify(project || {}))); }} />
                  <button onClick={() => {
                    if (!project) return;
                    const domain = (window as any).__bindDomain || "";
                    const entity_id = (window as any).__bindEntity || "";
                    const preset = DOMAIN_PRESETS.find((x)=>x.domain===domain);
                    if (!preset || !entity_id) return;
                    const p2 = JSON.parse(JSON.stringify(project));
                    (p2 as any).bindings = (p2 as any).bindings || [];
                    for (const b of preset.recommended) { (p2 as any).bindings.push({ ...b, entity_id }); }
                    setProject(p2);
                  }}>Add recommended</button>
                </div>
                <div className="muted" style={{ marginTop: 8 }}>Bindings: {(project as any)?.bindings?.length || 0} • Links: {(project as any)?.links?.length || 0} • Actions: {(project as any)?.action_bindings?.length || 0}</div>
                {(() => {
                  const links = (project as any)?.links || [];
                  const actionBindings = (project as any)?.action_bindings || [];
                  const widgetType = (wid: string) => widgets.find((w: any) => w?.id === wid)?.type || "container";
                  const byType: Record<string, { links: { index: number; ln: any }[]; actions: { index: number; ab: any }[] }> = {};
                  links.forEach((ln: any, idx: number) => {
                    const wid = String(ln?.target?.widget_id || "").trim();
                    const type = widgetType(wid) || "other";
                    if (!byType[type]) byType[type] = { links: [], actions: [] };
                    byType[type].links.push({ index: idx, ln });
                  });
                  actionBindings.forEach((ab: any, idx: number) => {
                    const type = widgetType(String(ab?.widget_id || "")) || "other";
                    if (!byType[type]) byType[type] = { links: [], actions: [] };
                    byType[type].actions.push({ index: idx, ab });
                  });
                  const typeOrder = ["label", "button", "arc", "slider", "dropdown", "switch", "checkbox", "container", "image_button", "other"];
                  const sortedTypes = Object.keys(byType).sort((a, b) => {
                    const ia = typeOrder.indexOf(a);
                    const ib = typeOrder.indexOf(b);
                    if (ia >= 0 && ib >= 0) return ia - ib;
                    if (ia >= 0) return -1;
                    if (ib >= 0) return 1;
                    return a.localeCompare(b);
                  });
                  if (sortedTypes.length === 0) return <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>No links or action bindings yet.</div>;
                  return (
                    <div style={{ marginTop: 12, maxHeight: 360, overflowY: "auto", overflowX: "hidden" }}>
                      <div className="sectionTitle" style={{ fontSize: 13 }}>By widget type</div>
                      {sortedTypes.map((type) => {
                        const group = byType[type];
                        const count = (group.links.length + group.actions.length);
                        const expanded = bindingsListExpanded[type] ?? false;
                        return (
                          <div key={type} style={{ marginBottom: 6, border: "1px solid var(--divider-color, rgba(0,0,0,0.12))", borderRadius: 6, overflow: "hidden" }}>
                            <button
                              type="button"
                              onClick={() => setBindingsListExpanded((prev) => ({ ...prev, [type]: !prev[type] }))}
                              style={{ width: "100%", padding: "8px 10px", textAlign: "left", background: "rgba(255,255,255,.04)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                            >
                              <span>{type}</span>
                              <span className="muted" style={{ fontSize: 11 }}>{count} binding{count !== 1 ? "s" : ""}</span>
                              <span style={{ transform: expanded ? "rotate(180deg)" : "none" }}>▼</span>
                            </button>
                            {expanded && (
                              <ul style={{ margin: 0, padding: "6px 10px 10px 22px", fontSize: 12, lineHeight: 1.6, listStyle: "disc" }}>
                                {group.links.map(({ index, ln }) => {
                                  const src = ln?.source || {};
                                  const tgt = ln?.target || {};
                                  const wid = String(tgt?.widget_id || "").trim();
                                  const ent = String(src?.entity_id || "").trim();
                                  const attr = String(src?.attribute || "").trim();
                                  const action = String(tgt?.action || "").trim();
                                  const isSelected = selectedWidgetIds.includes(wid);
                                  const hasOverride = !!tgt?.yaml_override;
                                  return (
                                    <li key={`l-${index}`} style={isSelected ? { fontWeight: 600 } : {}}>
                                      {hasOverride && <span title="Custom YAML">✎ </span>}
                                      <code>{wid || "(no widget)"}</code>
                                      {" → "}
                                      {ent ? <code>{ent}{attr ? ` [${attr}]` : ""}</code> : "(no entity)"}
                                      {action ? ` · ${action}` : ""}
                                    </li>
                                  );
                                })}
                                {group.actions.map(({ index, ab }) => {
                                  const wid = String(ab?.widget_id || "").trim();
                                  const call = ab?.call || {};
                                  const isSelected = selectedWidgetIds.includes(wid);
                                  const hasOverride = !!ab?.yaml_override;
                                  return (
                                    <li key={`a-${index}`} style={isSelected ? { fontWeight: 600 } : {}}>
                                      {hasOverride && <span title="Custom YAML">✎ </span>}
                                      <code>{wid}</code>
                                      {" · "}
                                      <span className="muted">{ab?.event || "?"}</span>
                                      {" → "}
                                      <code>{call?.domain || "?"}.{call?.service || "?"}</code>
                                      {call?.entity_id ? ` (${call.entity_id})` : ""}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                      {selectedWidgetIds.length > 0 && (
                        <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>Selected widget(s) highlighted. ✎ = custom YAML.</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {inspectorTab === "builder" && (
              <div className="section">
                <div className="sectionTitle">Binding Builder</div>
                <div className="muted">Bind selected widget to HA entity (display or action).</div>
                {selectedWidgetIds.length !== 1 ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Select a single widget on the canvas to see its bindings and add new ones.</div>
                ) : (() => {
                  const widgetId = selectedWidgetIds[0];
                  const selWidget = widgets.find((w: any) => w?.id === widgetId);
                  const widgetType = selWidget?.type || "container";
                  const linksForWidget = ((project as any)?.links || []).filter(
                    (ln: any) => String(ln?.target?.widget_id || "").trim() === widgetId
                  );
                  const actionsForWidget = ((project as any)?.action_bindings || []).filter(
                    (ab: any) => String(ab?.widget_id || "").trim() === widgetId
                  );
                  const displayActions = getDisplayActionsForType(widgetType);
                  const eventOptions = getEventsForType(widgetType);
                  const bindDomain = domainFromEntityId(bindEntity || actionEntity || "");
                  const serviceOptions = getServicesForDomain(bindDomain);
                  const filteredEntities = entities.filter(
                    (e) => !entityQuery || String(e.entity_id).toLowerCase().includes(entityQuery.toLowerCase()) || String(e.friendly_name || "").toLowerCase().includes(entityQuery.toLowerCase())
                  ).slice(0, 200);
                  const selectedEntityAttrs = bindEntity ? (entities.find((x) => x && x.entity_id === bindEntity)?.attributes ? Object.keys(entities.find((x) => x && x.entity_id === bindEntity)!.attributes!).sort() : []) : [];
                  return (
                    <>
                      <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                        <button type="button" className={builderMode === "display" ? "active" : ""} style={{ flex: 1, padding: "6px 8px", fontSize: 12 }} onClick={() => setBuilderMode("display")}>Display</button>
                        <button type="button" className={builderMode === "action" ? "active" : ""} style={{ flex: 1, padding: "6px 8px", fontSize: 12 }} onClick={() => setBuilderMode("action")}>Action</button>
                      </div>
                      <div style={{ marginTop: 10, marginBottom: 10, padding: 8, borderRadius: 4, border: "1px solid var(--divider-color, rgba(0,0,0,0.12))" }}>
                        <div className="sectionTitle" style={{ fontSize: 12, marginBottom: 4 }}>Current bindings for this widget</div>
                        {linksForWidget.length === 0 && actionsForWidget.length === 0 ? (
                          <div className="muted" style={{ fontSize: 12 }}>No bindings. Use the form below to add one.</div>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
                            {linksForWidget.map((ln: any, idx: number) => {
                              const src = ln?.source || {};
                              const tgt = ln?.target || {};
                              const ent = String(src?.entity_id || "").trim();
                              const attr = String(src?.attribute || "").trim();
                              const action = String(tgt?.action || "").trim();
                              const hasOverride = !!tgt?.yaml_override;
                              const isEditing = editingLinkOverride?.widgetId === widgetId && editingLinkOverride?.entityId === ent && editingLinkOverride?.attribute === attr && editingLinkOverride?.action === action;
                              return (
                                <li key={idx}>
                                  {hasOverride && <span title="Custom YAML">✎ </span>}
                                  <code>{ent}{attr ? ` [${attr}]` : ""}</code>{action ? ` → ${action}` : ""}
                                  <button type="button" className="secondary" style={{ marginLeft: 6, fontSize: 10 }} onClick={() => { setEditingLinkOverride({ widgetId, entityId: ent, attribute: attr, action }); setEditingActionOverride(null); setEditingOverrideYaml(tgt?.yaml_override || ""); }}>{isEditing ? "Cancel" : "Edit YAML"}</button>
                                </li>
                              );
                            })}
                            {actionsForWidget.map((ab: any, idx: number) => {
                              const call = ab?.call || {};
                              const hasOverride = !!ab?.yaml_override;
                              const ev = String(ab?.event || "");
                              const isEditing = editingActionOverride?.widgetId === widgetId && editingActionOverride?.event === ev;
                              return (
                                <li key={`a-${idx}`}>
                                  {hasOverride && <span title="Custom YAML">✎ </span>}
                                  <span className="muted">{ab?.event}</span> → <code>{call?.domain}.{call?.service}</code>
                                  <button type="button" className="secondary" style={{ marginLeft: 6, fontSize: 10 }} onClick={() => { setEditingActionOverride({ widgetId, event: ev }); setEditingLinkOverride(null); setEditingOverrideYaml(ab?.yaml_override || ""); }}>{isEditing ? "Cancel" : "Edit YAML"}</button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {(editingLinkOverride?.widgetId === widgetId || editingActionOverride?.widgetId === widgetId) && (
                          <div style={{ marginTop: 8, padding: 8, background: "rgba(255,255,255,.04)", borderRadius: 4 }}>
                            <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Custom YAML (used by compiler instead of generated). Leave empty to use generated.</div>
                            <textarea value={editingOverrideYaml} onChange={(e) => setEditingOverrideYaml(e.target.value)} rows={4} style={{ width: "100%", fontFamily: "monospace", fontSize: 11, boxSizing: "border-box" }} placeholder="e.g. - lvgl.label.update:&#10;    id: my_id&#10;    text: !lambda return x;" />
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <button type="button" onClick={() => {
                                if (!project) return;
                                const p2 = clone(project);
                                if (editingLinkOverride?.widgetId === widgetId) {
                                  const links = (p2 as any).links || [];
                                  const ln = links.find((l: any) => l?.target?.widget_id === editingLinkOverride.widgetId && l?.source?.entity_id === editingLinkOverride.entityId && String(l?.source?.attribute || "") === editingLinkOverride.attribute && l?.target?.action === editingLinkOverride.action);
                                  if (ln?.target) { ln.target = { ...ln.target, yaml_override: editingOverrideYaml.trim() || undefined }; setProject(p2, true); setProjectDirty(true); }
                                }
                                if (editingActionOverride?.widgetId === widgetId) {
                                  const abs = (p2 as any).action_bindings || [];
                                  const ab = abs.find((a: any) => a?.widget_id === editingActionOverride.widgetId && a?.event === editingActionOverride.event);
                                  if (ab) { ab.yaml_override = editingOverrideYaml.trim() || undefined; setProject(p2, true); setProjectDirty(true); }
                                }
                                setEditingLinkOverride(null); setEditingActionOverride(null); setEditingOverrideYaml("");
                              }}>Save</button>
                              <button type="button" className="secondary" onClick={() => { setEditingLinkOverride(null); setEditingActionOverride(null); setEditingOverrideYaml(""); }}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                      {builderMode === "display" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                          <div>
                            <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Entity</div>
                            <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Type to search; pick from list.</div>
                            <input
                              placeholder="Search entities..."
                              value={entityQuery}
                              onChange={(e) => { setEntityQuery(e.target.value); setBuilderEntityDropdownOpen(true); }}
                              onFocus={() => setBuilderEntityDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setBuilderEntityDropdownOpen(false), 180)}
                              style={{ width: "100%", boxSizing: "border-box" }}
                            />
                            {builderEntityDropdownOpen && (
                              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--divider-color)", borderRadius: 4, marginTop: 2, background: "var(--panel-bg, #1e293b)" }}>
                                {filteredEntities.map((e) => (
                                  <div
                                    key={e.entity_id}
                                    onClick={() => { setBindEntity(e.entity_id); setEntityQuery(""); setBindAttr(""); setBuilderEntityDropdownOpen(false); }}
                                    style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.06)" }}
                                  >
                                    {e.entity_id}{e.friendly_name ? ` — ${e.friendly_name}` : ""}
                                  </div>
                                ))}
                                {filteredEntities.length === 0 && <div className="muted" style={{ padding: 8, fontSize: 12 }}>No matching entities.</div>}
                              </div>
                            )}
                            {bindEntity && <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>Selected: {bindEntity}</div>}
                          </div>
                          <div>
                            <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Attribute</div>
                            <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>HA state or entity attribute to show.</div>
                            <select value={bindAttr} onChange={(e)=>setBindAttr(e.target.value)} style={{ width: "100%" }}>
                              <option value="">(state)</option>
                              {selectedEntityAttrs.map((k)=> <option key={k} value={k}>{k}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Update widget</div>
                            <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Which property of this {widgetType} gets the value.</div>
                            <select value={displayActions.includes(bindAction as any) ? bindAction : (displayActions[0] || "label_text")} onChange={(e)=>setBindAction(e.target.value)} style={{ width: "100%" }}>
                              {displayActions.map((act) => (
                                <option key={act} value={act}>{DISPLAY_ACTION_LABELS[act]}</option>
                              ))}
                            </select>
                          </div>
                          {(bindAction === "label_text" || bindAction === "arc_value" || bindAction === "slider_value") && (
                            <>
                              <div>
                                <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Format</div>
                                <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Printf-style for displayed text (e.g. %.1f or %.1f°).</div>
                                <input value={bindFormat} onChange={(e)=>setBindFormat(e.target.value)} placeholder="%.1f" style={{ width: "100%", boxSizing: "border-box" }} />
                              </div>
                              <div>
                                <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Scale</div>
                                <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Multiply numeric value (e.g. 100 for 0–1 → 0–100).</div>
                                <input type="number" value={bindScale} onChange={(e)=>setBindScale(Number(e.target.value || 1))} step="0.1" style={{ width: "100%", boxSizing: "border-box" }} />
                              </div>
                            </>
                          )}
                          <button disabled={!project || !selectedWidgetIds.length || !bindEntity} onClick={() => {
                            if (!project) return;
                            const wid = selectedWidgetIds[0];
                            const ent = bindEntity; const attr = bindAttr;
                            const act = displayActions.includes(bindAction as any) ? bindAction : (displayActions[0] || "label_text");
                            const p2 = clone(project);
                            (p2 as any).bindings = (p2 as any).bindings || [];
                            (p2 as any).links = (p2 as any).links || [];
                            let kind: any = "state";
                            if (act === "widget_checked") kind = "binary";
                            else if (attr) kind = "attribute_number";
                            const v = entities.find((x)=>x.entity_id===ent)?.attributes?.[attr];
                            if (attr && (typeof v === "string" || Array.isArray(v) || (v && typeof v === "object"))) kind = "attribute_text";
                            if (!attr && act === "label_text") kind = "state";
                            (p2 as any).bindings.push({ entity_id: ent, kind, attribute: attr || undefined });
                            (p2 as any).links.push({ source: { entity_id: ent, kind, attribute: attr || "" }, target: { widget_id: wid, action: act, format: bindFormat, scale: bindScale } });
                            const pageWidgets = (p2 as any).pages?.[safePageIndex]?.widgets || [];
                            const usedIds = new Set(pageWidgets.map((w: any) => w?.id).filter(Boolean));
                            const friendlyId = friendlyWidgetIdFromBinding(ent, attr || "state", usedIds);
                            const renameResult = renameWidgetInProject(p2, safePageIndex, wid, friendlyId);
                            if (renameResult.ok && renameResult.newId) {
                              setProject(renameResult.project, true);
                              setSelectedWidgetIds([renameResult.newId]);
                            } else {
                              setProject(p2, true);
                            }
                            setProjectDirty(true);
                          }}>Add display binding</button>
                        </div>
                      )}
                      {builderMode === "action" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                          {eventOptions.length === 0 ? (
                            <div className="muted" style={{ fontSize: 12 }}>This widget type ({widgetType}) has no events for action bindings.</div>
                          ) : (
                            <>
                              <div>
                                <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Event</div>
                                <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>When the user does this on the device.</div>
                                <select value={eventOptions.includes(actionEvent) ? actionEvent : eventOptions[0]} onChange={(e)=>setActionEvent(e.target.value)} style={{ width: "100%" }}>
                                  {eventOptions.map((ev) => (
                                    <option key={ev} value={ev}>{EVENT_LABELS[ev] || ev}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Entity</div>
                                <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>HA entity to call the service on.</div>
                                <input
                                  placeholder="e.g. switch.living_room"
                                  value={actionEntity}
                                  onChange={(e) => setActionEntity(e.target.value)}
                                  style={{ width: "100%", boxSizing: "border-box" }}
                                />
                                {linksForWidget.length > 0 && (
                                  <button type="button" className="secondary" style={{ marginTop: 4, fontSize: 11 }} onClick={() => setActionEntity(linksForWidget[0]?.source?.entity_id || "")}>Use same as display binding</button>
                                )}
                              </div>
                              <div>
                                <div className="fieldLabel" style={{ fontSize: 11, marginBottom: 2 }}>Service</div>
                                <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>Only services relevant to the entity domain are shown.</div>
                                <select value={actionService} onChange={(e)=>setActionService(e.target.value)} style={{ width: "100%" }}>
                                  <option value="">(select service)</option>
                                  {serviceOptions.map((opt) => (
                                    <option key={opt.service} value={opt.service}>{opt.label} ({opt.service})</option>
                                  ))}
                                </select>
                              </div>
                              <button disabled={!project || !selectedWidgetIds.length || !actionService || !actionEntity} onClick={() => {
                                if (!project) return;
                                const wid = selectedWidgetIds[0];
                                const [domain, service] = actionService.split(".");
                                if (!domain || !service) return;
                                const p2 = clone(project);
                                (p2 as any).action_bindings = (p2 as any).action_bindings || [];
                                (p2 as any).action_bindings.push({
                                  widget_id: wid,
                                  event: eventOptions.includes(actionEvent) ? actionEvent : eventOptions[0],
                                  call: { domain, service, entity_id: actionEntity },
                                });
                                setProject(p2, true);
                                setProjectDirty(true);
                              }}>Add action binding</button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function styleValueToCss(v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v >= 0 && v <= 0xffffff) return "#" + v.toString(16).padStart(6, "0");
  return String(v);
}
function cssToStyleValue(css: string): number | string {
  const t = css.trim();
  if (!t) return "";
  const m = /^#?([0-9a-fA-F]{6})$/.exec(t);
  if (m) return parseInt(m[1], 16);
  return t;
}

function intersection<T>(sets: T[][]): T[] {
  if (sets.length === 0) return [];
  let result = sets[0] || [];
  for (let i = 1; i < sets.length; i++) {
    const s = new Set(sets[i] || []);
    result = result.filter((x) => s.has(x));
  }
  return result;
}

function MultiSelectProperties(props: {
  widgetIds: string[];
  widgets: any[];
  project: any;
  setProject: (p: any, fromStorage?: boolean) => void;
  setProjectDirty: (d: boolean) => void;
  safePageIndex: number;
  clone: (x: any) => any;
}) {
  const { widgetIds, widgets, project, setProject, setProjectDirty, safePageIndex, clone } = props;
  const sel = widgets.filter((w: any) => w && widgetIds.includes(w.id));
  const [schemasByType, setSchemasByType] = useState<Record<string, WidgetSchema>>({});
  const [schemasLoading, setSchemasLoading] = useState(false);

  const selectedTypesKey = useMemo(() => sel.map((w: any) => w.type).filter(Boolean).sort().join(","), [widgetIds.join(","), widgets.length]);
  useEffect(() => {
    if (sel.length === 0) {
      setSchemasByType({});
      return;
    }
    const types = Array.from(new Set(sel.map((w: any) => w.type).filter(Boolean)));
    if (types.length === 0) {
      setSchemasByType({});
      return;
    }
    let cancelled = false;
    setSchemasLoading(true);
    Promise.all(types.map((t) => getWidgetSchema(t).then((r) => (r.ok ? r.schema : null))))
      .then((schemas) => {
        if (cancelled) return;
        const byType: Record<string, WidgetSchema> = {};
        types.forEach((t, i) => {
          if (schemas[i]) byType[t] = schemas[i] as WidgetSchema;
        });
        setSchemasByType(byType);
      })
      .finally(() => {
        if (!cancelled) setSchemasLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedTypesKey]);

  if (sel.length === 0) return <div className="muted">No widgets found.</div>;
  const first = sel[0];
  const commonX = Number(first.x ?? 0);
  const commonY = Number(first.y ?? 0);
  const commonW = Number(first.w ?? 0);
  const commonH = Number(first.h ?? 0);

  const schemaList = Object.values(schemasByType);
  const commonStyleKeys = schemaList.length > 0
    ? intersection(schemaList.map((s) => Object.keys((s as any).style || {})))
    : [];
  const commonPropsKeys = schemaList.length > 0
    ? intersection(schemaList.map((s) => Object.keys((s as any).props || {})))
    : [];

  const patchAll = (key: string, value: number) => {
    if (!project || Number.isNaN(value)) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    for (const w of page.widgets) {
      if (w && widgetIds.includes(w.id)) (w as any)[key] = value;
    }
    setProject(p2, true);
    setProjectDirty(true);
  };

  const patchAllStyle = (key: string, value: number | string) => {
    if (!project) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    for (const w of page.widgets) {
      if (!w || !widgetIds.includes(w.id)) continue;
      if (w.style == null) w.style = {};
      if (value === "" || value == null) {
        delete w.style[key];
      } else {
        (w.style as any)[key] = value;
      }
    }
    setProject(p2, true);
    setProjectDirty(true);
  };

  const patchAllProps = (key: string, value: any) => {
    if (!project) return;
    const p2 = clone(project);
    const page = (p2 as any).pages?.[safePageIndex];
    if (!page?.widgets) return;
    for (const w of page.widgets) {
      if (!w || !widgetIds.includes(w.id)) continue;
      if (w.props == null) w.props = {};
      if (value === "" || value == null || value === undefined) {
        delete w.props[key];
      } else {
        (w.props as any)[key] = value;
      }
    }
    setProject(p2, true);
    setProjectDirty(true);
  };

  const getFirstDef = (section: "style" | "props", key: string): any => {
    for (const s of schemaList) {
      const sec = (s as any)[section];
      if (sec && sec[key]) return sec[key];
    }
    return null;
  };

  const renderCommonStyleField = (key: string) => {
    const def = getFirstDef("style", key);
    const firstStyle = first.style || {};
    const val = firstStyle[key] ?? first.props?.[key];
    const title = def?.title ?? key;
    if (def?.type === "color" || key === "bg_color" || key === "text_color" || key === "border_color") {
      const css = styleValueToCss(val);
      const hexForPicker = /^#[0-9a-fA-F]{6}$/.test(css) ? css : "#000000";
      return (
        <div key={key} className="field">
          <div className="fieldLabel">{title}</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="color"
              value={hexForPicker}
              onChange={(e) => patchAllStyle(key, cssToStyleValue(e.target.value))}
              style={{ width: 42, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            />
            <input
              type="text"
              placeholder="#rrggbb"
              value={css}
              onChange={(e) => patchAllStyle(key, cssToStyleValue(e.target.value))}
              style={{ marginLeft: 8 }}
            />
          </div>
        </div>
      );
    }
    if (def?.type === "number") {
      const n = Number(val ?? def?.default ?? 0);
      return (
        <div key={key} className="field">
          <div className="fieldLabel">{title}</div>
          <input type="number" value={n} min={def?.min} max={def?.max} step={def?.step ?? 1} onChange={(e) => patchAllStyle(key, Number(e.target.value))} />
        </div>
      );
    }
    return (
      <div key={key} className="field">
        <div className="fieldLabel">{title}</div>
        <input type="text" value={String(val ?? "")} onChange={(e) => patchAllStyle(key, e.target.value || undefined)} />
      </div>
    );
  };

  const renderCommonPropsField = (key: string) => {
    const def = getFirstDef("props", key);
    const firstProps = first.props || {};
    const val = firstProps[key];
    const title = def?.title ?? key;
    if (def?.type === "number") {
      const n = Number(val ?? def?.default ?? 0);
      return (
        <div key={key} className="field">
          <div className="fieldLabel">{title}</div>
          <input type="number" value={n} min={def?.min} max={def?.max} step={def?.step ?? 1} onChange={(e) => patchAllProps(key, Number(e.target.value))} />
        </div>
      );
    }
    if (def?.type === "boolean") {
      return (
        <div key={key} className="field">
          <div className="fieldLabel">{title}</div>
          <select value={String(!!val)} onChange={(e) => patchAllProps(key, e.target.value === "true")}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      );
    }
    return (
      <div key={key} className="field">
        <div className="fieldLabel">{title}</div>
        <input type="text" value={String(val ?? "")} onChange={(e) => patchAllProps(key, e.target.value || undefined)} />
      </div>
    );
  };

  return (
    <div className="section">
      <div className="muted" style={{ marginBottom: 8 }}>{widgetIds.length} widgets selected</div>
      <div className="sectionTitle" style={{ fontSize: 12 }}>Common layout</div>
      <div className="field">
        <div className="fieldLabel">X</div>
        <input type="number" value={commonX} onChange={(e) => patchAll("x", Number(e.target.value))} />
      </div>
      <div className="field">
        <div className="fieldLabel">Y</div>
        <input type="number" value={commonY} onChange={(e) => patchAll("y", Number(e.target.value))} />
      </div>
      <div className="field">
        <div className="fieldLabel">Width</div>
        <input type="number" value={commonW} onChange={(e) => patchAll("w", Number(e.target.value))} />
      </div>
      <div className="field">
        <div className="fieldLabel">Height</div>
        <input type="number" value={commonH} onChange={(e) => patchAll("h", Number(e.target.value))} />
      </div>
      <div className="sectionTitle" style={{ fontSize: 12, marginTop: 12 }}>Common style</div>
      {schemasLoading ? (
        <div className="muted" style={{ fontSize: 12 }}>Loading…</div>
      ) : commonStyleKeys.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No style properties common to all selected widget types.</div>
      ) : (
        commonStyleKeys.map(renderCommonStyleField)
      )}
      {!schemasLoading && commonPropsKeys.length > 0 && (
        <>
          <div className="sectionTitle" style={{ fontSize: 12, marginTop: 12 }}>Common props</div>
          {commonPropsKeys.map(renderCommonPropsField)}
        </>
      )}
      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Other properties vary; select one widget to edit.</div>
    </div>
  );
}

// ESPHome LVGL built-in fonts (Montserrat). User can pick these without uploading assets.
const BUILTIN_LVGL_FONTS = ["montserrat_8","montserrat_10","montserrat_12","montserrat_14","montserrat_16","montserrat_18","montserrat_20","montserrat_22","montserrat_24","montserrat_26","montserrat_28","montserrat_30","montserrat_32","montserrat_34","montserrat_36","montserrat_38","montserrat_40","montserrat_42","montserrat_44","montserrat_46","montserrat_48"];

function Inspector(props: { widget: any; schema: WidgetSchema; onChange: (section: any, key: string, value: any) => void; assets: {name:string; size:number}[] }) {
  const { widget, schema, onChange, assets } = props;
  const fontFiles = (assets || []).map(a=>a.name).filter(n=>/\.(ttf|otf)$/i.test(n));
  const fontSizes = [10,12,14,16,18,20,24,28,32,36,40];

  const [fieldFilter, setFieldFilter] = useState<string>("");
  const [modifiedOnly, setModifiedOnly] = useState<boolean>(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const groups = (schema as any).groups as Record<string, { section: string; keys: string[]; defaultCollapsed?: boolean }> | undefined;
  const groupNames = groups ? Object.keys(groups) : [];
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (groups) {
      for (const name of Object.keys(groups)) {
        const gr = groups[name];
        init[name] = !(gr && (gr as any).defaultCollapsed);
      }
    }
    return init;
  });

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
    // Value can be: built-in id (montserrat_16), asset descriptor (asset:file.ttf:24), or custom id.
    if (key === "font") {
      const raw = String(value ?? "").trim();
      const isAsset = raw.startsWith("asset:");
      const isBuiltin = BUILTIN_LVGL_FONTS.includes(raw);
      let curFile = "";
      let curSize = 16;
      if (isAsset) {
        try {
          const rest = raw.slice("asset:".length);
          const parts = rest.split(":");
          curFile = parts.slice(0, -1).join(":") || "";
          curSize = parseInt(parts[parts.length - 1] || "16", 10) || 16;
        } catch {}
      } else if (raw.startsWith("montserrat_")) {
        const m = raw.match(/montserrat_(\d+)$/);
        curSize = m ? parseInt(m[1], 10) || 16 : 16;
      }
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={isBuiltin ? raw : (isAsset ? `asset:${curFile}` : "")}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return onChange(section, key, undefined);
                if (v.startsWith("asset:")) {
                  const fn = v.slice(6);
                  if (fn) onChange(section, key, `asset:${fn}:${curSize}`);
                } else {
                  onChange(section, key, v);
                }
              }}
              style={{ minWidth: 140 }}
            >
              <option value="">(default)</option>
              <optgroup label="Built-in (Montserrat)">
                {BUILTIN_LVGL_FONTS.map((f) => (
                  <option key={f} value={f}>{f.replace("montserrat_", "")}px</option>
                ))}
              </optgroup>
              {fontFiles.length > 0 && (
                <optgroup label="Uploaded assets">
                  {fontFiles.map((fn) => (
                    <option key={fn} value={`asset:${fn}`}>{fn}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {isAsset && curFile && (
              <>
                <input
                  type="number"
                  value={curSize}
                  min={6}
                  max={96}
                  onChange={(e) => {
                    const n = parseInt(e.target.value || "16", 10) || 16;
                    onChange(section, key, `asset:${curFile}:${n}`);
                  }}
                  style={{ width: 60 }}
                />
                <span className="muted" style={{ fontSize: 12 }}>px</span>
              </>
            )}
            {resetBtn}{clearBtn}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="text"
              value={!isBuiltin && !isAsset ? raw : ""}
              onChange={(e) => onChange(section, key, e.target.value.trim() || undefined)}
              placeholder="Or type custom font id (e.g. roboto_16)"
              style={{ flex: 1, fontSize: 12 }}
            />
          </div>
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
      {groups && groupNames.length > 0
        ? groupNames.map((groupName) => {
            const gr = groups[groupName];
            const section = (gr?.section || "props") as "props" | "style" | "events";
            const keys = Array.isArray(gr?.keys) ? gr.keys : [];
            const fields = (schema as any)[section] || {};
            const entriesAll = keys.map((k) => [k, fields[k]]).filter(([, def]) => def);
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
            const expanded = groupExpanded[groupName] !== false;
            return (
              <div key={groupName} className="section" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="sectionTitle"
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: "rgba(255,255,255,.04)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", marginBottom: expanded ? 8 : 0, fontWeight: 600 }}
                  onClick={() => setGroupExpanded((prev) => ({ ...prev, [groupName]: !expanded }))}
                >
                  <span>{groupName}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{expanded ? "▼" : "▶"}</span>
                </button>
                {expanded && (
                  <div style={{ paddingLeft: 4 }}>
                    {entries.map(([k, def]: [string, any]) => (
                      <div key={k} className="field" style={{ marginBottom: 10 }}>
                        <div className="fieldLabel" title={def.description || def.desc || ""}>{def.title ?? k}</div>
                        {renderField(section, k, def)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        : <>
            {renderSection("Props", "props", schema.props)}
            {renderSection("Style", "style", schema.style)}
            {renderSection("Events", "events", schema.events)}
          </>
      }
    </div>
  );
}
