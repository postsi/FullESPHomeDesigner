# UX Improvement Plan

Tracking document for UI/UX recommendations. Use the checkboxes to mark progress. No coding until each item is agreed and prioritised.

**Revert strategy:** Note current release before starting. If we don’t like the result, create a new release from that tag so “latest” is the old UI again; HACS Update then reverts everyone without manual deployment.

**Pre-change release (for revert):** **v0.70.217** — Git tag `v0.70.217`. To revert: create a new release (e.g. v0.71.x) from this tag so “latest” serves the pre–UX-change experience again.

**Pre-§2 release (revert point for Navigation phase):** **v0.71.5** — Git tag `v0.71.5`. If §2 Navigation and layout changes are not wanted, create a new release from this tag to roll back to the current UI.

**Pre-§3 release (revert point for Widget selection phase):** **v0.71.10** — Git tag `v0.71.10`. If §3 Widget selection and editing changes are not wanted, create a new release from this tag to roll back.

**Pre-§4 release (revert point for Bindings phase):** **v0.71.11** — Git tag `v0.71.11`. If §4 Bindings and actions changes are not wanted, create a new release from this tag to roll back.

---

## 1. Clarify the main workflow

**Goal:** Make the happy path obvious and reduce initial overwhelm.

| # | Item | Status |
|---|------|--------|
| 1.1 | **Define and surface the core journey** — Name steps: 1. Choose device → 2. Load/create project → 3. Design screens → 4. Bind entities → 5. Test → 6. Deploy. Show as a horizontal stepper or mini roadmap (top of app or main panel), current step highlighted, completed steps ticked. | [x] |
| 1.2 | **First-run / empty-state experience** — When no project is loaded, show a welcome panel: short explanation, two primary actions (Select device, Add device). Copy clarifies that adding a device uses a built-in or imported recipe; creating new hardware recipes is done elsewhere. Optionally “Recent projects” for returning users. | [x] |
| 1.3 | **Single primary action per step** — In each step one button is visually dominant (e.g. “Continue with this device”, “Go to designer”, “Set up bindings”, “Test in simulator”, “Deploy to device”). Secondary/advanced actions visible but subdued. | [x] |
| 1.4 | **Contextual guidance at each step** — Short step-specific helper text at top of main content (1–2 sentences), e.g. “Select the ESPHome device you want to design screens for.” Optional “Learn more” link. | [x] |
| 1.5 | **Progressive disclosure of advanced tools** — Hide or de-emphasise sections editing, recipes, complex LVGL tuning until project is loaded and user has used the designer; then expose via “Advanced tools” group or “(Advanced)” labels. | [x] |
| 1.6 | **Clear status and next-step hint** — Always show: current device and project name; current step (e.g. “Step 3 of 6: Design screens”); “Next: Set up bindings →” style hint. Mark steps complete in stepper when done enough. | [x] |

---

## 2. Navigation and layout

**Goal:** Group by task, make page context obvious, avoid modal overload.

| # | Item | Status |
|---|------|--------|
| 2.1 | **Group tools by task** (nav: groups with separators) — e.g. “Layout” (widgets, pages, alignment), “Data & bindings”, “Device & deploy”, instead of a flat list of modals/panels. | [x] |
| 2.2 | **Prominent page navigation** — Tabs or clear page list near the canvas so users always know which screen they are editing. | [x] |
| 2.3 | **Prefer panels over modals** — For frequently used flows (bindings, properties, LVGL settings), use side panels/drawers that don’t block the canvas where possible. | [ ] |

### §2 Detailed proposal (no coding until agreed)

**2.1 Group tools by task**

- **Current state:** The nav bar and left panel mix: Device list, Device details, Save, Compile, Save as card, LVGL settings, Components, Import recipe, Manage recipes. The left panel has Std LVGL / Card Library / Widgets tabs and the canvas area has page dropdown + alignment buttons. No clear grouping by "what I'm doing".
- **Proposal:**
  - Introduce **task groups** in the main chrome (nav or a compact toolbar), e.g.:
    - **Layout** — Page list/tabs, Add page, alignment (Align L/C/R, T/M/B, Dist H/V), Undo/Redo. Optionally move "widget palette" (Std LVGL, Card Library, Widgets) under a "Layout" or "Add" group so it's clear this is "arranging the screen".
    - **Data & bindings** — One entry point that opens the bindings/links/actions surface (panel or modal to start). Keeps "bindings" as one mental bucket.
    - **Device & deploy** — Save, Compile, Export, Deploy (and optionally "Device details" if we keep it here). "Everything that touches the device or output" in one group.
    - **Advanced** — LVGL settings, Components, Import recipe, Manage recipes. Already de‑emphasised; group under one "Advanced" or "More" control to reduce clutter.
  - **UI shape:** Either (A) a nav bar with grouped buttons/dropdowns ("Layout", "Data & bindings", "Device & deploy", "Advanced"), or (B) keep a single bar but add visual separators (e.g. `|`) and order buttons by group. Option (A) is clearer; (B) is a smaller change.
  - **Left panel:** Keep palette (Std LVGL, Card Library, Widgets) as is for now; we can later label it "Add to screen" or fold it under Layout if we add a Layout dropdown.

