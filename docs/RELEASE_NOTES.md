## v0.64.0 — Hardware Recipe System v2 (Importer + Metadata)

## v0.70.91

- **Fix (HA bindings)**: `id:` and `text:` (and sibling keys) under `lvgl.label.update` / `lvgl.button.update` / `lvgl.arc.update` are now indented 2 spaces under the action key so ESPHome parses them as the value of the action (fixes "Key 'lvgl.button.update' overrides 'id'!").
- **Compile**: Blank line added between `text_sensor`, `sensor`, and `binary_sensor` blocks in generated YAML for readability.

## v0.70.90

- **Fix (HA bindings)**: `condition:` and `then:` in the `on_value`/`then` block are now indented under the `- if:` key so ESPHome parses them as the value of `if:` (fixes "Key 'if' overrides 'condition'! Did you forget to indent the block inside the if?").

## v0.70.89

- **Fix (HA bindings)**: Display links with action `label_text` now use the correct LVGL update: `lvgl.button.update` when the target widget is a button (fixes "ID of type lv_btn_t doesn't inherit from lv_label_t"). Widget type is resolved from project pages (including nested containers). Indentation of `on_value`/`then` blocks in text_sensor/sensor/binary_sensor output was corrected so the `- if:` list and nested `id:`/`text:` parse correctly. Condition lambda is emitted as a quoted string.

## v0.70.88

- **Fix (LVGL compile)**: Event actions (on_release, on_click, etc.) are now emitted as embedded YAML (key + indented structure) instead of a literal block scalar (`|-`), so ESPHome receives a dict and no longer reports "expected a dictionary". Arc knob: schema and emission use `pad_right` instead of invalid `padding`; stored `padding` is still mapped to `pad_right` for backwards compatibility.

## v0.70.87

- **Fix (LVGL compile)**: ESPHome requires each widget to be "a dictionary with a single key". Widget properties (id, x, y, etc.) are now indented 2 spaces under the type key (12-space body indent in schema, re-indented correctly) so each list item is a single-key mapping. Child widgets under `widgets:` are indented 2 spaces under `widgets:`; empty containers now emit `widgets: []`.

## v0.70.86

- **Fix (compile)**: Duplicate top-level `script:` key removed. When the recipe already had a `script:` block (e.g. `manage_run_and_sleep` for display refresh), the compiler was appending a second `script:` section for action scripts (thermostat +/- etc.), causing "Duplicate key 'script'". Compiler-generated script entries are now merged into the recipe's existing `script:` block via `_merge_scripts_into_rest`.

## v0.70.85

- **Fix (LVGL compile)**: Widget YAML indentation corrected. Properties under list items (e.g. `id`, `x`, `y` under `- container:`) were emitted at the same indent as the list marker, causing "expected <block end>, but found '?'". Schema-driven emission now uses a body indent (10 spaces) for all widget properties under `- type:` so the mapping is valid YAML. Default logger section added when the recipe does not include one (fixes "Logger is not configured!" after upload).

## v0.70.84

- **Fix (LVGL compile)**: Page id `main` is reserved in C++ (entry point). ESPHome generates a global variable from each page id, so `id: main` caused "cannot declare '::main' to be a global variable". The compiler now emits `main_page` instead of `main` in generated YAML when the project page id is "main"; stored project data and UI labels are unchanged.

## v0.70.83

- **Fix (LVGL compile)**: Empty or name-only pages no longer produce invalid YAML. ESPHome LVGL `pages` only accept `id` and `widgets`; the compiler no longer emits `name` for pages. When a page has no widgets, it now emits `widgets: []` instead of a bare `widgets:` key, so ESPHome no longer reports "Expected a list of widgets" or "[name] is an invalid option for [pages]".

## v0.70.82

- **Fix (compile)**: Builtin recipes in `list_builtin_recipes()` did not include `path`, so `_find_recipe_path_by_id()` returned `Path("None")` and the Compile view could read a file named "None" in the process cwd instead of the real recipe, producing minimal or wrong YAML. Builtin recipe dicts now include `"path": str(p)` so the correct recipe file is always used. Empty-recipe fallbacks in CompileView and `compile_to_esphome_yaml` were removed.

## v0.70.81

- **Compile**: Replace `__ETD_DEVICE_NAME__` in the Compile view response as well as in the compiler, so the device name is always substituted when using the compile API.
- **ESPHome validate**: Recipes that call `script.execute: manage_run_and_sleep` in `on_boot` now get a defined script. Guition recipe includes the script block; the compiler injects a minimal stub (`delay: 1ms`) for any other recipe that references it but doesn't define it, so `esphome validate` / compile succeeds.

## v0.70.80

- **Compile (device name)**: Hardware recipes now declare the device name via the placeholder `__ETD_DEVICE_NAME__` under `esphome:`; the compiler replaces it once with the device slug. All builtin recipes include `  name: __ETD_DEVICE_NAME__`; custom recipes should do the same for correct compilation.
- **Compile**: Recipe is loaded from the same source as the UI (builtin or user via `_find_recipe_path_by_id`) when compiling from the Compile view.
- **Recipes**: Added `esphome:` section (with name placeholder and `min_version`) to the three builtin recipes that lacked it: `sunton_2432s028r_320x240`, `elecrow_dis05035h_480x320`, `waveshare_esp32_p4_wifi6_touch_lcd_4c_720x720`.

## v0.70.79

- **Fix (compile)**: Esphome block detection and name injection now handle `esphome:` when there is more on the same line (e.g. `esphome: # comment`) or a leading BOM. Block start matches `(?:\ufeff)?\s*esphome:`; split-fail inject matches the first line with optional BOM/space + `esphome:` + optional rest; first line of block is normalized to emit clean `esphome:` at column 0.

## v0.70.78

- **Fix (compile)**: Root cause of missing `name:` under `esphome:` fixed. When the recipe had `esphome:` not at column 0 (e.g. leading space or BOM), the split returned no block and the code emitted a minimal block plus the full recipe, producing two top-level `esphome:` blocks; in YAML the second overwrote the first so the name was lost. Now, when the split fails, the name is injected into the full text and no duplicate block is emitted. The previous safety-net regex at the end of the compiler has been removed.

