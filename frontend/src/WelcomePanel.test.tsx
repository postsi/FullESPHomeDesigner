/**
 * Component tests for WelcomePanel. Require jsdom (see frontend/package.json and docs/TESTING.md).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, afterEach, vi } from "vitest";
import WelcomePanel from "./WelcomePanel";

function render(ui: React.ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(container);
    },
  };
}

describe("WelcomePanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const defaultProps = {
    onSelectDevice: vi.fn(),
    onNewDevice: vi.fn(),
    onOpenExample: vi.fn(),
    hasDevices: true,
  };

  it("renders intro text and three primary actions", () => {
    const { container, unmount } = render(<WelcomePanel {...defaultProps} />);
    expect(container.textContent).toMatch(/ESPHome Touch Designer lets you design LVGL/);
    expect(container.textContent).toContain("Select device");
    expect(container.textContent).toContain("Create new project");
    expect(container.textContent).toContain("Open example / from recipe");
    unmount();
  });

  it("does not throw when optional recentProjects is undefined", () => {
    expect(() => {
      const { unmount } = render(
        <WelcomePanel {...defaultProps} recentProjects={undefined} />
      );
      unmount();
    }).not.toThrow();
  });

  it("shows different Select device label when hasDevices is false", () => {
    const { container, unmount } = render(
      <WelcomePanel {...defaultProps} hasDevices={false} />
    );
    expect(container.textContent).toMatch(/Select device \(create one first if needed\)/);
    unmount();
  });

  it("shows Recent projects when recentProjects is non-empty", () => {
    const { container, unmount } = render(
      <WelcomePanel
        {...defaultProps}
        recentProjects={[{ deviceId: "dev1", name: "My Device" }]}
      />
    );
    expect(container.textContent).toContain("Recent projects");
    expect(container.textContent).toContain("My Device");
    unmount();
  });
});
