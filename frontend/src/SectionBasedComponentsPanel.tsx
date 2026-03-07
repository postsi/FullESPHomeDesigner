/**
 * Section-based ESPHome Components panel. Loaded lazily so section API code
 * is not in the main bundle (avoids "Cannot access 'ut' before initialization").
 * Uses project.section_overrides; compile merges overrides with recipe + compiler.
 */
import React, { useCallback, useEffect, useState } from "react";
import { getSectionsDefaults } from "./lib/apiSections";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export type SectionBasedComponentsPanelProps = {
  project: any;
  setProject: (p: any, commit?: boolean) => void;
  setProjectDirty: (dirty: boolean) => void;
  onClose: () => void;
  /** When provided, called with the updated project after saving so the app can persist to the server. */
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

  const recipeId = (project?.device?.hardware_recipe_id ?? project?.hardware?.recipe_id ?? "").trim() || "sunton_2432s028r_320x240";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSectionsDefaults(project, recipeId)
      .then(({ sections: effective, categories: cat, overridden_keys: ovKeys, default_sections: defSections }) => {
        if (cancelled) return;
        setDefaults(defSections);
        setCategories(cat);
        setOverriddenKeys(new Set(ovKeys));
        setSections(effective);
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
  }, []);

  const resetSection = useCallback((key: string) => {
    setSections((prev) => ({ ...prev, [key]: (defaults[key] || "").trim() }));
  }, [defaults]);

  const save = useCallback(() => {
    const overrides: Record<string, string> = {};
    const allKeys = new Set([...Object.keys(defaults), ...Object.keys(sections)]);
    for (const k of allKeys) {
      const eff = (sections[k] ?? "").trim();
      const def = (defaults[k] ?? "").trim();
      if (eff !== def) overrides[k] = eff;
    }
    const p2 = clone(project);
    p2.section_overrides = overrides;
    setProject(p2, true);
    setProjectDirty(true);
    onClose();
    // Persist to server so section overrides are actually saved (panel Save used to only update local state).
    onSaveAndPersist?.(p2);
  }, [project, defaults, sections, setProject, setProjectDirty, onClose, onSaveAndPersist]);

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
    <div className="modalOverlay" onClick={onClose}>
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
          <button className="ghost" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="muted" style={{ padding: "0 16px 12px", fontSize: 12 }}>
          Edit top-level ESPHome sections. <span style={{ color: "rgba(255,255,255,0.6)" }}>Auto</span> = from recipe/compiler; <span style={{ color: "rgba(100,180,255,0.95)" }}>Edited</span> = your overrides. Saved as section overrides at compile time.
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
                        const isUserEdited = overriddenKeys.has(sectionKey);
                        const isEmpty = content.length === 0;
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
                              {isUserEdited && (
                                <button
                                  type="button"
                                  className="secondary"
                                  style={{ marginTop: 6, fontSize: 11 }}
                                  onClick={() => resetSection(sectionKey)}
                                >
                                  Reset to default
                                </button>
                              )}
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
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            style={{ marginLeft: 8 }}
            onClick={save}
            disabled={loading}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