**2.2 Prominent page navigation**

- **Current state:** Page choice is a dropdown in the center content area ("Page 1", "Page 2", etc.) with Add page nearby. It works but is easy to miss; "which screen am I on?" isn't always obvious.
- **Proposal:**
  - Place **page navigation** immediately above or directly beside the canvas (e.g. horizontal **tabs**: "Page 1 | Page 2 | Page 3" or a small "Pages" strip), so the active screen is obvious at a glance.
  - Keep "Add page" in the same row or one click away (e.g. "+ Page" tab or button next to the tabs).
  - Ensure the **current page is always named** in that strip (existing page name or "Page N"); no reliance on the stepper alone for "which screen".
  - Optional: small thumbnail or label under each tab if we have page names (e.g. "Home", "Settings") for quicker scanning.

**2.3 Prefer panels over modals**

- **Current state:** Bindings, properties (inspector), LVGL settings, Components, etc. open as modals or full overlays. They block the canvas, so users must close them to see the result of a change.
- **Proposal:**
  - **Right-hand panel (drawer):** Use a persistent or openable **right-side panel** for:
    - **Properties** — Current selection (widget/screen) with "Nothing selected" when appropriate. Open by default when a widget is selected; can be collapsed to an icon or "Properties" tab.
    - **Bindings** — Same panel, different "tab" or section: "Properties | Bindings". So "inspect and bind" live in one place that doesn't cover the canvas.
  - **LVGL settings & Components:** Either (A) move into the same right panel as tabs "Properties | Bindings | LVGL | Components", or (B) keep as modals but make them **resizable and/or draggable** so the user can position them beside the canvas (half-screen). (A) is more "panel-first"; (B) is a lighter change.
  - **Recipe import / Manage recipes:** Can stay as modals (less frequent). Optional: "Import recipe" could open a compact panel from the side instead of a centre modal.
  - **Behaviour:** Panel width resizable (e.g. 260–400px); collapse to a narrow strip with icons to get more canvas space. No modal overlay for Properties/Bindings when the panel is open so the canvas remains visible.

**Summary table**

| Item | Current | Proposed |
|------|--------|----------|
| 2.1  | Flat list of buttons | Groups: Layout, Data & bindings, Device & deploy, Advanced |
| 2.2  | Page dropdown in content | Tabs or strip above/beside canvas; "Add page" in same row |
| 2.3  | Modals for properties, bindings, LVGL, Components | Right-side panel (Properties + Bindings); LVGL/Components either in same panel or resizable modals |

**Risks / decisions**

- **2.1:** Grouping might need a second pass once we see it in the UI (e.g. "Save as card" could sit under Layout or under Advanced). We can start with the four groups above and adjust.
- **2.2:** Tabs need to work on small viewports; we may need a dropdown fallback for many pages (e.g. "Page 1 ▼").
- **2.3:** Right panel reduces horizontal space for the canvas; resizable/collapsible panel is important. We could default to collapsed on first run and remember user preference.

**Decisions (approved)**

- **2.1:** **B** — Keep a single nav bar; add visual separators (e.g. `|`) and order buttons by group (Layout → Data & bindings → Device & deploy → Advanced). No dropdowns for groups.
- **2.2:** **Tabs** — Page navigation as tabs (e.g. "Page 1 | Page 2 | + Page") above the canvas.
- **2.3:** **Keep as-is** — Leave existing panels/modals broadly as they are; no right-side panel or modal-to-panel change in this phase.

---

## 3. Widget selection and editing

**Goal:** Stronger affordances and inline feedback.

| # | Item | Status |
|---|------|--------|
| 3.1 | **Clear selection affordances** — Obvious selection outline, resize handles, and a properties panel that always reflects current selection (including “Nothing selected” state). | [x] |
| 3.2 | **Inline feedback on invalid actions** — When drag/resize would go out of bounds or break constraints, show ghost/limit indicators instead of silent snapping. | [x] |

---

## 4. Bindings and actions

**Goal:** Human wording, sensible defaults, and easy auditing.

| # | Item | Status |
|---|------|--------|
| 4.1 | **Explain bindings in human terms** — When creating/editing a binding, use copy like “This widget will show…” and “When the user does X, call Y service” alongside technical names. | [x] |
| 4.2 | **Pre-filter and suggest** — Show most relevant entities/services first (by widget type and domain); label “recommended” options clearly. | [x] |
| 4.3 | **Visualise connections** — In bindings panel, per-widget short readable summary (e.g. “Shows Living room temperature (sensor.living_room_temp)”) so users can audit at a glance. | [x] |

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

*Last updated: §1 Clarify the main workflow implemented on branch `ui-workflow-stepper`.*
