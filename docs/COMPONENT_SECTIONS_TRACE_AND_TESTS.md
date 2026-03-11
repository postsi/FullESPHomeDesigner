# Component Sections Pipeline: Trace and Recommendations

**No code changes in this doc.** This traces the flow from recipe → sections API → panel → compile and states what (if anything) needs to be done and what tests are needed to prove it.

---

## 1. Pipeline trace

### 1.1 Data sources

- **Recipe**: YAML file per hardware (e.g. `jc1060p470_esp32p4_1024x600.yaml`). Parsed into **recipe_sections** by `_parse_recipe_into_sections(recipe_text)` — keys from `SECTION_ORDER` (esphome, wifi, switch, sensor, lvgl, script, etc.).
- **Compiler**: `_build_compiler_sections(project, device)` builds section content from:
  - **Prebuilt (esphome_components)**: `_compile_prebuilt_components(project)` → `_compile_esphome_components_yaml` → raw blocks in `project.esphome_components` are compiled to YAML string, then `_yaml_str_to_section_map(..., merge_duplicate_keys=True)` → one string per top-level key (e.g. `switch`, `interval`).
  - HA bindings, globals, script, interval, time, lvgl, font, image, api, etc.
- **Stored**: `project.sections` — keyed by section name (e.g. `switch`, `sensor`). What the user has saved from the Components panel (or what was synced after Create Component).

There is **no** `esphome_components` key in the API; section keys are the ESPHome top-level block names (switch, sensor, lvgl, …).

### 1.2 Sections API (SectionsDefaultsView)

1. Request body: `project`, `recipe_id`; optional `device_id` / `entry_id` for device name substitution.
2. `_ensure_project_sections(project, device, recipe_text)` is called. It:
   - Reads **stored** = `project.sections`, **recipe_sections**, **compiler_sections**.
   - For each key in `SECTION_ORDER`:  
     `content = stored (if has content) else compiler_sections.get(key) else recipe_sections.get(key)`  
     plus defaults for wifi/ota/logger if still empty.
   - Writes back **project.sections** = this merged `pieces`.
3. API then builds **default_sections** = `_build_default_section_pieces(project, device, recipe_text)` which uses **compiler then recipe only** (no stored):  
   `content = compiler_sections.get(key) or recipe_sections.get(key)` (+ wifi/ota/logger defaults).
4. **overridden_keys** = keys where `sections[key] != default_sections[key]` (string trim compare).
5. Response: `sections`, `default_sections`, `categories`, `overridden_keys`.

So: **Manual** in the UI = key in `overridden_keys` (stored content differs from compiler+recipe default). **Empty** = no content. **Recipe** = heuristic (sections that usually only come from recipe). **Auto** = has content and not Manual.

### 1.3 Create Component flow (frontend)

1. User adds a widget (e.g. switch) and clicks Create Component.
2. Block (e.g. `switch:\n  - platform: lvgl\n    id: sw1\n    ...`) is appended to **project.esphome_components**.
3. Frontend calls **getSectionsDefaults(project, recipeId, …)** to get fresh `default_sections` (and sections/overridden_keys).
4. Frontend sets **project.sections[meta.section]** = **default_sections[meta.section]** (e.g. `meta.section = "switch"`). So the new block appears in the Components panel and is not Manual (because stored for that key equals default).

### 1.4 Section-based compile (`_compile_to_esphome_yaml_section_based`)

1. `_ensure_project_sections(project, device, recipe_text)` → **project.sections** filled (stored or compiler or recipe per key).
2. **pieces** = copy of `project.sections`.
3. **compiler_pieces** = `_build_compiler_sections(project, device)` (includes prebuilt from esphome_components).
4. For **MERGE_LIST_SECTIONS** (switch, sensor, text_sensor, binary_sensor, number, select, light):  
   `merged_body = existing_body + "\n\n" + body_compiler` (then `pieces[k] = _section_full_block(k, merged_body)`).  
   For other keys, compiler overwrites: `pieces[k] = _section_full_block(k, body_compiler)`.
5. Final YAML is emitted in `SECTION_ORDER` from **pieces**.

So for list sections, the compile **always appends** compiler output to whatever is in `pieces` (which came from stored/compiler/recipe). That allows user-defined components (e.g. LVGL switch) and HA bindings to coexist.

---

## 2. What needs to be done to make it work properly

### 2.1 Create Component sync (current fix)

