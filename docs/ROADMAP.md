# Roadmap

## Milestone: Personal-Use Stable Core (Lane A)

### A1 — Deterministic YAML + Safe Merge + Live Compile Preview
- Compile tab with live YAML preview (debounced) based on current in-memory model.
- Safe merge markers enforced (no corruption).
- Deterministic compile ordering where applicable.

### A2 — Binding engine hardening
- Robust handling of `unknown/unavailable/none`.
- Reconnect resilience.
- Entity rename/remove resilience.
- Loop-suppression diagnostics.

### A3 — Project integrity
- Project export/import JSON.
- Storage validation on load.
- Migration hooks.

### A4 — Crash resistance + diagnostics
- UI error boundary.
- Diagnostics panel/endpoint.
- Clear surfacing of backend errors.

## Feature expansion (Lane B)
After Lane A is stable enough for daily use:
- Card Library Phase 2: thermostat, media control, cover, grid/glance, layout helpers.
