/**
 * bindingConfig: display actions, events, services, and entity_id parsing.
 */
import { describe, it, expect } from "vitest";
import {
  getDisplayActionsForType,
  getEventsForType,
  getServicesForDomain,
  domainFromEntityId,
  DISPLAY_ACTIONS_BY_WIDGET_TYPE,
  EVENTS_BY_WIDGET_TYPE,
} from "./bindingConfig";

describe("bindingConfig", () => {
  describe("domainFromEntityId", () => {
    it("extracts domain from entity_id", () => {
      expect(domainFromEntityId("light.living")).toBe("light");
      expect(domainFromEntityId("sensor.temperature")).toBe("sensor");
      expect(domainFromEntityId("climate.thermostat")).toBe("climate");
    });
    it("returns empty string when no dot", () => {
      expect(domainFromEntityId("")).toBe("");
      expect(domainFromEntityId("nodot")).toBe("");
    });
  });

  describe("getDisplayActionsForType", () => {
    it("returns label_text for label", () => {
      expect(getDisplayActionsForType("label")).toEqual(["label_text"]);
    });
    it("returns arc_value and label_text for arc", () => {
      const actions = getDisplayActionsForType("arc");
      expect(actions).toContain("arc_value");
      expect(actions).toContain("label_text");
    });
    it("returns default label_text for unknown type", () => {
      expect(getDisplayActionsForType("unknown")).toEqual(["label_text"]);
    });
    it("is case-insensitive", () => {
      expect(getDisplayActionsForType("LABEL")).toEqual(["label_text"]);
    });
  });

  describe("getEventsForType", () => {
    it("returns on_click for button", () => {
      expect(getEventsForType("button")).toEqual(["on_click"]);
    });
    it("returns on_release and on_value for arc", () => {
      expect(getEventsForType("arc")).toEqual(["on_release", "on_value"]);
    });
    it("returns empty array for unknown type", () => {
      expect(getEventsForType("unknown")).toEqual([]);
    });
  });

  describe("getServicesForDomain", () => {
    it("returns services for light", () => {
      const svc = getServicesForDomain("light");
      expect(svc.length).toBeGreaterThan(0);
      expect(svc.some((s) => s.service === "light.toggle")).toBe(true);
    });
    it("returns empty array for unknown domain", () => {
      expect(getServicesForDomain("unknown_domain")).toEqual([]);
    });
  });

  describe("DISPLAY_ACTIONS_BY_WIDGET_TYPE coverage", () => {
    it("has entries for label, button, arc, slider, bar, switch, checkbox, led", () => {
      const types = ["label", "button", "arc", "slider", "bar", "switch", "checkbox", "led"];
      for (const t of types) {
        expect(DISPLAY_ACTIONS_BY_WIDGET_TYPE[t], `missing ${t}`).toBeDefined();
        expect(Array.isArray(DISPLAY_ACTIONS_BY_WIDGET_TYPE[t])).toBe(true);
      }
    });
  });

  describe("EVENTS_BY_WIDGET_TYPE coverage", () => {
    it("has entries for button, arc, slider, switch", () => {
      const types = ["button", "arc", "slider", "switch"];
      for (const t of types) {
        expect(EVENTS_BY_WIDGET_TYPE[t], `missing ${t}`).toBeDefined();
        expect(Array.isArray(EVENTS_BY_WIDGET_TYPE[t])).toBe(true);
      }
    });
  });
});
