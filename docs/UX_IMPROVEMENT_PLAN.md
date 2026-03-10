# UX Improvement Plan

Tracking document for UI/UX recommendations. Use the checkboxes to mark progress. No coding until each item is agreed and prioritised.

**Revert strategy:** Note current release (e.g. v0.70.0) before starting. If we don’t like the result, create a new release from that tag (e.g. v0.72.0) so “latest” is the old UI again; HACS Update then reverts everyone without manual deployment.

---

## 1. Clarify the main workflow

**Goal:** Make the happy path obvious and reduce initial overwhelm.

| # | Item | Status |
|---|------|--------|
| 1.1 | **Define and surface the core journey** — Name steps: 1. Choose device → 2. Load/create project → 3. Design screens → 4. Bind entities → 5. Test → 6. Deploy. Show as a horizontal stepper or mini roadmap (top of app or main panel), current step highlighted, completed steps ticked. | [ ] |
| 1.2 | **First-run / empty-state experience** — When no project is loaded, show a welcome panel: short explanation, three primary actions (Select device, Create new project, Open example project), short note under each. Optionally “Recent projects” for returning users. | [ ] |
| 1.3 | **Single primary action per step** — In each step one button is visually dominant (e.g. “Continue with this device”, “Go to designer”, “Set up bindings”, “Test in simulator”, “Deploy to device”). Secondary/advanced actions visible but subdued. | [ ] |
| 1.4 | **Contextual guidance at each step** — Short step-specific helper text at top of main content (1–2 sentences), e.g. “Select the ESPHome device you want to design screens for.” Optional “Learn more” link. | [ ] |
| 1.5 | **Progressive disclosure of advanced tools** — Hide or de-emphasise sections editing, recipes, complex LVGL tuning until project is loaded and user has used the designer; then expose via “Advanced tools” group or “(Advanced)” labels. | [ ] |
| 1.6 | **Clear status and next-step hint** — Always show: current device and project name; current step (e.g. “Step 3 of 6: Design screens”); “Next: Set up bindings →” style hint. Mark steps complete in stepper when done enough. | [ ] |

---

## 2. Navigation and layout

**Goal:** Group by task, make page context obvious, avoid modal overload.

| # | Item | Status |
|---|------|--------|
| 2.1 | **Group tools by task** — e.g. “Layout” (widgets, pages, alignment), “Data & bindings”, “Device & deploy”, instead of a flat list of modals/panels. | [ ] |
| 2.2 | **Prominent page navigation** — Tabs or clear page list near the canvas so users always know which screen they are editing. | [ ] |
| 2.3 | **Prefer panels over modals** — For frequently used flows (bindings, properties, LVGL settings), use side panels/drawers that don’t block the canvas where possible. | [ ] |

---

## 3. Widget selection and editing

**Goal:** Stronger affordances and inline feedback.

| # | Item | Status |
|---|------|--------|
| 3.1 | **Clear selection affordances** — Obvious selection outline, resize handles, and a properties panel that always reflects current selection (including “Nothing selected” state). | [ ] |
| 3.2 | **Inline feedback on invalid actions** — When drag/resize would go out of bounds or break constraints, show ghost/limit indicators instead of silent snapping. | [ ] |

---

## 4. Bindings and actions

**Goal:** Human wording, sensible defaults, and easy auditing.

| # | Item | Status |
|---|------|--------|
| 4.1 | **Explain bindings in human terms** — When creating/editing a binding, use copy like “This widget will show…” and “When the user does X, call Y service” alongside technical names. | [ ] |
| 4.2 | **Pre-filter and suggest** — Show most relevant entities/services first (by widget type and domain); label “recommended” options clearly. | [ ] |
| 4.3 | **Visualise connections** — In bindings panel, per-widget short readable summary (e.g. “Shows Living room temperature (sensor.living_room_temp)”) so users can audit at a glance. | [ ] |

---

## 5. Recipes, cards, and sections

**Goal:** Clear concepts and safe advanced editing.

| # | Item | Status |
|---|------|--------|
| 5.1 | **Differentiate concepts** — Visually and in copy: what a “recipe”, “card”, and “section” are and when to use each (short descriptions, tooltips, one-line summaries in lists). | [ ] |
| 5.2 | **Guard rails for sections (raw YAML)** — Treat as “advanced”; add clear warnings, inline validation, and impact preview so users don’t feel they’re breaking things. | [ ] |

---

## 6. Feedback, errors, and operations

**Goal:** Consistent progress, success, and error handling.

| # | Item | Status |
|---|------|--------|
| 6.1 | **Friendly long operations** — Compile, validate, export, deploy, recipe operations: consistent progress indicators, success toasts, and clear error summaries with “Try again” or “Go to problem” where useful. | [ ] |
| 6.2 | **Unsaved changes and autosave** — Persistent “Saved / Unsaved” indicator; consider optional autosave and clear “lose work?” prompts. | [ ] |

---

## 7. Discoverability and learning

**Goal:** Contextual help and learn-by-example.

| # | Item | Status |
|---|------|--------|
| 7.1 | **Contextual help** — Small “?” or inline hints for complex concepts (bindings, LVGL config, recipes), with link to docs or 2–3 sentence explanation. | [ ] |
| 7.2 | **Example project** — Option to open a small sample project that demonstrates typical widgets and bindings so users don’t start from a blank screen. | [ ] |

---

## Implementation notes

- **Order:** Start with **§1 Clarify the main workflow**; it frames the rest. Then §2 (navigation) and §3 (selection) support daily use; §4–7 can follow by priority.
- **Branching:** Do work on a feature branch (e.g. `ui-workflow-stepper`); small, focused commits so individual items can be reverted if needed.
- **Feature flag (optional):** Wrap new workflow/stepper in a flag so the old UI can be re-enabled without redeploying.
- **Release:** After validation, merge to `main`, bump version, run full release workflow. If the result is not wanted, revert by releasing from the pre-change tag as described at the top of this document.

---

*Last updated: plan created; no code changes yet.*