## v0.70.77

- **Fix**: ESPHome `name:` is now always emitted as the first key under `esphome:` (insert or replace any existing direct-child `name:`). Ensures the required `name:` is present regardless of recipe or cache.

## v0.70.76

- **Fix**: Top-level `name:` under `esphome` is now injected when the recipe only has nested `project.name`. The check was changed from "any line with `name:`" to "direct child at 2-space indent (`  name:`)" so recipes like Guition no longer skip injection and ESPHome's required `name:` is always present.

## v0.70.75

- **Fix**: Generated YAML now starts with an explicit document start marker `---` to avoid parser errors ("expected document start, but found block mapping start").

## v0.70.74

- **Fix**: `#__HA_BINDINGS__` no longer appears in generated YAML. The bindings compiler no longer embeds the marker in its output; the recipe marker is replaced only by the actual bindings content (or empty when none).
- **Fix**: ESPHome `'name' is a required option` — the compiler injects `name: "<device_slug>"` into the esphome block when the recipe does not define it (e.g. recipes with only `project.name`).

## v0.70.73

- **Compiled YAML order**: Generated config now starts with the **esphome:** section, then **api:** (encryption), then **wifi:** and **ota:** (defaults added when the recipe does not include them), then the rest of the recipe, then locks/scripts/fonts/assets.
- **Default wifi/ota**: If the hardware recipe has no top-level `wifi:` or `ota:`, the compiler adds standard snippets (wifi with `!secret wifi_ssid`/`wifi_password` and AP fallback; ota with `platform: esphome`).
- **Validate with ESPHome**: New **Validate with ESPHome** button in the Compile modal runs `esphome compile` on the compiled YAML (server-side) and shows success or stderr. Requires the `esphome` CLI on the Home Assistant host. New API: `POST /api/esphome_touch_designer/validate_yaml` with `{ "yaml": "..." }`.

## v0.70.72

- **Widgets (Prebuilt) tab**: Replaced the "Home Assistant" palette tab with a **Widgets** tab. Prebuilt widgets are drag-and-drop (or click-to-add) building blocks that insert directly onto the canvas without a wizard.
- **Prebuilt widgets**: New module `prebuiltWidgets/index.ts` with 22 prebuilts: Battery (bar + %), WiFi strength, IP address, HA connection (LED + label), Clock, Date+time, Colour picker (colorwheel), Section title, Divider, Progress bar, LED indicator, Back button, Page indicator, **Navigation bar** (page −, Home ⌂, page +), Countdown/timer, Status badge, Spacer, Icon, Scrolling text, Numeric keypad, List/menu. Each returns standard LVGL widgets (label, button, bar, container, led, colorwheel, etc.) with unique IDs.
- **Drop handling**: Canvas and App support `application/x-esphome-prebuilt-widget`; dropping a prebuilt inserts its widgets at the drop position; clicking a prebuilt in the Widgets tab adds it at (80, 80).

## v0.70.71

- **Card Library cards for all HA domains**: New Card Library entries (same design pattern as Thermostat card) for light, switch, cover, fan, lock, and media_player. Each returns widgets, bindings, links, and action_bindings; wizard uses entityDomain for filtered entity picker.
- **Light card**: Toggle + brightness; optional **color temperature** slider when the light supports it (supported_color_modes includes color_temp or min/max_mireds in capabilities).
- **Switch card**: Toggle button + state label.
- **Cover card**: Position slider + Open/Stop/Close; optional **tilt** slider when current_tilt_position is in capabilities.
- **Fan card**: Toggle + percentage; optional **oscillate** switch, **direction** dropdown, and **preset** dropdown when supported by capabilities.
- **Lock card**: Lock / Unlock buttons + state label.
- **Media player card**: Title, track, transport (prev/play/next), volume slider, **Mute** and **Vol −/Vol +** buttons; optional **source** dropdown when source_list is in capabilities.
- **Backend**: Action-binding data values that start with `!lambda` are emitted as literal YAML (no quotes) so ESPHome lambdas work.

## v0.70.70

- **Binding and action binding overhaul**
  - **Delete widget cleans references**: Deleting a widget now removes all `project.links` and `project.action_bindings` that reference it (no orphan bindings).
  - **HA Bindings list**: Scrollable (max height) and grouped by widget type (Labels, Arcs, Sliders, Buttons, etc.). Groups are expandable/collapsible (default collapsed). Shows both display links and action bindings; ✎ indicates custom YAML override.
  - **Binding Builder**:
    - **Display | Action** tabs: add display bindings (HA → widget) or action bindings (widget event → HA service call).
    - Entity picker is a type-to-search dropdown (same behaviour as other entity comboboxes).
    - Attribute list is driven by the selected entity; target action list is filtered by selected widget type (e.g. only “Show as text” for labels).
    - Format and Scale have labels and short descriptions (printf-style format; numeric scale).
  - **Action bindings (model and UI)**:
    - `project.action_bindings[]`: `{ widget_id, event, call: { domain, service, entity_id?, data? }, yaml_override? }`. Compiler uses `yaml_override` when set, otherwise generates from `call`.
    - Event and service dropdowns are filtered by widget type and entity domain (only relevant options).
    - Thermostat card (and template insert) now outputs `action_bindings` in the same shape; compiler uses them so card-generated and manual bindings stay consistent.
  - **Manual YAML override**: Display links and action bindings support optional `yaml_override`. When set, the compiler uses it instead of generating from the structured fields. Binding Builder shows “Edit YAML” per binding; list and builder show ✎ when an override is set.
  - **Rename widget**: `renameWidgetInProject` now updates `action_bindings[].widget_id` as well as links and parent_id.

## v0.70.69

- **Friendly widget IDs**: Auto- and manually bound widgets get readable names from their binding (e.g. `living_room_temperature`, `living_room_hvac_mode`). Template insert uses entity_id + attribute to build ids; Binding Builder renames the widget when you add a link. **Widget ID (YAML)** is an editable field at the top of the Properties panel (commit on blur/Enter); rename updates the widget and all links/parent_id references.
- **Multi-select colour picker**: Colour fields in Common style when multiple widgets are selected now show the same colour picker (input type="color") as the single-widget Inspector.
- **Dropdown HA value (generic)**: Dropdown options stored as newline or backslash-n string are parsed so the list is correct; live override text from HA (label_text link) is shown as the selected value. attribute_text fallback to state when attribute is missing.

