import React from "react";
import type { DeviceSummary } from "./api";

export interface WelcomePanelProps {
  /** List of devices to show; user clicks one to load it. */
  devices: DeviceSummary[];
  /** Called when user clicks a device row to load that device. */
  onLoadDevice: (deviceId: string) => void;
  /** Called when user clicks "Add device". */
  onAddDevice: () => void;
  /** Called when user clicks "Manage devices" (opens manage modal). */
  onManageDevices: () => void;
  /** Optional: recipe labels by id for display (e.g. { "jc1060...": "JC1060 4.7\" 1024×600" }). */
  recipeLabels?: Record<string, string>;
}

export default function WelcomePanel({
  devices,
  onLoadDevice,
  onAddDevice,
  onManageDevices,
  recipeLabels = {},
}: WelcomePanelProps) {
  return (
    <div
      className="welcomePanel"
      style={{
        padding: 32,
        maxWidth: 600,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <p className="muted" style={{ fontSize: 15, margin: 0, lineHeight: 1.5 }}>
        Design LVGL touch screen UIs for your ESPHome devices. Select or add a device, then design its screen and bind it to Home Assistant.
      </p>

      {devices.length > 0 ? (
        <div className="section" style={{ marginTop: 0 }}>
          <div className="sectionTitle">Devices</div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Click a device to open its UI.
          </p>
          <ul className="list compact" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {devices.map((d) => (
              <li key={d.device_id}>
                <button
                  type="button"
                  className="row"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border, #333)",
                    background: "rgba(255,255,255,0.03)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    alignItems: "flex-start",
                  }}
                  onClick={() => onLoadDevice(d.device_id)}
                >
                  <span style={{ fontWeight: 600 }}>{d.name || d.device_id}</span>
                  {d.hardware_recipe_id && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {recipeLabels[d.hardware_recipe_id] || d.hardware_recipe_id}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 14 }}>
          No devices yet. Add a device to get started.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="primary" onClick={onAddDevice} style={{ padding: "12px 16px", fontSize: 15 }}>
            Add device
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Add a device by choosing a hardware recipe (built-in or imported). You then design its screen and deploy. Creating new hardware recipes is done elsewhere.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="secondary" onClick={onManageDevices} style={{ padding: "12px 16px", fontSize: 15 }}>
            Manage devices
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Copy, rename, or delete devices and their UIs.
          </span>
        </div>
      </div>
    </div>
  );
}
