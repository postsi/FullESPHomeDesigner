# Why “Additional” and Concatenation Work This Way

**No code changes in this doc.** It explains (1) why only certain sections are concatenated, (2) what happens when you add YAML to a non-list section like `esp32`, and (3) why a section can show as “Additional” with YAML even when the user didn’t add it.

---

## 1. Why are only those sections concatenated?

**Design:** Only **list sections** (sensor, text_sensor, binary_sensor, switch, number, select, light) use **“auto + user” concatenation**. All other sections (esp32, wifi, logger, esphome, lvgl, script, etc.) use **“user replaces auto”**.

**Reason:**

- In ESPHome YAML, list sections are literally lists of blocks, e.g.:
  - `switch:` → list of `- platform: ...` entries
  - `sensor:` → list of `- platform: ...` entries  
  So it’s natural to **append** user blocks to recipe/compiler blocks and then deduplicate.
- Non-list sections are single blocks (one `esp32:` block, one `wifi:` block, etc.). Merging two arbitrary YAML blocks (recipe + user) into one is ambiguous (order, keys, comments). So the rule is: **if the user has content for that section, the whole section is the user’s content**; otherwise we use recipe/compiler. That’s “user replaces auto,” not concatenation.

So “only those sections” are concatenated because they are the only ones that are list-of-blocks in ESPHome; the rest are single-block sections and use replace semantics.

---

## 2. What happens if I manually add something to the esp32 section?

With the current logic, **the entire `esp32` section in the compiled YAML is replaced by whatever you put in the Components panel** for `esp32`. The recipe’s `esp32` block is **not** merged in; it’s only used when you have **no** user content for `esp32`.

So if you “add a few lines” to esp32 in the panel, you must include everything you want (e.g. copy the recipe’s esp32 block and add your lines). If you only paste a small addition, the recipe’s esp32 block is dropped. There is no “add to recipe” merge for non-list sections—only “replace whole section” when you have content.

---

## 3. Why does esp32 (or another section) show as “Additional” with YAML when I didn’t add it?

**Intended contract:** “Additional” should mean “the user has added YAML for this section.”

**Current implementation:** The Components panel shows “Additional” for a section when **`project.sections[key]` has any non-empty content**. The API that feeds the panel (`SectionsDefaultsView` → `_build_sections_panel_data`) returns **only** `project.sections` (and empty `default_sections`). So:

- **Backend:** “Additional” = “this key has content in **project.sections**.”
- We do **not** write recipe/compiler into `project.sections` when you open the device or when you call the sections/defaults API. The GET device project handler does **not** call `_ensure_project_sections` (enforced by test). So under current code, `project.sections` is only filled when:
  1. The user adds YAML in the Components panel and saves, or  
  2. The frontend syncs after “Create Component” (only for that component’s section, and `default_sections` from the API are empty now), or  
  3. **Legacy:** the project was saved in the past by some code path that **did** write recipe/compiler into `project.sections` (e.g. an older version that called `_ensure_project_sections` before save, or an old API that returned filled “default_sections” and the UI merged and saved).

So if esp32 shows as “Additional” with YAML, it means **the stored device project already has `project.sections["esp32"]` with content**. That can be:

- **User-added:** Someone added esp32 YAML in the panel and saved.
- **Legacy pollution:** The project was saved at some point when recipe/compiler content had been written into `project.sections` (e.g. by an old flow). That stored state was never cleared, so the panel still sees “content” and shows “Additional.”

So the bug is not that the **current** code shows “Additional” for user-added-only—the current code only shows content that’s in `project.sections`. The problem is that **project.sections can already contain content that was never intentionally “user-added”** (legacy or past bug). To truly show “Additional” only when the user added YAML, we’d need one of:

- **Compare to auto:** For each section, compute “auto” content (recipe + compiler for that key) and mark “Additional” / `keys_with_additions` only when `project.sections[key]` is non-empty **and** different from that auto content. Then even if `project.sections` was polluted in the past, we’d only show “Additional” when it actually differs from recipe/compiler.
- **Migration:** One-time cleanup of stored projects to clear section keys whose content equals recipe/compiler (more invasive and risky).

The first option (compare to auto) is the one that matches the agreed contract: “Additional only when the user has added YAML” (i.e. when stored content differs from what recipe+compiler would produce).