## v0.70.68

- **Multi-select common properties (dynamic)**: Common style and common props are no longer hardcoded. Schemas for all selected widget types are loaded; the intersection of style keys and of props keys across those schemas is shown. Only properties that exist on every selected type are editable together (layout + common style + common props). Loading state and “No style properties common to all selected widget types” when the intersection is empty.

## v0.70.67

- **Canvas text/background legibility**: All widget text and backgrounds now use `toFillColor()` so numeric colours (0xrrggbb) from templates render correctly; dropdown, textarea, and roller use consistent background and text colours.
- **Multi-select common style**: When multiple widgets are selected, the Properties panel shows **Common style** with **Text colour** and **Background colour**; changes apply to all selected widgets (hex #rrggbb or empty to clear).
- **Thermostat dropdowns show HA value**: HVAC, preset, and fan dropdowns are linked to `hvac_mode`, `preset_mode`, and `fan_mode` (attribute_text → label_text); Canvas uses live override text so the selected option displays the current HA value.

## v0.70.66

- **Thermostat name label**: Card title label is now bound to the entity’s `friendly_name` (attribute_text) so it shows the HA entity name.
- **Properties inspector**: Widget ID (YAML) is shown at the top of the Properties panel so developers can map the design to the generated YAML.
- **Inspector legibility**: Panel inputs, labels, and muted text use consistent contrast (background #1e293b, text #e5e7eb / #b8bfc9) so all fields are readable.

## v0.70.65

- **Thermostat HA data**: fetchStateBatch only uses response when res.ok; liveOverrides fallback to state when attribute_number is missing; label_number action supported for live text.
- **Thermostat arc**: Visible knob (template knob.radius 0x7FFF → 12; canvas caps large knob radius); numeric colors (0xrrggbb) converted to #rrggbb via toFillColor so arc track, indicator, and knob render correctly.

## v0.70.64

- **Properties panel**: Removed the widget list; panel shows only properties of the selected widget. With multiple widgets selected, shows “N widgets selected” and common layout (X, Y, Width, Height) that apply to all.
- **Card insert (thermometer/containers)**: When the template’s first widget is already a container, it is used as the group (no extra wrapper box). Clicking the card background now selects the visible container instead of a second outer box.
- **Live HA on canvas**: Polling fallback added so canvas widgets get HA state even when WebSocket is unavailable: initial batch fetch after 500 ms and polling every 8 s via `state/batch`.

## v0.70.63

- **Thermostat card (snippet-style)**: Full redesign: dark container, title + setpoint top-right, arc (120×120, 135°→45°) with current temp over arc, bottom row with − / setpoint / + buttons. +/- call generated scripts (th_inc_ / th_dec_) that read HA temperature sensor and call climate.set_temperature with current ± step. Optional HVAC / preset / fan rows in same style. Slider removed; arc only for setpoint.
- **Scripts in card recipe**: Thermostat card outputs scripts array; backend _compile_scripts(project) emits ESPHome script: block. Insert flow merges scripts into project.scripts with entity_id.
- **Live HA at design time (WebSocket)**: Backend GET /api/.../state/ws WebSocket: client sends subscribe with entity_ids, receives state_changed updates and initial state. Frontend uses WebSocket; canvas shows live HA values for bound widgets (labels, arc, slider, button checked).
- **Groups**: Card insert creates a container group; children have parent_id. Move/delete group moves/deletes children. **Resize group**: when a container with children is resized via Transformer, children positions and sizes scale proportionally.
- **Group membership in Properties**: Group section: show Parent (or None), Remove from group / Add to group dropdown; for containers, Children: N.
- **Binding Builder**: Current bindings box uses border-only styling (no solid background) so text is readable in all themes.

## v0.70.62

- **Thermostat card**: Lovelace-style arc for setpoint display (min–max range, 135°–45°). Arc is bound for two-way sync (HA → arc via `arc_value` link; arc drag → `climate.set_temperature`). Current/set labels sit beside the arc.
- **HA Bindings tab**: New “Links (what each widget is bound to)” list: each link shown as `widget_id → entity_id [attribute] · action`. Selected widget’s links are highlighted in the list.
- **Binding Builder tab**: When one widget is selected, “Current bindings for this widget” shows its links (entity [attribute] → action) or “No bindings”. When no widget or multiple widgets are selected, a short hint explains to select a single widget.
- **Recipe validate 404**: Frontend shows a friendly message when the validate endpoint returns 404 (“Recipe validation unavailable (update integration…)”) so device select and canvas still work.

## v0.70.61

- **Recipes validate 404**: RecipeValidateView now uses `f"/api/{DOMAIN}/recipes/validate"` so the route matches the integration’s DOMAIN and is registered correctly.
- **Insert catch (line 716)**: Catch block wrapped in try/catch so reporting the error never throws; message coerced with `String(... ?? "unknown")`; fallback toast "Insert failed (see console)." if reporting fails.

## v0.70.60

- **Insert fix (root cause)**: The "ge.id" / "me.id" error was from `allTemplates.find((t) => t.id === resolvedId)` at line 572 when `allTemplates` contained an undefined entry (e.g. from `pluginControls`). Guard the callback with `t &&` and filter `allTemplates` to valid template objects so `.find()` never receives undefined.

## v0.70.59

- **Insert**: Build `ws` in a loop so only widgets with valid `id` are pushed; sanitize current page.widgets (remove null/undefined) before appending so the next render never sees invalid entries. Console warnings when invalid widgets are skipped or stripped. Richer catch logging (template_id, built.widgets summary) to help identify the source of “Insert failed: me.id” errors.

## v0.70.58

- **Insert/Canvas robustness**: Canvas filters invalid widgets before use (safeWidgets). App uses a filtered widgets list for the current page and guards all list.find/list.filter over page.widgets so undefined entries don’t throw. applyTemplateWizard and lintProject filter bindings/links/widgets when iterating. Pages dropdown guards against undefined pages. No project normalizer — invalid data should be fixed at source.

## v0.70.57

- **Insert fix**: Avoid “undefined is not an object (evaluating 'me.id')” by filtering template widgets to valid objects and guarding idMap construction. Show “Template returned no widgets.” when a template returns no valid widgets.

## v0.70.56

- **Home Assistant Entity selector**: Replaced input + datalist with a filterable dropdown (combobox). The list is populated only with entities relevant to the card type using the template’s `entityDomain` (e.g. climate for Thermostat). Typing filters the list by entity_id and friendly_name. Label is “Home Assistant Entity”.
- **Insert button**: Fixed use-before-define of `entity_id` in the wizard; added try/catch and toasts so failures are visible (e.g. “No project loaded” when no device/project is selected).
- Templates can declare optional `entityDomain` for domain-filtered entity picker.

## v0.70.55

- Card Library (testing): only **Thermostat Card** is shown; other Card Library cards are temporarily disabled (titles prefixed with "Card Library disabled •") so the capability-driven Thermostat flow can be tested in isolation.

## v0.70.54

- **Card Library • Thermostat**: Single capability-driven Thermostat card. Layout is built from the bound entity’s capabilities: HVAC modes dropdown (only modes the entity supports), optional preset dropdown (if `preset_modes` present), optional fan dropdown (if `fan_modes` present). Temperature range and step use entity `min_temp` / `max_temp` / `target_temp_step` when available.

## v0.70.53

- Save project: prominent **Save** button in the top nav (next to Compile); label shows **Save (unsaved)** when there are changes. **Ctrl+S** / **Cmd+S** saves. Unsaved state is tracked; switching device or closing the tab prompts to avoid losing changes.

## v0.70.52

- Canvas previews now react to property changes: Arc knob (radius, width, height, bg_color), Slider knob (radius, width, height, bg_color), and Switch thumb (radius, width, height, bg_color) update live when edited in the Properties inspector.

## v0.70.51

- Canvas: LVGL-accurate previews for all widgets. Arc shows background arc, indicator arc, and knob (with rotation, angles, mode, knob_offset). Bar: track + indicator only; Slider: track + indicator + knob; both support vertical layout and range/symmetrical modes. Switch, LED (color + brightness), spinner (arc segment), line (points, width, color, rounded), roller (options + selected), dropdown, QR code (light/dark colors), chart (line/bar), tabview, tileview, buttonmatrix, keyboard, list, table, calendar, colorwheel, canvas, msgboxes all render to match LVGL structure.

## v0.70.50

- All LVGL widgets: every schema uses object-form `groups` so all properties are visible in the Properties inspector with collapsible sections (Arc, Bar, Slider: Knob/Indicator; Line, LED, QR code, Canvas, Textarea, Keyboard, etc.).
- New/compilable props: line (points, line_width, line_color, line_rounded), led (color, brightness), qrcode (light_color, dark_color), canvas (transparent, clip_corner), textarea (one_line, max_length), keyboard (mode, textarea_id), animimg (srcs, duration).
- Script `scripts/ensure_widget_groups.py` normalizes all widget schemas (groups object + every key in a group). Audit doc updated.

## v0.70.49

- Properties: auto-select Properties tab and widget/schema when dragging a widget onto canvas or applying a template.
- Arc widget: full LVGL properties (rotation, bg_start_angle, bg_end_angle, knob_offset, mode) and grouped inspector.
- Inspector: collapsible group sections when schema has `groups`; expand/collapse per group.

## v0.70.48

- Designer layout: center column width includes panel padding (12+36+width+12) so the canvas is never covered by the right panel.

## v0.70.47

- Designer layout: 20px gap between canvas and right panel so the right-hand border of the canvas is visible.

## v0.70.46

- Designer layout: right panel (Properties) aligned to canvas edge; center column width = canvas + Y-axis so canvas is never hidden under the panel on wide screens.

## v0.70.45

- Physical screen dimensions: prominent box above canvas (W×H px + source); visible outline around canvas.
- X/Y axis labels include actual max width/height when not a multiple of 100 (e.g. 1024, 480).
- Backend: extract resolution from recipe `display.dimensions.width/height` when present.

## v0.70.44

- Physical Pixels display in right panel (device.screen / recipe_id / default).
- Canvas axis grid layout: X-axis aligned with Y-axis (grid, X starts same place as Y).
- screenSize tracks source for debugging.

## v0.70.43

- Fix Card Library Insert: skip pickCapabilityVariant for Card Library templates (Cover card, etc.).
- Canvas sizing: derive screen size from hardware_recipe_id when device.screen missing (e.g. jc1060p470_esp32p4_1024x600 → 1024×600).
- X-axis: align 0 with canvas left edge (remove marginLeft), add direction:ltr.

## v0.70.42

- Fix Insert: resolve ha_auto to real template from entity domain (climate, light, cover, switch, etc.) so Home Assistant • Auto produces widgets.
- Apply wizard: defensive page/widgets checks; toast on success; click palette items to open wizard at (80,80).

## v0.70.41

- Canvas: LVGL-equivalent previews for all 32 Std LVGL palette widgets (switch, checkbox, dropdown, image, image_button, obj, textarea, roller, spinner, spinbox, qrcode, led, chart, line, tabview, tileview, buttonmatrix, keyboard, list, table, calendar, colorwheel, canvas, msgboxes).
- Canvas: Fix slider/bar and arc/gauge positioning to use absolute coordinates (ax, ay) for correct rendering inside containers.

## v0.70.40

- Fix axis labelling: Y axis uses LVGL convention (0,0 top-left, Y down).
- Fix canvas sizing: extract resolution from recipe ID when not in YAML (e.g. jc1060p470_esp32p4_1024x600 → 1024×600).

## v0.70.39

- Three-column designer layout: left palette | center canvas | right inspector.
- Left palette tabs: Std LVGL | Card Library | Home Assistant.
- Right inspector tabs: Properties | HA Bindings | Binding Builder.
- Canvas with X/Y axis numbering from device screen dimensions.
- Compile button on toolbar opens a modal with YAML output, recipe selector, deployment.

## v0.70.38

- Top toolbar: device dropdown, New device, Edit device, Delete.
- Devices section replaced by dropdown on toolbar; selecting loads device and populates canvas.
- API key generated when entering New device wizard step 2; shown as editable field with Regenerate/Copy.
- API key visibility: Edit modal shows key (plain text) and clearer persistence hint.

## v0.70.37

- Add per-device API encryption key for Home Assistant connectivity.
  - Generated on device creation (32-byte base64).
  - Stored with device; editable in Edit device modal with Regenerate and Copy.
  - Injected into compiled YAML as `api: encryption: key:` when set.
  - Included in project export/import.

## v0.70.36

- Move Create/Update Device form into Edit device modal; add Edit device button next to New device.
- Edit device form populates with selected device (name, filename); device_id shown read-only.

## v0.70.35

- Remove redundant LVGL Widgets section (duplicates Palette).

## v0.70.34

- Rename "slug" to "Filename" in the UI.
- Auto-fill Filename from device_id (both update together until user edits Filename).
- New device: ask for Friendly name first, derive device_id and Filename from it (legal chars: lowercase, underscores).

## v0.70.33

- Fix export preview/export "missing_entry_id": pass entry_id as query param to export APIs.
- Fix self-check 401: set requires_auth=False, add credentials to fetch.
- Disable Preview/Export buttons when entryId missing; show hint.

## v0.70.32

- Fix crash "Can't find variable: entityQuery": add missing Binding Builder state (entityQuery, bindEntity, bindAttr, bindAction, bindFormat, bindScale).
- Fix crash "Can't find variable: wizardIsCard" etc: move wizardTemplate, wizardIsCard, wizardIsMultiEntity, wizardEntitySlots, wizardWantsTapAction out of templateDomain into component scope.
- Fix Canvas.tsx: altKey type cast for Konva transform event.
- Fix controls/index.ts: type assertion for CONTROL_TEMPLATES array.

## v0.70.31

- Fix crash "undefined is not an object (evaluating 'Q.title')": filter invalid templates, add optional chaining for title/description, guard schemaIndex mapping.
- Fix api.ts: add missing apiGet/apiPost helpers (was crashing Assets panel, plugins, recipe validation, export).
- Fix App.tsx: import listAssets/uploadAsset from api instead of undefined api object.
- Fix entity attributes selector: safe handling when entity is undefined.
- Fix pages[safePageIndex] guards across group, ungroup, copy, paste, delete, add widget, update field, template wizard, canvas drop.
- Fix _findWidget(parentId) in groupSelected/ungroupSelected when parent is missing.
- Fix CONTROL_TEMPLATES.find() non-null assertions in controls/index.ts (ha_light_full, ha_climate_full).
- Fix Map.get()! non-null assertions in App.tsx and Canvas.tsx.

## v0.70.30

- Fix New device wizard: disable overlay click-to-close (was closing on Safari when typing in name field). Use X or Back/Create to close.

## v0.70.29

- Fix "Can't find variable: pluginControls" crash: add missing pluginControls state declaration.

## v0.70.28

- Fix New device wizard: only close on backdrop click (e.target === e.currentTarget), not when clicking/focusing inputs.

## v0.70.27

- Fix IndentationError in AssetsListView and AssetsUploadView (broken by requires_auth edit).

## v0.70.26

- Fix "Invalid handler specified": defer panel/storage imports in __init__.py so config flow loads without pulling in api.views.

## v0.70.25

- Fix "Invalid handler specified": remove options flow and simplify config flow to one-click add (no form).

## v0.70.24

- Fix "Invalid handler specified" on add integration: remove panel_iframe from after_dependencies (removed in HA 2025.1+).

## v0.70.23

- Fix "invalid authentication" (401) in Safari iframe: set requires_auth=False on all panel API views so fetch calls succeed when cookies are not sent.

## v0.70.22

- New device wizard: refetch recipes when opening; add Refresh button when empty; clearer empty-state message.

## v0.70.21

- Hardware-profile-first New device wizard: select recipe, then device details; backend enriches project with recipe resolution; auto-load new device for design.

## v0.70.20

- Fix Save device disabled: context API now requires_auth=False (iframe cookie issues).

## v0.70.19

- Fix ValueError "Overwriting panel": remove panel before re-registering; unregister on unload.

## v0.70.18

- Fix Save device disabled: fallback to first config entry when active_entry_id is missing.
- Show "Integration not ready" hint when context fails.

## v0.70.17

- Fix palette visibility: Editor scrollable (max-height 70vh), clearer empty-state hint.
- Fix LVGL palette drag-drop: use application/x-esphome-widget-type (was broken format).

## v0.70.16

- Fix "Can't find variable: setRecipes" crash: use ref for async recipe load (Safari closure).
- Fix compile tab JSX: wrap ternary branches in fragments.
- Fix controls/index.ts duplicate brace syntax.

## v0.70.15

- Fix AttributeError: use aiohttp web.Response instead of non-existent self.Response in panel.

## v0.70.14

- Fix 401 Unauthorized: set requires_auth=False on panel view (match postsi/ESPHomeDesigner).
- Add .cursor rule for version-and-release workflow.

## v0.70.13

- Fix AttributeError: use async_register_static_paths instead of deprecated register_static_path.

## v0.70.12

- Fix NameError: register EntitiesView (was EntitiesListView) so panel setup succeeds.

## v0.70.11

- Match postsi/ESPHomeDesigner: content_in_root false, no zip_release, manifest in custom_components/domain/ only.

## v0.70.9

- Restore root manifest.json (required by HACS for download validation).

## v0.70.8

- Fix HACS structure: remove root manifest.json, use standard layout (no content_in_root, no zip_release).
  Root cause of "No module named config_flow" was content_in_root + root manifest causing wrong files to be installed.

## v0.70.7

- Switch to zip_release to fix "No module named config_flow" - HACS now downloads a proper zip with correct structure.

## v0.70.6

- Fix Invalid handler: simplify config flow to match koosoli pattern (named ConfigFlow, single_instance, minimal options flow with super().__init__).

## v0.70.5

- Restore root manifest.json for HACS (required for content_in_root downloads).

## v0.70.4

- Fix "Invalid handler": restore options flow with `super().__init__()`, align with koosoli/ESPHomeDesigner.
- Remove root manifest; align manifest (configuration_url, after_dependencies, integration_type, loggers) and hacs.json (render_readme, homeassistant min).

## v0.70.3

- Simplify config flow to minimal one-click add (no form) to fix "Invalid handler" error.

## v0.70.2

- Remove options flow handler to fix "Invalid handler" error when adding integration.

## v0.70.1

- Add `config_flow: true` to manifest to fix UI Add Integration flow.
- Remove YAML config workaround.

## v0.70.0

- Hardware recipes (product polish):
  - Recipe Manager now supports **Export** (download YAML+metadata) and **Duplicate** (clone builtin or user recipes into a new custom recipe).
  - Backend adds:
    - `POST /api/esphome_touch_designer/recipes/clone`
    - `GET /api/esphome_touch_designer/recipes/{recipe_id}/export`
- Inspector polish:
  - Field tooltips from schema descriptions (where available).
  - Recent color swatches for color fields.
  - “Clear section” to remove all modified values in Props/Style/Events.
- Card Library additions:
  - Gauge card (arc + value label, numeric sensor binding).
  - Scene card and Script card (run actions).
  - Chips card (compact multi-entity state display).

- Adds **Import recipe…** flow to convert a raw ESPHome device YAML into a normalized hardware recipe (Option B).
  - Strips common non-hardware top-level blocks (wifi/api/ota/logger/etc.)
  - Ensures an `lvgl:` block exists
  - Injects the `#__LVGL_PAGES__` marker for designer page generation
- Adds backend endpoint: `/api/esphome_touch_designer/recipes/import`
- Adds v2 user recipe storage:
  - `/config/esphome_touch_designer/recipes/user/<slug>/recipe.yaml`
  - `/config/esphome_touch_designer/recipes/user/<slug>/metadata.json`
- Recipe listing supports **builtin + v2 user + legacy** single-file recipes.

## v0.63.0 — Built-in hardware recipe library (postsi/ESPHomeDesigner import)

- Imported the entire hardware device YAML set from postsi/ESPHomeDesigner (frontend/hardware) into built-in recipes.
- Added 15 new built-in recipes under `custom_components/esphome_touch_designer/recipes/builtin/`.
- Updated builtin recipe label map so they appear with friendly names in the UI.

## v0.60.0 — Card Library Phase 2 Enhancements (Lane B)

- Thermostat card: HVAC mode buttons now capability-aware (hvac_modes).
- Media card: mute (when available), volume up/down buttons, and best-effort source dropdown.
- Cover card: tilt controls added when tilt attributes are present.
- Glance and Grid cards: wizard multi-entity picker + per-row/tile tap action.
- Entity/Tile cards: call-service now supports optional service_data YAML.

## 0.59.0
- Card Library Phase 2: Thermostat Card, Media Control Card, Cover Card, Glance Card, Grid Card (2×2), and a Vertical Stack layout helper.
- Palette now automatically groups any template with title prefix "Card Library •" under the Card Library section.

## 0.53.0
- Added Fan Parity control template with optional oscillate/direction/preset controls (capability-aware enable/disable).

## 0.52.0
- Added Cover Parity control template with capability-aware enable/disable for position and tilt.

## 0.51.0
- Added Climate Parity control template (hvac + preset + fan mode dropdowns; capability-aware via wizard caps).

## v0.46.0
- Added Inspector font picker for `props.font` using uploaded .ttf/.otf assets (sets `asset:<file>:<size>`).

## v0.45.0
- Added best-effort UI loop-avoidance using global lock window (etd_ui_lock_until).
- Injects lock set before HA service calls and suppresses HA→UI updates during window.

## v0.42.0
- Implemented LVGL image widget compilation (widgets of type image now emit lvgl image YAML).
- Uses existing asset pipeline: props.src may be asset:<filename> and will compile to ESPHome image resources.

## v0.41.0
- Added cover/media_player/fan control templates with basic Lovelace-like interactions.
- Cover templates can auto-select position slider variant when current_position is available.

## v0.40.0
- Added capability-driven climate template variants (heat-only, heat/cool, full).
- Light sliders now emit service calls on release (reduces feedback loops/spam).

# Release Notes
## v0.33.0 (2026-02-18)
- Plugin system v1 (filesystem-based):
  - Reads custom control snippets and widget schema overrides from `/config/esphome_touch_designer_plugins/`.
  - Exposed via a backend endpoint so the frontend can merge/offer them without rebuilding the integration.

## v0.32.0 (2026-02-18)
- HA capability introspection v1:
  - Endpoint returns state attributes, supported_features, and available services for a given entity_id.
  - This is the foundation for “Lovelace-equivalent” control templates that adapt to actual device capabilities.

## v0.31.0 (2026-02-18)
- Preview fidelity: first-pass container flex layout preview (`flex_row` / `flex_col`) with gap + padding.
- Fix: LVGL palette drop now calls Canvas `onDropCreate` correctly.

## v0.30.0 (2026-02-18)
- Canvas UX: LVGL widget palette now supports drag-and-drop onto the canvas (similar to HA Controls).
- Drop position becomes the widget’s initial x/y for faster layouting.

## v0.29.0 (2026-02-18)
- Deployment workflow v1:
  - “Export” endpoint writes the compiled YAML into Home Assistant’s `/config/esphome/<slug>.yaml`.
  - This matches the ESPHome add-on’s default config folder, enabling a near one-click deploy from ESPHome UI.

## v0.28.0 (2026-02-18)
- Hardware recipe validator v1:
  - Backend endpoint validates built-in recipe YAML (parse + markers + basic required blocks).
  - Intended to catch obvious “this recipe can’t work” issues before compile/flash.

## v0.27.0 (2026-02-18)
- Assets pipeline v1:
  - Upload/list assets (JSON base64) from the Designer UI.
  - Compiler emits an `image:` section for widgets using `props.src: "asset:<filename>"`.

## v0.26.0 (2026-02-18)
- Schemas: expanded common LVGL style coverage (padding, radius, shadow) for core widgets (container/button/label/image_button).
- Inspector: these now show with typed editors (numbers + colors) and compile to YAML style keys.

## v0.25.0 (2026-02-18)
- Compiler: support multiline YAML fragments in widget properties (emits block scalars `|-`).
  This enables control templates to embed `on_click:` / `on_value:` `then:` blocks cleanly.

## v0.25.0 (2026-02-18)
- Compiler: support multiline YAML fragments in widget properties (emits block scalars `|-`).
  This enables control templates to embed `on_click:` / `on_value:` `then:` blocks cleanly.


## v0.9.0 — Live updates (HA -> LVGL) + HACS compliance

### Live updates
- Added `project.links[]` to express live update wiring from HA state/attributes to LVGL widgets.
- Compiler now attaches `on_value` / `on_state` triggers to generated `homeassistant` sensors to update LVGL widgets live (e.g. `lvgl.slider.update`, `lvgl.label.update`, `lvgl.widget.update`).

### HACS compliance
- Added `hacs.json` in repository root.
- Ensured integration `manifest.json` includes required keys: `documentation`, `issue_tracker`, `codeowners`, and `version`.

### Notes
- Control templates now include a first live update (Light toggle button stays synced with HA state).
- Next: extend templates + links for brightness, cover position, climate setpoint, media volume/title, etc.

## v0.10.0 — Canvas UX: multi-select, snapping grid, undo/redo, z-order

- Canvas now supports **multi-select** (Shift+Click), multi-drag, and multi-resize.
- Added **grid snapping** (configurable grid + toggle). Hold **Alt** to disable snapping for a drag/resize.
- Added **undo/redo** (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+Y) backed by a history stack.
- Added **copy/paste** (Ctrl/Cmd+C/V), duplicate via paste with offset.
- Added **z-order tools**: Bring Front / Send Back.
- Added keyboard **nudge** with arrow keys (Shift = 10px), and Delete/Backspace to remove selected widgets.

## v0.11.0 — Design-time HA entity picker + binding builder

- Added HA backend API endpoints to list entities and fetch entity details for design-time binding.
- Frontend now loads an entity snapshot and provides a searchable **entity picker**.
- Added **Binding Builder** UI to bind the selected widget to HA state/attributes and automatically create `bindings[]` + `links[]` for live updates.
- Compiler unchanged: it already translates `bindings[]` + `links[]` into ESPHome `homeassistant` sensors with LVGL update triggers.

## v0.12.0 — Lovelace-grade control templates + external hardware recipe support

### Controls
- Added **full** Home Assistant control templates:
  - Light: toggle + brightness slider + live feedback
  - Climate: hvac mode buttons + setpoint slider + live feedback
  - Cover: position slider + open/stop/close + live feedback
  - Media Player: title + transport + volume slider + live feedback

### Hardware recipes
- Recipes endpoint now returns **builtin + user recipes**.
- You can drop additional YAML recipes into:
  `/config/esphome_touch_designer/recipes/*.yaml`
  and they will appear as `Custom • <name>` in the recipe picker.

### Notes
- These templates are first-pass Lovelace equivalents; capability-gating (supported_features) and richer styling comes next.


## v0.13.0 — Hardware Recipe Packs

- Added automatic hardware recipe pack loader.
- Supports Built-in, User, and Pack recipes.
- Compatible with EnhancedESPHomeGUI hardware directory.
- Recipes auto-discovered under /config/esphome_touch_designer/recipe_packs/.

## v0.14.0 — Built-in hardware recipe: Waveshare ESP32-P4-WIFI6-Touch-LCD-4C

- Added built-in hardware recipe for Waveshare ESP32-P4-WIFI6-Touch-LCD-4C (720x720) with known-good pins and baseline DSI timings.
- Notes clarify ESPHome mipi_dsi usage via `model: CUSTOM`.

## v0.15.0 — Schema-first property handling: omit nulls + inspector clear + selection fixes

- **Compiler**: omits `null` / `None` values instead of emitting YAML like `text: null`.
  - This is important because ESPHome config validation often rejects `null` values.
- **Widget creation**: defaults are applied only when explicitly provided and non-null.
- **Inspector**: added a **clear** button per field to remove the property from the widget (so it stops being emitted).
- **Canvas selection plumbing**: fixed mismatches between `selectedWidgetIds` and older `selectedWidgetId` references.
  - Clicking a widget selects it; Shift+Click toggles it.
  - Clicking the empty canvas clears selection.


## v0.16.0 (2026-02-17)

### Canvas widget previews
- Canvas now renders **lightweight previews** for common widgets (currently: `label`, `button`, `slider/bar`, `arc/gauge`).
  - Still *not* a pixel-perfect LVGL renderer; the YAML compiler remains the source of truth.
  - The goal is to make layout work practical before we add a more faithful LVGL-style engine.

### No breaking changes
- Existing projects should load unchanged.


## v0.17.0 (2026-02-17)

### Style-aware Konva previews
- Canvas previews now respect common **style** properties (background, border, opacity, font size, text colour), using `style.*` as authoritative.
- Per-widget preview adornments (e.g. slider track/fill/knob colours) now read from `style.*` when present.

### Multi-page projects
- Projects can now contain **multiple pages**.
- Added a page selector + **Add page** button.
- Canvas and widget operations now apply to the currently selected page.

## v0.18.0 (2026-02-18)

- Added a richer widget schema pack (expanded LVGL widgets) and tightened compiler validation.

## v0.19.0 (2026-02-18)

- Added copy/paste improvements and first-pass container grouping/ungrouping.

## v0.20.0 (2026-02-18)

- Inspector: color picker + numeric sliders where min/max are known.
- Schema typing improvements for common color fields.

## v0.21.0 (2026-02-18)

- Palette: drag/drop **Home Assistant control templates** (macros) onto the canvas.
  - Drop inserts multiple widgets plus appends to `project.bindings[]` and `project.links[]`.
- Canvas: container preview can optionally **clip children** via `container.props.clip_children` (designer-only).

## v0.22.0 (2026-02-18)

- Added a **post-drop wizard** for Home Assistant Control Templates.
  - When you drag a HA Control onto the canvas, the designer now prompts for `entity_id` (and an optional label override) before inserting the macro.
- Minor UX improvements to reduce common "entity_id missing" mistakes during template usage.

## v0.24.0 (2026-02-18)

- Template wizard now provides an **entity picker** (HTML datalist) populated from Home Assistant at design time.
  - Picker is **domain-filtered** using the template id convention (e.g. `ha_light_*` → `light.*`).
- Added a **Project lint** panel in the Editor toolbar.
  - Flags common issues like: missing/dangling `links[].target.widget_id`, empty `entity_id` in bindings/links, and entity IDs not present in the current HA snapshot.
- Version bumps for HACS compliance (`manifest.json`, frontend package version).

## v0.35.0 (2026-02-19)

- Control template wizard now displays **entity capabilities** (domain, supported_features, select attributes) from HA.
- Added **plugin controls** loading from `/config/esphome_touch_designer_plugins/controls/*.json` and surfaces them in the “Home Assistant Controls” palette.
  - Plugin controls are inserted using the same post-drop wizard and will attempt placeholder substitution (best-effort).

## v0.36.0 (2026-02-19)

- Added **capability-driven variants** for HA control templates (first pass).
  - Light controls can now auto-select a better variant based on `supported_color_modes`.
  - Wizard includes a **Variant** selector (Auto / Toggle only / Toggle+Brightness / +Color Temp).

## v0.37.0 (2026-02-19)

- Added **best-effort hardening** for high-frequency widget events (first pass).
  - `on_value` / `on_press` / `on_release` actions that call `homeassistant.action` get a small, compiler-inserted delay to reduce service-call spam while dragging.
- Added starter **example projects** under `custom_components/esphome_touch_designer/examples/`.

## v0.38.0 (2026-02-19)

- Added a **font asset pipeline (first pass)**.
  - Upload `.ttf` / `.otf` via Assets.
  - Set `props.font` on labels/buttons to: `asset:MyFont.ttf:24`.
  - Compiler emits an ESPHome `font:` section and rewrites widget font references to generated font ids.

## v0.39.0 (2026-02-19)

- Export now supports **safe merges** into existing ESPHome YAML files.
  - Generated YAML is wrapped in markers:
    - `# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---`
    - `# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---`
  - On export, if those markers exist, only the generated block is replaced and user YAML outside is preserved.

## v0.43.0
- Enhanced `ha_media_basic` control: prev/next, mute, and volume slider uses `on_release` to avoid spamming.
- Added new `ha_cover_tilt` control template (best-effort mapping to cover tilt services).

## v0.44.0
- Template Wizard: added capability-based auto selection for `cover` (tilt vs basic) and `media_player` (rich vs basic).


## v0.47.0
- Added loop-avoidance globals (global + per-entity) and wrapped HA→UI updates to reduce feedback loops.
- UI-originated events that call `homeassistant.action` now set lock windows and include a tiny delay to reduce burst spam.


## v0.48.0
- Added `ha_media_player_rich` control template (title + artist + transport + volume).
- Media player volume slider uses on_release to reduce HA service call spam.

## v0.49.0
- Improved HA↔UI loop-avoidance:
  - Added per-link (entity + widget) lock globals (`etd_lock_<entity>_<widget>`).
  - HA→UI update actions are now gated per widget, not just per entity.
  - UI events that call `homeassistant.action` now set per-link locks for the originating widget.

## v0.50.0
- Template Wizard: added an expandable **Raw capabilities** JSON dump to make it easier to debug templates and build Lovelace-parity controls.


## v0.54.0
- Added HA control templates: ha_switch_parity, ha_lock_parity, ha_alarm_parity.
- Wizard auto-selects templates by entity domain via ha_auto.

## v0.55.0
- Added templates: ha_select_parity, ha_number_parity.

## v0.56.0
- Added helper templates: ha_input_boolean, ha_input_number, ha_input_select, ha_input_text.

## v0.57.0
- Added Card Library v1: entity_card and tile_card.

## v0.57.1
- Documentation refresh (CURRENT STATE / NEXT STEPS) and HACS version alignment.


## v0.61.0 — Phase 2 card wizard options
- Thermostat card: min/max/step controls (prefilled from capabilities when available)
- Media card: toggles for transport/volume/mute/source + optional default source
- Cover card: optional tilt controls (if supported)
- Glance card: row count variants (2/3/4/6)
- Grid card: size variants (2×2 / 3×2 / 3×3) + dynamic entity slots

## v0.62.0 — Verification + Layout Tools + Hardware Recipe Workflow

- Adds **Self-check** (verification suite) in the Compile view (compile determinism + safe-merge marker checks).
- Adds layout tools: **Align (L/C/R/T/M/B)** and **Distribute (H/V)** toolbar above canvas.
- Adds keyboard nudging: **Arrow keys** (grid step), **Shift+Arrow** (1px), **Alt+Arrow** (5px). Also **Ctrl+Alt+Arrows** for quick align.
- Documents user hardware recipe workflow in `docs/HARDWARE_RECIPES.md`.

## v0.67.0

- Product polish: Deployment preview (diff) + guarded export + basic ESPHome dashboard link.
- Conditional Card: show/hide container based on a simple condition expression.
- Inspector polish: search, modified-only filter, reset-to-default.

## v0.68.0

- Product-mode hardware recipe UX: select a recipe per device, show extracted metadata (platform/board/resolution/touch/backlight/psram), and show preflight validation warnings inline.
- Recipe validation endpoint now returns best-effort extracted metadata to support the UI.
- Deployment preview diff viewer upgraded with inline diff rendering, add/remove line highlighting, and a **Copy diff** button.
- Conditional Card wizard: simple, guided builder for common conditions (string equals/not-equals/contains, numeric comparisons).

## v0.69.0

- Adds **Recipe Manager** UI (Compile tab): list custom recipes, rename (label), delete, and show on-disk storage path.
- Backend adds recipe management endpoints:
  - `PATCH /api/esphome_touch_designer/recipes/user/{recipe_id}` (rename)
  - `DELETE /api/esphome_touch_designer/recipes/user/{recipe_id}` (delete)
- Legacy v1 recipes now support an optional sidecar label file (`<id>.metadata.json`).

