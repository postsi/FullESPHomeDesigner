/**
 * Section-based ESPHome Components panel. Uses project.sections (full section YAML).
 * Compiler concatenates stored sections; Reset = default, Save = store to project.
 */
import React, { useCallback, useEffect, useState } from "react";
import { getSectionsDefaults } from "./lib/apiSections";
import { parseYamlSyntax } from "./lib/api";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export type SectionBasedComponentsPanelProps = {
  project: any;
  setProject: (p: any, commit?: boolean) => void;
  setProjectDirty: (dirty: boolean) => void;
  onClose: () => void;
  /** When provided, called with the updated project after saving so the app can persist to the server. Returns a Promise that resolves when done (so panel can clear local dirty). */
  onSaveAndPersist?: (updatedProject: any) => void | Promise<void>;
};

export default function SectionBasedComponentsPanel({
  project,
  setProject,
  setProjectDirty,
  onClose,
  onSaveAndPersist,
}: SectionBasedComponentsPanelProps) {
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [overriddenKeys, setOverriddenKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);

  const recipeId = (project?.device?.hardware_recipe_id ?? project?.hardware?.recipe_id ?? "").trim() || "sunton_2432s028r_320x240";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSectionsDefaults(project, recipeId)
      .then(({ sections: effective, categories: cat, default_sections: defSections, overridden_keys: ovKeys }) => {
        if (cancelled) return;
        setDefaults(defSections);
        setCategories(cat);
        setOverriddenKeys(new Set(Array.isArray(ovKeys) ? ovKeys : []));
        setSections(effective);
        setHasLocalEdits(false);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load section defaults");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [project, recipeId]);

  const setSectionContent = useCallback((key: string, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }));
    setHasLocalEdits(true);
    setSyntaxError(null);
  }, []);

  const resetSection = useCallback((key: string) => {
    setSections((prev) => ({ ...prev, [key]: (defaults[key] || "").trim() }));
    setOverriddenKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setHasLocalEdits(true);
  }, [defaults]);

  const saveAll = useCallback(async () => {
    setSyntaxError(null);
    for (const k of Object.keys(sections)) {
      const content = (sections[k] ?? "").trim();
      if (!content) continue;
      const result = await parseYamlSyntax(content);
      if (!result.ok) {
        setSyntaxError(`${k}: ${result.error || "Invalid YAML"}${result.line != null ? ` (line ${result.line})` : ""}`);
        return;
      }
    }
    const p2 = clone(project);
    p2.sections = { ...(p2.sections || {}), ...sections };
    if (p2.section_overrides !== undefined) delete p2.section_overrides;
    setProject(p2, true);
    setProjectDirty(true);
    setOverriddenKeys((prev) => {
      const next = new Set(prev);
      for (const k of Object.keys(sections)) {
        const c = (sections[k] ?? "").trim();
        const d = (defaults[k] ?? "").trim();
        if (c !== d) next.add(k);
        else next.delete(k);
      }
      return next;
    });
    if (onSaveAndPersist) {
      setSaving(true);
      try {
        await onSaveAndPersist(p2);
        setHasLocalEdits(false);
      } finally {
        setSaving(false);
      }
    }
  }, [project, sections, defaults, setProject, setProjectDirty, onSaveAndPersist]);

  const saveSection = useCallback(async (key: string) => {
    setSyntaxError(null);
    const content = (sections[key] ?? "").trim();
    if (content) {
      const result = await parseYamlSyntax(content);
      if (!result.ok) {
        setSyntaxError(`${key}: ${result.error || "Invalid YAML"}${result.line != null ? ` (line ${result.line})` : ""}`);
        return;
      }
    }
    const p2 = clone(project);
    p2.sections = { ...(p2.sections || {}), [key]: content };
    if (p2.section_overrides !== undefined) delete p2.section_overrides;
    setProject(p2, true);
    setProjectDirty(true);
    setOverriddenKeys((prev) => {
      const next = new Set(prev);
      const d = (defaults[key] ?? "").trim();
      if (content !== d) next.add(key);
      else next.delete(key);
      return next;
    });
    if (onSaveAndPersist) {
      setSaving(true);
      try {
        await onSaveAndPersist(p2);
      } finally {
        setSaving(false);
      }
    }
  }, [project, sections, defaults, setProject, setProjectDirty, onSaveAndPersist]);

  const resetAll = useCallback(() => {
    setSections({ ...defaults });
    setOverriddenKeys(new Set());
    setHasLocalEdits(true);
  }, [defaults]);

  const requestClose = useCallback(() => {
    if (hasLocalEdits && !window.confirm("You have unsaved changes. Close anyway?")) return;
    onClose();
  }, [hasLocalEdits, onClose]);

  const categoryOrder = [
    "Device & platform",
    "Configuration",
    "Network",
    "Bluetooth",
    "Busses & interfaces",
    "Display & touch",
    "Automation & logic",
    "Sensors & entities",
    "Audio",
    "Debug & monitoring",
    "I/O expanders",
    "Other",
  ];

  return (
    <div className="modalOverlay" onClick={requestClose}>
      <div
        className="modal"
        style={{
          maxWidth: 700,
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="title">ESPHome Components</div>
          <button className="ghost" onClick={requestClose} type="button">
            ✕
          </button>
        </div>
        <div className="muted" style={{ padding: "0 16px 12px", fontSize: 12 }}>
          Edit top-level ESPHome sections. <span style={{ color: "rgba(255,255,255,0.6)" }}>Auto</span> = from recipe/compiler; <span style={{ color: "rgba(100,180,255,0.95)" }}>Edited</span> = your changes. Reset = back to default; Save = store to project. Compiler uses stored sections.
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>
          {loading && (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>
              Loading sections…
            </div>
          )}
          {error && (
            <div style={{ padding: 12, background: "rgba(200,80,80,0.2)", borderRadius: 6, marginBottom: 12 }}>
              {error}
            </div>
          )}
          {syntaxError && (
            <div style={{ padding: 12, background: "rgba(200,80,80,0.2)", borderRadius: 6, marginBottom: 12 }}>
              YAML syntax: {syntaxError}
            </div>
          )}
          {!loading && !error && (
            <>
              {categoryOrder.map((catLabel) => {
                const keys = categories[catLabel] || [];
                const withContent = keys.filter((k) => (sections[k] ?? "").trim().length > 0);
                return (
                  <details key={catLabel} style={{ marginBottom: 12 }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 500,
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {catLabel} ({withContent.length})
                    </summary>
                    <div style={{ padding: "8px 0" }}>
                      {keys.map((sectionKey) => {
                        const content = (sections[sectionKey] ?? "").trim();
                        const isEmpty = content.length === 0;
                        const isUserEdited = overriddenKeys.has(sectionKey);
                        const bgSection = isUserEdited ? "rgba(100,160,255,0.08)" : "rgba(255,255,255,0.03)";
                        const borderSection = isUserEdited ? "1px solid rgba(100,160,255,0.25)" : "1px solid rgba(255,255,255,0.08)";
                        return (
                          <details
                            key={sectionKey}
                            style={{
                              marginBottom: 8,
                              background: bgSection,
                              borderRadius: 6,
                              border: borderSection,
                            }}
                          >
                            <summary
                              style={{
                                cursor: "pointer",
                                fontSize: 12,
                                padding: "8px 10px",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <code style={{ fontWeight: 600 }}>{sectionKey}</code>
                              {isEmpty && (
                                <span className="muted" style={{ fontSize: 10 }}>Empty</span>
                              )}
                              {!isEmpty && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                    background: isUserEdited ? "rgba(100,160,255,0.25)" : "rgba(255,255,255,0.12)",
                                    color: isUserEdited ? "rgba(200,220,255,0.95)" : "rgba(255,255,255,0.65)",
                                  }}
                                >
                                  {isUserEdited ? "Edited" : "Auto"}
                                </span>
                              )}
                            </summary>
                            <div style={{ padding: "0 10px 10px" }}>
                              {isEmpty && (
                                <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>No content (recipe/compiler did not emit this section). Add YAML below to override.</div>
                              )}
                              <textarea
                                value={sections[sectionKey] ?? ""}
                                onChange={(e) => setSectionContent(sectionKey, e.target.value)}
                                placeholder={`${sectionKey}:\n  # ...`}
                                style={{
                                  width: "100%",
                                  minHeight: 100,
                                  fontFamily: "ui-monospace, monospace",
                                  fontSize: 11,
                                  padding: 8,
                                  borderRadius: 4,
                                  border: isUserEdited ? "1px solid rgba(100,160,255,0.2)" : "1px solid rgba(255,255,255,0.15)",
                                  background: isUserEdited ? "rgba(100,160,255,0.05)" : "rgba(0,0,0,0.2)",
                                  color: "#e2e8f0",
                                  resize: "vertical",
                                }}
                              />
                              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="secondary"
                                  style={{ fontSize: 11 }}
                                  onClick={() => resetSection(sectionKey)}
                                >
                                  Reset
                                </button>
                                <button
                                  type="button"
                                  className="primary"
                                  style={{ fontSize: 11 }}
                                  onClick={() => saveSection(sectionKey)}
                                  disabled={saving}
                                >
                                  {saving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="secondary" onClick={requestClose}>
            Close
          </button>
          <button type="button" className="secondary" onClick={resetAll} disabled={loading}>
            Reset all
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => saveAll()}
            disabled={loading || saving}
          >
            {saving ? "Saving…" : "Save all"}
          </button>
        </div>
      </div>
    </div>
  );
}
