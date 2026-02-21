
# CONTRIBUTING_AI.md
## AI Development Rules for ESPHome Touch Designer

This document defines **strict rules** for AI assistants (Cursor, Copilot, ChatGPT, etc.)
working inside this repository.

The goal is to prevent architectural drift and accidental regressions.

---

# 1. Core Principle

The system is a **compiler**, not a runtime UI framework.

AI MUST treat:

- Project Model = AST (source program)
- Compiler = Code generator
- ESPHome YAML = compiled output

AI MUST NOT directly manipulate generated YAML logic unless modifying compiler output rules.

---

# 2. Layer Separation (DO NOT BREAK)

There are four layers:

| Layer | Role |
|------|------|
| React Designer | Editing UI |
| Project Model | Data definition |
| Compiler | Transformation engine |
| ESPHome Runtime | Execution |

### Hard Rule:
Changes must affect **only one layer** unless explicitly required.

---

# 3. Safe Modification Checklist

Before writing code, AI must classify the change:

| Request Type | Correct Layer |
|-------------|--------------| Add widget property | Schema |
| New LVGL feature | Schema + Compiler |
| New HA control | Control Template |
| UI behaviour | React frontend |
| Firmware behaviour | Compiler output |

If unclear → STOP and request clarification.

---

# 4. NEVER DO THESE

❌ Hardcode YAML inside React components  
❌ Add ESPHome logic directly into UI  
❌ Modify hardware recipes dynamically  
❌ Store derived state outside project model  
❌ Duplicate schema definitions in code

---

# 5. Bindings vs Links (Critical Concept)

Bindings:
    HA → ESPHome data ingestion

Links:
    ESPHome value → LVGL widget update

AI must NEVER merge these concepts.

---

# 6. Adding New Controls (Correct Method)

A control must:

1. Generate widgets
2. Generate bindings
3. Generate links

Controls are **macros**, not widgets.

---

# 7. Compiler Modification Rules

Compiler must remain:

- deterministic
- idempotent
- stateless

Output must depend ONLY on project model + recipe.

---

# 8. Schema Extension Rules

When adding widget capability:

1. Extend schema JSON first
2. Add compiler mapping if needed
3. Avoid UI hardcoding

Schemas define the editor language.

---

# 9. Live Update System Constraints

Live updates MUST use:

- homeassistant platform sensors
- on_value / on_state triggers
- lvgl.*.update actions

Never introduce polling loops.

---

# 10. HACS Compatibility Rules

AI must preserve:

- semantic versioning
- manifest version updates
- hacs.json validity

Breaking these prevents installation.

---

# 11. Documentation Maintenance (MANDATORY)

Whenever architecture changes:

AI MUST update:

- ARCHITECTURE.md
- CONTRIBUTING_AI.md
- RELEASE_NOTES.md

Documentation is part of the system design.

---

# 12. Decision Heuristic

If unsure:

Ask:

> “Is this a schema change, compiler change, or control template?”

If answer is none → approach is likely incorrect.

---

END OF CONTRIBUTING_AI.md


# 13. Canvas UX Changes

Canvas editing features (drag/resize/multi-select/undo) must only mutate the **project model** through a single update path.
Never store transient widget state outside the project model except for short-lived UI interaction refs.


# 14. Design-time HA entity API

Entity picking for bindings must use HA server-side state access (custom integration endpoints). Avoid trying to scrape auth tokens in the browser.
The goal is a safe, authenticated, deterministic snapshot for pickers.


# 15. External hardware recipes

Do not hardcode large external recipe libraries into the codebase unless curated.
Prefer supporting user-provided YAML recipes in `/config/esphome_touch_designer/recipes` and listing them via the backend.