- **Done**: After adding to `project.esphome_components`, frontend syncs `project.sections[meta.section] = default_sections[meta.section]` so the new block shows in the panel and is not marked Manual. Backend test `test_esphome_components_from_compiler_when_stored_empty` asserts that when `esphome_components` has a switch block and `project.sections` is empty, `_ensure_project_sections` fills `sections["switch"]` and it matches `default_sections["switch"]`.

### 2.2 Duplicate block in compiled YAML (needs fix)

- **Issue**: For MERGE_LIST_SECTIONS, compile does `merged_body = existing_body + "\n\n" + body_compiler`. After Create Component we set **stored["switch"]** = **default_sections["switch"]**, and default_sections["switch"] comes from **compiler_sections["switch"]** (the same block). So **pieces["switch"]** = that block, and **compiler_pieces["switch"]** = the same block. Then merged_body = block + "\n\n" + block → **the switch block appears twice** in the final YAML.
- **Required**: When merging list sections, avoid duplicating list items that are already present. Options: (a) merge list items (e.g. by `id:` or by normalized YAML block) and emit each unique block once; or (b) only append compiler list items that are not already contained in existing_body (e.g. by id or by block equality). This must be done in the backend (e.g. in `_compile_to_esphome_yaml_section_based` for MERGE_LIST_SECTIONS).

### 2.3 Recipe + Create Component same section (edge case)

- **Issue**: For a recipe that **already has** a list section (e.g. `switch:` in waveshare/guition recipes), **compiler_sections["switch"]** from prebuilt is only the block(s) from **project.esphome_components**. Recipe’s switch block is in **recipe_sections["switch"]**. Current rule is single-source: **content = stored or compiler or recipe**. So if we never had stored and we add a Create-component switch, compiler has "switch", so we take compiler only → **recipe’s switch block is lost**.
- **Required**: Either (a) when building compiler_sections for list sections, merge recipe list items with prebuilt list items for that key, or (b) in _ensure_project_sections (or in the compile merge step), for MERGE_LIST_SECTIONS merge recipe + compiler instead of picking one. This only matters for recipes that define switch/sensor/etc.; jc1060 does not define switch.

---

## 3. Tests needed to prove it works

### 3.1 Backend (Python)

- **Duplicate block**
  - **Test**: Project with `esphome_components` containing one switch block; `project.sections["switch"]` set to the same content as `default_sections["switch"]` (simulating post–Create Component sync). Call `_compile_to_esphome_yaml_section_based`. Parse output and assert the **switch** section contains **exactly one** list item with the expected `id:` (e.g. sw1), and that the same block text does not appear twice.
- **Recipe + Create Component (optional)**
  - **Test**: Use a recipe that has a `switch:` section (e.g. waveshare or guition). Add a switch via esphome_components. Run _ensure_project_sections and/or full compile. Assert both the recipe’s switch block and the Create-component switch block appear in the final YAML (no duplicate, no drop).

### 3.2 Existing tests to keep

- **test_esphome_components_from_compiler_when_stored_empty**: Ensures that when esphome_components has a switch and sections are empty, ensure fills sections["switch"] and it equals default_sections["switch"] (so panel does not show Manual).
- **test_ensure_and_compile**, **test_build_default_pieces**, **test_recipe_parse_and_full_block**, **test_legacy_migration**, **test_lvgl_widget_yaml_compiles**: Keep as-is; they validate section parsing, defaults, and compile.

### 3.3 Frontend

- No new test strictly required for the sync step if backend tests above pass (sync is a single assignment after getSectionsDefaults). Optional: integration or E2E that adds a switch widget, clicks Create Component, opens Components panel, and asserts switch section has content and is not labeled Manual.

---

## 4. Summary

| Item | Status | Action |
|------|--------|--------|
| Create Component sync (panel shows new block, not Manual) | Done | Keep; covered by test_esphome_components_from_compiler_when_stored_empty |
| Duplicate block in compiled YAML after sync | Bug | Backend: dedupe list items when merging MERGE_LIST_SECTIONS; add test that compiled YAML has switch block once |
| Recipe + Create Component same section | Edge case | Backend: merge recipe + compiler for list sections where recipe has content; add test with recipe that has switch |

Implementing the duplicate fix and adding the duplicate test are the minimum to say the flow “works properly” after Create Component. The recipe+compiler merge is needed only for recipes that define switch/sensor/etc.
