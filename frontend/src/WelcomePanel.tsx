import React from "react";

export interface WelcomePanelProps {
  /** Called when user wants to focus/use the device selector (e.g. scroll to nav). */
  onSelectDevice: () => void;
  /** Called when user clicks "Create new project" (New device wizard). */
  onNewDevice: () => void;
  /** Called when user clicks "Open example project" (e.g. New device with recipe or import). */
  onOpenExample: () => void;
  /** Whether any devices exist (to tailor copy). */
  hasDevices: boolean;
  /** Optional: recent project entries for quick resume (not implemented yet). */
  recentProjects?: { deviceId: string; name: string }[];
}

export default function WelcomePanel({
  onSelectDevice,
  onNewDevice,
  onOpenExample,
  hasDevices,
  recentProjects = [],
}: WelcomePanelProps) {
  return (
    <div
      className="welcomePanel"
      style={{
        padding: 32,
        maxWidth: 560,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <p className="muted" style={{ fontSize: 15, margin: 0, lineHeight: 1.5 }}>
        ESPHome Touch Designer lets you design LVGL touch screens for your ESPHome devices. Choose a device, load or create a project, then design screens and bind them to Home Assistant.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="primary" onClick={onSelectDevice} style={{ padding: "12px 16px", fontSize: 15 }}>
            {hasDevices ? "Select device" : "Select device (create one first if needed)"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Use the device dropdown in the bar above to pick an ESPHome device. Its project will load when you select it.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="secondary" onClick={onNewDevice} style={{ padding: "12px 16px", fontSize: 15 }}>
            Create new project
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Add a new device with a hardware profile (recipe). You can then design its screens and deploy.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="secondary" onClick={onOpenExample} style={{ padding: "12px 16px", fontSize: 15 }}>
            Open example / from recipe
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Create a device from a built-in or imported recipe to get a ready-made project you can customise.
          </span>
        </div>
      </div>
      {recentProjects.length > 0 && (
        <div className="section" style={{ marginTop: 8 }}>
          <div className="sectionTitle">Recent projects</div>
          <ul className="list compact" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {recentProjects.map((p) => (
              <li key={p.deviceId}>
                <button type="button" className="ghost" onClick={onSelectDevice} style={{ textAlign: "left", width: "100%" }}>
                  {p.name || p.deviceId}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
