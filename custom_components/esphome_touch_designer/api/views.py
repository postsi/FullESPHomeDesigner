from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path


# --- v0.5: hardware recipes + LVGL YAML compiler ---
import base64
import os
import re
import secrets

RECIPES_BUILTIN_DIR = Path(__file__).resolve().parent.parent / "recipes" / "builtin"

# Placeholder in hardware recipes for the device name; compiler replaces with device slug (YAML-quoted).
ETD_DEVICE_NAME_PLACEHOLDER = "__ETD_DEVICE_NAME__"


def _integration_version() -> str:
    """Best-effort integration version (from manifest.json)."""
    try:
        manifest_path = Path(__file__).resolve().parent.parent / "manifest.json"
        data = json.loads(manifest_path.read_text("utf-8"))
        return str(data.get("version") or "0.0.0")
    except Exception:
        return "0.0.0"


def list_builtin_recipes() -> list[dict]:
    label_map = {
        "sunton_2432s028r_320x240": 'Sunton ESP32-2432S028R (2.8" 320x240)',
        "elecrow_dis05035h_480x320": 'Elecrow CrowPanel DIS05035H (3.5" 480x320)',
        "guition_jc3248w535_480x320": 'Guition JC3248W535 (3.5" 480x320)',
        "sunton_8048s043_800x480": 'Sunton ESP32-8048S043 (4.3" 800x480)',
        "elecrow_7inch_800x480": "Elecrow 7.0\\\" HMI 800x480",
        "guition_jc4827w543_480x272": "Guition jc4827w543 4.3\\\" IPS 480x272",
        "guition_jc8048w535_320x480": "Guition jc8048w535 3.5\\\" IPS 480x320 (320x480)",
        "guition_jc8048w550_800x480": "Guition JC8048W550 5.0\\\" 800x480",
        "guition_s3_4848s040_480x480": "Guition jc4848s040 4.0\\\" IPS 480x480",
        "jc1060p470_esp32p4_1024x600": "JC1060P470 7\\\" 1024x600 (ESP32-P4)",
        "lilygo_tdisplays3_170x320": "LilyGo T-Display S3 170x320",
        "sunton_2432s028_240x320": "Sunton 2432s028 2.8\\\" 240x320",
        "sunton_2432s028r_240x320": "Sunton 2432s028R 2.8\\\" 240x320 (Resistive)",
        "sunton_4827s032r_480x280": "Sunton 4827s032R 4.3\\\" 480x272 (Resistive) (480x280)",
        "sunton_8048s050_800x480": "Sunton 8048s050 5.0\\\" 800x480",
        "sunton_8048s070_800x480": "Sunton 8048s070 7.0\\\" 800x480",
        "waveshare_s3_touch_lcd_4.3_800x480": "Waveshare Touch LCD 4.3 4.3\\\" 800x480",
        "waveshare_s3_touch_lcd_7_800x480": "Waveshare Touch LCD 7 7.0\\\" 800x480",
        "waveshare_universal_epaper_7.5v2_800x480": "Waveshare Universal e-Paper Raw Panel Driver Board (800x480)",
    }
    out: list[dict] = []
    if not RECIPES_BUILTIN_DIR.exists():
        return out
    for p in sorted(RECIPES_BUILTIN_DIR.glob("*.yaml")):
        rid = p.stem
        out.append({"id": rid, "name": label_map.get(rid, rid.replace("_", " ")), "kind": "builtin", "path": str(p)})
    return out

def _compile_lvgl_pages(project: dict) -> str:
    pages = project.get("pages") or []
    if not pages:
        pages = [{"id": "main", "widgets": []}]
    page = pages[0] if isinstance(pages[0], dict) else {"id": "main", "widgets": []}
    widgets = page.get("widgets") or []

    def common(w: dict) -> str:
        x = int(w.get("x", 0))
        y = int(w.get("y", 0))
        width = int(w.get("w", 100))
        height = int(w.get("h", 50))
        wid = w.get("id") or "w"
        return f"        id: {wid}\n        x: {x}\n        y: {y}\n        width: {width}\n        height: {height}\n"

    out: list[str] = []
    out.append("  pages:\n")
    out.append(f"    - id: {page.get('id','main')}\n")
    out.append("      widgets:\n")

    for w in widgets:
        if not isinstance(w, dict):
            continue
        wtype = w.get("type")
        props = w.get("props") or {}
        if wtype == "label":
            txt = props.get("text", "Label")
            out.append("        - label:\n")
            out.append(common(w))
            out.append(f"        text: {json.dumps(str(txt))}\n")
        elif wtype == "button":
            txt = props.get("text", "Button")
            out.append("        - button:\n")
            out.append(common(w))
            out.append(f"        text: {json.dumps(str(txt))}\n")
        elif wtype == "arc":
            out.append("        - arc:\n")
            out.append(common(w))
            out.append(f"        min_value: {int(props.get('min_value', 0))}\n")
            out.append(f"        max_value: {int(props.get('max_value', 100))}\n")
            out.append(f"        value: {int(props.get('value', 0))}\n")
            out.append(f"        adjustable: {str(bool(props.get('adjustable', False))).lower()}\n")
        elif wtype == "slider":
            out.append("        - slider:\n")
            out.append(common(w))
            out.append(f"        min_value: {int(props.get('min_value', 0))}\n")
            out.append(f"        max_value: {int(props.get('max_value', 100))}\n")
            out.append(f"        value: {int(props.get('value', 0))}\n")
        elif wtype == "dropdown":
            opts = props.get("options") or ["Option A", "Option B"]
            sel = int(props.get("selected_index", 0))
            out.append("        - dropdown:\n")
            out.append(common(w))
            out.append("        options:\n")
            for o in opts:
                out.append(f"          - {json.dumps(str(o))}\n")
            out.append(f"        selected_index: {sel}\n")
        elif wtype == "image":
            src = (props.get("src") or "").strip()
            out.append("        - image:\n")
            out.append(common(w))
            if src:
                out.append(f"        src: {json.dumps(str(src))}\n")

        else:
            out.append("        - container:\n")
            out.append(common(w))

    return "".join(out)

def _inject_pages_into_recipe(recipe_text: str, pages_yaml: str) -> str:
    marker = "#__LVGL_PAGES__"
    if marker in recipe_text:
        return recipe_text.replace(marker, pages_yaml.rstrip())
    return recipe_text.rstrip() + "\n\n" + pages_yaml







def sha256(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()
def _safe_id(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", s)



def _compile_ha_bindings(project: dict) -> str:
    """Generate ESPHome homeassistant sensors for bound entities + attach live-update triggers.

    v0.9 scope:
    - Generate homeassistant platforms from project.bindings[]
    - Attach on_value/on_state triggers based on project.links[] that update LVGL widgets live.

    Link format (project.links[]):
      {
        "source": { "entity_id": "light.kitchen", "kind": "binary|state|attribute_number|attribute_text", "attribute": "brightness" },
        "target": { "widget_id": "btn1", "action": "widget_checked|slider_value|arc_value|label_text", "format": "%.0f", "scale": 1.0 }
      }
    """
    bindings = project.get("bindings") or []
    if not isinstance(bindings, list):
        bindings = []

    links = project.get("links") or []
    if not isinstance(links, list):
        links = []

    # Build a map: (kind, entity_id, attribute) -> list[link]
    link_map: dict[tuple[str, str, str], list[dict]] = {}
    for ln in links:
        if not isinstance(ln, dict):
            continue
        src = ln.get("source") or {}
        tgt = ln.get("target") or {}
        entity_id = str(src.get("entity_id") or "").strip()
        kind = str(src.get("kind") or "state").strip()
        attr = str(src.get("attribute") or "").strip()
        wid = str(tgt.get("widget_id") or "").strip()
        action = str(tgt.get("action") or "").strip()
        if not entity_id or "." not in entity_id or not wid or not action:
            continue
        link_map.setdefault((kind, entity_id, attr), []).append(ln)

    def emit_lvgl_updates(kind: str, entity_id: str, attr: str) -> str:
        outs: list[str] = []
        targets = link_map.get((kind, entity_id, attr), [])
        for ln in targets:
            tgt = ln.get("target") or {}
            wid = str(tgt.get("widget_id") or "").strip()
            wid_safe = _safe_id(wid)
            action = str(tgt.get("action") or "").strip()
            scale = tgt.get("scale")
            fmt = tgt.get("format")

            # v0.49: per-link lock gating. Each update checks the global lock,
            # per-entity lock, and per-link (entity+widget) lock.
            sid = _slugify_entity_id(entity_id)
            outs.append("            - if:\n")
            outs.append("                condition:\n")
            outs.append(
                f"                  lambda: return (millis() > id(etd_ui_lock_until)) && (millis() > id(etd_lock_{sid})) && (millis() > id(etd_lock_{sid}_{wid_safe}));\n"
            )
            outs.append("                then:\n")

            # v0.70: per-link yaml_override: use custom YAML when set (manual edit in editor).
            yaml_override = tgt.get("yaml_override")
            if isinstance(yaml_override, str) and yaml_override.strip():
                for line in yaml_override.strip().splitlines():
                    outs.append("                  " + line + "\n")
                continue

            if action == "widget_checked":
                outs.append("                  - lvgl.widget.update:\n")
                outs.append(f"                      id: {wid}\n")
                outs.append("                      state:\n")
                outs.append("                        checked: !lambda return x;\n")
            elif action == "slider_value":
                outs.append("                  - lvgl.slider.update:\n")
                outs.append(f"                      id: {wid}\n")
                if isinstance(scale, (int, float)) and float(scale) != 1.0:
                    outs.append(f"                      value: !lambda return (x * {float(scale)});\n")
                else:
                    outs.append("                      value: !lambda return x;\n")
            elif action == "arc_value":
                outs.append("                  - lvgl.arc.update:\n")
                outs.append(f"                      id: {wid}\n")
                if isinstance(scale, (int, float)) and float(scale) != 1.0:
                    outs.append(f"                      value: !lambda return (x * {float(scale)});\n")
                else:
                    outs.append("                      value: !lambda return x;\n")
            elif action == "label_text":
                outs.append("                  - lvgl.label.update:\n")
                outs.append(f"                      id: {wid}\n")
                if kind in ("state", "attribute_text"):
                    outs.append("                      text: !lambda return x;\n")
                else:
                    outs.append("                      text:\n")
                    outs.append(f"                        format: {json.dumps(str(fmt or '%.0f'))}\n")
                    outs.append("                        args: [ 'x' ]\n")

            elif action == "obj_hidden":
                # Show/hide an `obj` (or container) based on a condition.
                # Convention: hidden = !condition (so the object is visible when condition is true).
                expr = None
                try:
                    expr = (tgt.get("condition_expr") or "").strip()
                except Exception:
                    expr = ""
                outs.append("                  - lvgl.obj.update:\n")
                outs.append(f"                      id: {wid}\n")
                if expr:
                    outs.append(f"                      hidden: !lambda return !({expr});\n")
                else:
                    # Default: for binary sources, show when x is true (hidden when false).
                    outs.append("                      hidden: !lambda return !(x);\n")
        return "".join(outs)

    text_sensors: list[dict] = []
    sensors: list[dict] = []
    binary_sensors: list[dict] = []

    for b in sorted(bindings, key=lambda x: (str(x.get('kind') or 'state'), str(x.get('entity_id') or ''), str(x.get('attribute') or '')) ):
        if not isinstance(b, dict):
            continue
        entity_id = str(b.get("entity_id") or "").strip()
        if not entity_id or "." not in entity_id:
            continue
        kind = str(b.get("kind") or "state")
        attr = str(b.get("attribute") or "").strip()
        base_id = _safe_id(entity_id)

        if kind == "binary":
            binary_sensors.append({"id": f"ha_bin_{base_id}", "entity_id": entity_id, "kind": "binary", "attribute": ""})
        elif kind == "attribute_number":
            sensors.append({"id": f"ha_num_{base_id}_{_safe_id(attr or 'attr')}", "entity_id": entity_id, "kind": "attribute_number", "attribute": attr})
        elif kind == "attribute_text":
            text_sensors.append({"id": f"ha_txt_{base_id}_{_safe_id(attr or 'attr')}", "entity_id": entity_id, "kind": "attribute_text", "attribute": attr})
        else:
            text_sensors.append({"id": f"ha_state_{base_id}", "entity_id": entity_id, "kind": "state", "attribute": ""})

    def emit_text_sensor(items: list[dict]) -> str:
        if not items:
            return ""
        out = ["text_sensor:\n"]
        for it in items:
            out.append("  - platform: homeassistant\n")
            out.append(f"    id: {it['id']}\n")
            out.append(f"    entity_id: {it['entity_id']}\n")
            if it.get("attribute"):
                out.append(f"    attribute: {it['attribute']}\n")
            then = emit_lvgl_updates(it["kind"], it["entity_id"], it.get("attribute",""))
            if then:
                out.append("    on_value:\n")
                out.append("      then:\n")
                out.append("".join(("  " + ln + "\n") if ln else "\n" for ln in then.splitlines()))
        return "".join(out)

    def emit_sensor(items: list[dict]) -> str:
        if not items:
            return ""
        out = ["sensor:\n"]
        for it in items:
            out.append("  - platform: homeassistant\n")
            out.append(f"    id: {it['id']}\n")
            out.append(f"    entity_id: {it['entity_id']}\n")
            if it.get("attribute"):
                out.append(f"    attribute: {it['attribute']}\n")
            then = emit_lvgl_updates(it["kind"], it["entity_id"], it.get("attribute",""))
            if then:
                out.append("    on_value:\n")
                out.append("      then:\n")
                # `then` lines already start with 12 spaces ("            - ...").
                # Add 6 spaces so it nests under `then:` (which is indented 12 spaces).
                out.append("".join(("  " + ln + "\n") if ln else "\n" for ln in then.splitlines()))
        return "".join(out)

    def emit_binary_sensor(items: list[dict]) -> str:
        if not items:
            return ""
        out = ["binary_sensor:\n"]
        for it in items:
            out.append("  - platform: homeassistant\n")
            out.append(f"    id: {it['id']}\n")
            out.append(f"    entity_id: {it['entity_id']}\n")
            out.append("    publish_initial_state: true\n")
            then = emit_lvgl_updates("binary", it["entity_id"], "")
            if then:
                out.append("    on_state:\n")
                out.append("      then:\n")
                out.append("".join(("  " + ln + "\n") if ln else "\n" for ln in then.splitlines()))
        return "".join(out)

    out = []
    out.append(emit_text_sensor(text_sensors))
    out.append(emit_sensor(sensors))
    out.append(emit_binary_sensor(binary_sensors))
    return "".join(out).rstrip() + "\n" if any(out) else ""


def _compile_scripts(project: dict) -> str:
    """Emit ESPHome script: block for project.scripts (e.g. thermostat +/- setpoint inc/dec).

    Each script: { "id": "th_inc_xxx", "entity_id": "climate.xxx", "step": 0.5, "direction": "inc"|"dec" }.
    Uses the homeassistant sensor id ha_num_<slug>_temperature for current setpoint.
    """
    scripts = project.get("scripts") or []
    if not isinstance(scripts, list) or not scripts:
        return ""
    out = ["script:\n"]
    for s in scripts:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id") or "").strip()
        entity_id = str(s.get("entity_id") or "").strip()
        direction = str(s.get("direction") or "inc").strip().lower()
        step = float(s.get("step") if s.get("step") is not None else 0.5)
        if not sid or "." not in entity_id:
            continue
        slug = _safe_id(entity_id)
        sensor_id = f"ha_num_{slug}_temperature"
        if direction == "inc":
            expr = f"id({sensor_id}).state + {step}f"
        else:
            expr = f"id({sensor_id}).state - {step}f"
        out.append(f"  - id: {sid}\n")
        out.append("    then:\n")
        out.append("      - homeassistant.action:\n")
        out.append("          action: climate.set_temperature\n")
        out.append("          data:\n")
        out.append(f"            entity_id: {json.dumps(entity_id)}\n")
        out.append(f"            temperature: !lambda 'return {expr};'\n")
    return "".join(out).rstrip() + "\n" if len(out) > 1 else ""


def _split_esphome_block(recipe_text: str) -> tuple[str, str]:
    """Split recipe into (esphome_block, rest). esphome_block starts with 'esphome:' and runs to the next top-level key.
    Accepts a line that is optional BOM/whitespace + 'esphome:' + optional rest (whitespace, comment, or more)."""
    lines = recipe_text.splitlines()
    start_idx: int | None = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # Block start: optional BOM, optional leading space, then "esphome:" (rest of line can be anything)
        if re.match(r"^(?:\ufeff)?\s*esphome:", line):
            start_idx = i
            break
    if start_idx is None:
        return "", recipe_text
    end_idx = len(lines)
    for i in range(start_idx + 1, len(lines)):
        line = lines[i]
        if not line.strip():
            continue
        if line.strip().startswith("#"):
            continue
        # Next top-level key: no leading indent
        if (len(line) - len(line.lstrip())) == 0 and ":" in line:
            end_idx = i
            break
    esphome_block = "\n".join(lines[start_idx:end_idx])
    rest = "\n".join(lines[end_idx:]).strip()
    return esphome_block, rest


def _default_wifi_yaml() -> str:
    """Default wifi section when recipe does not include one."""
    return """wifi:
  networks:
    - ssid: !secret wifi_ssid
      password: !secret wifi_password
  ap:
    ssid: "Fallback"
    password: "12345678"
"""


def _default_ota_yaml() -> str:
    """Default ota section when recipe does not include one."""
    return """ota:
  - platform: esphome
"""


def _apply_user_injection(recipe_text: str, project: dict) -> str:
    adv = project.get("advanced") or {}
    pre = str(adv.get("yaml_pre", "") or "")
    post = str(adv.get("yaml_post", "") or "")
    markers = adv.get("markers") or {}

    def repl(text: str, marker: str, payload: str) -> str:
        token = f"#__{marker}__"
        if token in text:
            return text.replace(token, payload.rstrip())
        return text

    # Standard markers
    if pre:
        recipe_text = repl(recipe_text, "USER_YAML_PRE", pre)
        if "#__USER_YAML_PRE__" not in recipe_text:
            recipe_text = pre.rstrip() + "\n\n" + recipe_text
    else:
        recipe_text = recipe_text.replace("#__USER_YAML_PRE__", "")

    if post:
        recipe_text = repl(recipe_text, "USER_YAML_POST", post)
        if "#__USER_YAML_POST__" not in recipe_text:
            recipe_text = recipe_text.rstrip() + "\n\n" + post.rstrip() + "\n"
    else:
        recipe_text = recipe_text.replace("#__USER_YAML_POST__", "")

    # Arbitrary marker replacements (marker_name -> yaml)
    if isinstance(markers, dict):
        for k, v in markers.items():
            if not k:
                continue
            recipe_text = repl(recipe_text, str(k), str(v or ""))

    return recipe_text

def _compile_assets(project: dict) -> str:
    """Compile assets referenced by the project.

    v0.27 scope:
    - Supports image assets referenced as `props.src: "asset:<filename>"`
    - Emits an `image:` section with file references (expects files to exist under
      `/config/esphome_touch_designer_assets/<filename>` on the HA host).
    """
    pages = project.get("pages") or []
    assets: dict[str,str] = {}  # id -> filename
    for pg in pages if isinstance(pages, list) else []:
        for w in (pg.get("widgets") or []):
            if not isinstance(w, dict): 
                continue
            if str(w.get("type") or "") not in ("image","image_button"):
                continue
            props = w.get("props") or {}
            src = str(props.get("src") or "").strip()
            if src.startswith("asset:"):
                fn = src.split(":",1)[1].strip()
                if fn:
                    aid = "asset_" + _safe_id(fn)
                    assets[aid]=fn
    if not assets:
        return ""
    out=["image:\n"]
    for aid in sorted(assets.keys()):
        fn = assets[aid]
        out.append(f"  - file: /config/esphome_touch_designer_assets/{fn}\n")
        out.append(f"    id: {aid}\n")
    return "".join(out)


def _slugify_entity_id(entity_id: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_]+", "_", entity_id.strip().lower())
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "entity"

def _compile_ui_lock_globals(project: dict) -> str:
    """Emit globals used for loop-avoidance (UI-originated actions vs HA→UI updates).

    v0.49:
    - Always emit a global lock timestamp `etd_ui_lock_until` (ms).
    - Emit per-entity locks for every bound entity_id: `etd_lock_<slug>`.
    - Emit per-link (entity + widget) locks for every project link target:
      `etd_lock_<slug>_<widget_id>`.
    """
    bindings = project.get("bindings") or []
    entity_ids: list[str] = []
    if isinstance(bindings, list):
        for b in sorted(bindings, key=lambda x: (str(x.get('kind') or 'state'), str(x.get('entity_id') or ''), str(x.get('attribute') or '')) ):
            if isinstance(b, dict):
                eid = str(b.get("entity_id") or "").strip()
                if eid and "." in eid:
                    entity_ids.append(eid)
    entity_ids = sorted(set(entity_ids))

    # Per-link locks are keyed by (entity_id, widget_id) so that UI-originated
    # service calls can suppress only the specific widget updates that would
    # otherwise “rubber-band”.
    link_pairs: set[tuple[str, str]] = set()
    links = project.get("links") or []
    if isinstance(links, list):
        for ln in links:
            if not isinstance(ln, dict):
                continue
            src = ln.get("source") or {}
            tgt = ln.get("target") or {}
            eid = str(src.get("entity_id") or "").strip()
            wid = str(tgt.get("widget_id") or "").strip()
            if eid and "." in eid and wid:
                link_pairs.add((eid, _safe_id(wid)))

    out: list[str] = []
    out.append("globals:\n")
    out.append("  - id: etd_ui_lock_until\n")
    out.append("    type: uint32_t\n")
    out.append("    restore_value: no\n")
    out.append("    initial_value: '0'\n")
    for eid in entity_ids:
        sid = _slugify_entity_id(eid)
        out.append(f"  - id: etd_lock_{sid}\n")
        out.append("    type: uint32_t\n")
        out.append("    restore_value: no\n")
        out.append("    initial_value: '0'\n")

    for eid, wid in sorted(link_pairs):
        sid = _slugify_entity_id(eid)
        out.append(f"  - id: etd_lock_{sid}_{wid}\n")
        out.append("    type: uint32_t\n")
        out.append("    restore_value: no\n")
        out.append("    initial_value: '0'\n")
    out.append("\n")
    return "".join(out)

def compile_to_esphome_yaml(device: DeviceProject, recipe_text: str | None = None) -> str:
    """Compile a device project into a full ESPHome YAML document.

    - When recipe_text is None, loads the hardware recipe from RECIPES_BUILTIN_DIR.
    - When recipe_text is provided (e.g. by CompileView from same source as UI), uses it.
    - Injects optional user YAML (pre/post + markers).
    - Compiles LVGL pages (schema-driven) and inserts at the pages marker.
    - Compiles HA bindings and inserts at the bindings marker.
    """

    project = device.project or {}
    recipe_id = (
        (project.get("hardware") or {}).get("recipe_id")
        or device.hardware_recipe_id
        or "sunton_2432s028r_320x240"
    )
    if recipe_text is None:
        recipe_path = RECIPES_BUILTIN_DIR / f"{recipe_id}.yaml"
        recipe_text = recipe_path.read_text("utf-8") if recipe_path.exists() else ""

    assets_yaml = _compile_assets(project)
    ha_bindings_yaml = _compile_ha_bindings(project)
    scripts_yaml = _compile_scripts(project)
    # v0.38: font extraction (first pass).
    fonts_yaml, font_id_map = _compile_fonts_from_project(project)
    if font_id_map:
        project = _rewrite_widget_font_references(project, font_id_map)

    pages_yaml = _compile_lvgl_pages_schema_driven(project)

    locks_yaml = _compile_ui_lock_globals(project)

    recipe_text = _apply_user_injection(recipe_text, project)

    # Inject HA bindings at marker only (do not prepend; order is handled below)
    if "#__HA_BINDINGS__" in recipe_text:
        recipe_text = recipe_text.replace("#__HA_BINDINGS__", ha_bindings_yaml.rstrip())
    elif ha_bindings_yaml.strip():
        recipe_text = recipe_text.rstrip() + "\n\n" + ha_bindings_yaml.rstrip() + "\n"

    merged = _inject_pages_into_recipe(recipe_text, pages_yaml)

    # If recipe references manage_run_and_sleep (e.g. on_boot display refresh) but doesn't define it, inject a minimal stub.
    if "manage_run_and_sleep" in merged and "id: manage_run_and_sleep" not in scripts_yaml and "id: manage_run_and_sleep" not in merged:
        stub = "  - id: manage_run_and_sleep\n    then:\n      - delay: 1ms\n"
        if scripts_yaml.strip():
            scripts_yaml = scripts_yaml.rstrip() + "\n" + stub.rstrip() + "\n"
        else:
            scripts_yaml = "script:\n" + stub

    # Emit in standard order: esphome first, then api, wifi, ota, then rest of recipe.
    # Recipes declare the device name with the placeholder; we replace it once at the end.
    esphome_block, rest = _split_esphome_block(merged)
    name_placeholder_line = "  name: " + ETD_DEVICE_NAME_PLACEHOLDER
    if not esphome_block.strip() and "esphome:" not in rest:
        esphome_block = "esphome:\n" + name_placeholder_line + "\n"
    elif not esphome_block.strip() and "esphome:" in rest:
        rest = re.sub(
            r"(?m)^((?:\ufeff)?\s*esphome:\s*(?:#.*)?)\r?\n",
            r"\1\n" + name_placeholder_line + r"\n",
            rest,
            count=1,
        )
    else:
        # Recipe has esphome block; ensure placeholder is the first key (recipes should already have it).
        lines = esphome_block.splitlines()
        if not lines:
            esphome_block = "esphome:\n" + name_placeholder_line + "\n"
        else:
            rest_lines = [ln for ln in lines[1:] if not re.match(r"^  name\s*:", ln)]
            first_line = lines[0].lstrip("\ufeff \t") or "esphome:"
            if first_line.startswith("esphome:"):
                first_line = "esphome:"
            esphome_block = first_line + "\n" + name_placeholder_line + "\n" + "\n".join(rest_lines) + ("\n" if rest_lines else "")

    # Add default wifi/ota if recipe does not already include them (top-level key)
    def has_top_level_key(text: str, key: str) -> bool:
        t = "\n" + text
        return f"\n{key}:" in t or text.strip().startswith(f"{key}:")
    wifi_yaml = _default_wifi_yaml() if not has_top_level_key(rest, "wifi") else ""
    ota_yaml = _default_ota_yaml() if not has_top_level_key(rest, "ota") else ""

    # Explicit YAML document start so parsers don't complain (e.g. "expected document start, but found block mapping")
    header = (
        "---\n"
        f"# Generated by {DOMAIN} v{_integration_version()}\n"
        f"# device_id: {device.device_id}\n"
        f"# slug: {device.slug}\n"
        "\n"
    )
    out = header
    if esphome_block.strip():
        out += esphome_block.rstrip() + "\n\n"

    # API encryption key for Home Assistant connectivity (32-byte base64)
    if device.api_key and str(device.api_key).strip():
        out += (
            "api:\n"
            "  encryption:\n"
            f"    key: {json.dumps(device.api_key.strip())}\n"
            "\n"
        )
    if wifi_yaml:
        out += wifi_yaml.rstrip() + "\n\n"
    if ota_yaml:
        out += ota_yaml.rstrip() + "\n\n"
    out += rest + "\n\n"
    if locks_yaml.strip():
        out += locks_yaml.rstrip() + "\n\n"
    if scripts_yaml.strip():
        out += scripts_yaml.rstrip() + "\n\n"
    if fonts_yaml.strip():
        out += fonts_yaml.rstrip() + "\n\n"
    if assets_yaml.strip():
        out += assets_yaml.rstrip() + "\n"
    # Replace recipe placeholder with the device slug (YAML-quoted).
    out = out.replace(ETD_DEVICE_NAME_PLACEHOLDER, json.dumps(device.slug or "device"))
    return out


def _compile_fonts_from_project(project: dict) -> tuple[str, dict[str, str]]:
    """Return (fonts_yaml, font_id_map).

    We support a lightweight descriptor format used in widget props:
      - font: "asset:MyFont.ttf:24"  -> emits an ESPHome `font:` entry and rewrites to generated id.

    Files are expected to be uploaded via the integration Assets API and stored under:
      /config/esphome_touch_designer_assets
    """

    used: dict[tuple[str, int], str] = {}

    def scan_widget(w: dict):
        props = w.get("props") or {}
        f = props.get("font")
        if not isinstance(f, str):
            return
        f = f.strip()
        if not f.startswith("asset:"):
            return
        # asset:<filename>:<size>
        try:
            _, rest = f.split("asset:", 1)
            filename, size_s = rest.rsplit(":", 1)
            filename = filename.strip()
            size = int(size_s.strip())
            if not filename or size <= 0:
                return
            used.setdefault((filename, size), "")
        except Exception:
            return

    for page in (project.get("pages") or []):
        for w in (page.get("widgets") or []):
            scan_widget(w)

    if not used:
        return "", {}

    # Generate stable ids.
    font_id_map: dict[str, str] = {}
    lines = ["font:\n"]
    idx = 1
    for (filename, size) in sorted(used.keys()):
        safe = re.sub(r"[^a-zA-Z0-9_]+", "_", Path(filename).stem)
        fid = f"font_{safe}_{size}_{idx}"
        idx += 1
        used[(filename, size)] = fid
        font_id_map[f"asset:{filename}:{size}"] = fid
        lines.append(f"  - file: /config/esphome_touch_designer_assets/{filename}\n")
        lines.append(f"    id: {fid}\n")
        lines.append(f"    size: {size}\n")

    return "".join(lines), font_id_map


def _rewrite_widget_font_references(project: dict, font_id_map: dict[str, str]) -> dict:
    # Deep copy with minimal overhead.
    p = json.loads(json.dumps(project))
    for page in (p.get("pages") or []):
        for w in (page.get("widgets") or []):
            props = w.get("props") or {}
            f = props.get("font")
            if isinstance(f, str):
                key = f.strip()
                if key in font_id_map:
                    props["font"] = font_id_map[key]
                    w["props"] = props
    return p

from aiohttp import web
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.http import HomeAssistantView

from ..const import DOMAIN
from ..storage import DeviceProject


def _active_entry_id(hass: HomeAssistant) -> str | None:
    data = hass.data.get(DOMAIN, {})
    eid = data.get("active_entry_id")
    if eid and eid in data:
        return eid
    # Fallback: use first config entry (e.g. after unload/reload left active_entry_id cleared)
    for k, v in data.items():
        if k != "active_entry_id" and isinstance(v, dict) and "storage" in v:
            return k
    return None


def _get_storage(hass: HomeAssistant, entry_id: str):
    return hass.data[DOMAIN][entry_id]["storage"]


def _schemas_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "schemas" / "widgets"

# --- v0.6: schema-driven widget emission ---
def _load_widget_schema(widget_type: str) -> dict | None:
    p = _schemas_dir() / f"{widget_type}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text("utf-8"))


def _yaml_quote(v) -> str:
    # Use JSON quoting for strings to keep YAML safe (ESPHome accepts it)
    if isinstance(v, str):
        return json.dumps(v)
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    return str(v)


def _emit_kv(indent: str, key: str, value) -> str:
    """Emit a YAML key/value fragment.

    Notes:
      - We omit None/null values by default.
      - Multiline strings are emitted as a block scalar (|-), which is used
        heavily for ESPHome action fragments inside events.
    """
    if value is None:
        return ""

    if isinstance(value, list):
        out = [f"{indent}{key}:\n"]
        for item in value:
            out.append(f"{indent}  - {_yaml_quote(item)}\n")
        return "".join(out)

    if isinstance(value, dict):
        out = [f"{indent}{key}:\n"]
        for k, v in value.items():
            out.append(f"{indent}  {k}: {_yaml_quote(v)}\n")
        return "".join(out)

    if isinstance(value, str) and "\n" in value:
        out = [f"{indent}{key}: |-\n"]
        for ln in value.splitlines():
            out.append(f"{indent}  {ln}\n")
        return "".join(out)

    return f"{indent}{key}: {_yaml_quote(value)}\n"


def _action_binding_call_to_yaml(call: dict) -> str:
    """Generate ESPHome YAML for homeassistant.action from action_binding call (domain, service, entity_id, data)."""
    if not isinstance(call, dict):
        return ""
    domain = str(call.get("domain") or "").strip()
    service = str(call.get("service") or "").strip()
    if not domain or not service:
        return ""
    entity_id = call.get("entity_id")
    data = call.get("data") or {}
    lines = [
        "then:",
        "  - homeassistant.action:",
        f"      action: {domain}.{service}",
        "      data:",
    ]
    if entity_id:
        lines.append(f"        entity_id: {json.dumps(str(entity_id))}")
    for k, v in data.items():
        if v is None:
            continue
        vstr = str(v).strip()
        if vstr.startswith("!lambda"):
            lines.append(f"        {k}: {vstr}")
        else:
            lines.append(f"        {k}: {json.dumps(v)}")
    if not entity_id and not data:
        lines.append("        {}")
    return "\n".join(lines)


def _emit_widget_from_schema(widget: dict, schema: dict, action_bindings_for_widget: list | None = None) -> str:
    wtype = widget.get("type") or schema.get("type")
    esphome = schema.get("esphome", {})
    root_key = esphome.get("root_key") or wtype  # e.g. "label", "button"

    out: list[str] = []
    out.append(f"        - {root_key}:\n")

    # geometry
    wid = widget.get("id") or "w"
    out.append(f"        id: {wid}\n")
    for geom_key, yaml_key in [("x","x"),("y","y"),("w","width"),("h","height")]:
        if geom_key in widget:
            out.append(f"        {yaml_key}: {int(widget.get(geom_key, 0))}\n")

    action_by_event = {}
    if action_bindings_for_widget:
        for ab in action_bindings_for_widget:
            if isinstance(ab, dict) and ab.get("event"):
                action_by_event[str(ab["event"])] = ab

    def _maybe_harden_event(yaml_key: str, v):
        # v0.37: best-effort runtime hardening for high-frequency controls.
        # Many HA controls (sliders) can spam service calls while dragging.
        # We don't have full bidirectional loop-avoidance yet, but a small
        # delay helps collapse bursts when combined with ESPHome's internal
        # action queue.
        if section != "events":
            return v
        if not isinstance(v, str):
            return v
        if yaml_key not in ("on_value", "on_press", "on_release"):
            return v
        if "homeassistant.action" not in v:
            return v
        if "delay" in v:
            return v
        # v0.47: add lightweight loop-avoidance + delay after `then:` if present.
        # If we can extract an entity_id from the YAML snippet, also set a per-entity lock.
        m_eid = re.search(r"^\s*entity_id:\s*([A-Za-z0-9_]+\.[A-Za-z0-9_]+)\s*$", v, re.M)
        lock_lines = []
        # Always set the global lock.
        lock_lines.append("  - lambda: id(etd_ui_lock_until) = millis() + 500;")
        if m_eid:
            sid = _slugify_entity_id(m_eid.group(1))
            lock_lines.append(f"  - lambda: id(etd_lock_{sid}) = millis() + 500;")
            # v0.49: also set a per-link (entity+widget) lock if this widget has
            # HA links, so HA→UI updates for the same entity/widget are paused.
            wid_safe = _safe_id(str(wid))
            lock_lines.append(f"  - lambda: id(etd_lock_{sid}_{wid_safe}) = millis() + 500;")

        lines = v.splitlines()
        out = []
        inserted = False
        for ln in lines:
            out.append(ln)
            if not inserted and ln.strip() == "then:":
                # Insert lock(s) first, then a small delay to reduce burst spam.
                out.extend(lock_lines)
                out.append("  - delay: 150ms")
                inserted = True
        return "\n".join(out)

    for section in ("props", "style", "events"):
        mapping = (esphome.get(section) or {})
        fields = schema.get(section) or {}
        values = dict(widget.get(section) or {})
        # For events: prefer action_binding for this widget (yaml_override or generated from call).
        if section == "events" and action_by_event:
            for event_key, ab in action_by_event.items():
                if ab.get("yaml_override"):
                    values[event_key] = ab.get("yaml_override")
                elif ab.get("call"):
                    values[event_key] = _action_binding_call_to_yaml(ab["call"])
                # else keep widget.events[event_key] if present
        for k, field_def in fields.items():
            yaml_key = mapping.get(k, k)
            if k in values and values[k] not in (None, ""):
                out.append(_emit_kv("        ", yaml_key, _maybe_harden_event(yaml_key, values[k])))
            else:
                if field_def.get("compiler_emit_default", False) and "default" in field_def:
                    out.append(_emit_kv("        ", yaml_key, field_def.get("default")))
        # Emit action_binding events that are not in schema (e.g. arc on_release when schema has events: {}).
        if section == "events" and action_by_event:
            for event_key, ab in action_by_event.items():
                if event_key in fields:
                    continue  # already emitted above
                yaml_key = (esphome.get("events") or {}).get(event_key) or event_key
                if ab.get("yaml_override"):
                    out.append(_emit_kv("        ", yaml_key, _maybe_harden_event(yaml_key, ab["yaml_override"])))
                elif ab.get("call"):
                    out.append(_emit_kv("        ", yaml_key, _maybe_harden_event(yaml_key, _action_binding_call_to_yaml(ab["call"]))))

    # Style parts and nested blocks: any schema section that is a dict of field defs (not props/style/events)
    _skip = {"props", "style", "events", "type", "title", "esphome", "groups"}
    for part_section, part_fields in (schema or {}).items():
        if part_section in _skip or not isinstance(part_fields, dict):
            continue
        if not part_fields or not any(
            isinstance(v, dict) and ("type" in v or "default" in v)
            for v in part_fields.values()
        ):
            continue
        values = widget.get(part_section) or {}
        if not values:
            continue
        out.append(f"        {part_section}:\n")
        for k, field_def in part_fields.items():
            if k not in values:
                continue
            v = values[k]
            if v is None or v == "":
                continue
            out.append(_emit_kv("          ", k, v))

    return "".join(out)


def _compile_lvgl_pages_schema_driven(project: dict) -> str:
    """Compile LVGL pages from the project model.

    v0.18: supports container-style parenting via `parent_id` and emits nested
    `widgets:` blocks where applicable.
    """

    pages = project.get("pages") or []
    if not isinstance(pages, list) or not pages:
        pages = [{"page_id": "main", "name": "Main", "widgets": []}]

    action_bindings_raw = project.get("action_bindings") or []
    action_bindings_by_widget: dict[str, list[dict]] = {}
    for ab in action_bindings_raw:
        if not isinstance(ab, dict):
            continue
        wid = str(ab.get("widget_id") or "").strip()
        if not wid:
            continue
        action_bindings_by_widget.setdefault(wid, []).append(ab)

    def children_map(all_widgets: list[dict]) -> dict[str, list[dict]]:
        m: dict[str, list[dict]] = {}
        for w in all_widgets:
            pid = str(w.get("parent_id") or "")
            if not pid:
                continue
            m.setdefault(pid, []).append(w)
        return m

    def emit_widget(w: dict, indent: str, kids: dict[str, list[dict]]) -> str:
        wtype = w.get("type")
        wid = str(w.get("id") or "")
        ab_list = action_bindings_by_widget.get(wid) or []
        schema = _load_widget_schema(str(wtype)) if wtype else None
        if schema:
            # _emit_widget_from_schema uses fixed indentation (8 spaces). We re-indent by post-processing.
            raw = _emit_widget_from_schema(w, schema, ab_list)
            lines = raw.splitlines(True)
            # Replace the leading 8 spaces with requested indent.
            out_lines = []
            for ln in lines:
                if ln.startswith("        "):
                    out_lines.append(indent + ln[8:])
                else:
                    out_lines.append(indent + ln)
            out = "".join(out_lines)
        else:
            wid = w.get("id") or "w"
            out = "".join(
                [
                    f"{indent}- container:\n",
                    f"{indent}  id: {wid}\n",
                    f"{indent}  x: {int(w.get('x', 0))}\n",
                    f"{indent}  y: {int(w.get('y', 0))}\n",
                    f"{indent}  width: {int(w.get('w', 100))}\n",
                    f"{indent}  height: {int(w.get('h', 50))}\n",
                ]
            )

        # Children: nest under `widgets:`. ESPHome LVGL supports this for containers and many widgets.
        wid = str(w.get("id") or "")
        child_list = kids.get(wid) or []
        if child_list:
            out += f"{indent}  widgets:\n"
            for c in child_list:
                out += emit_widget(c, indent + "    ", kids)
        return out

    out: list[str] = []
    out.append("  pages:\n")
    for page in pages:
        if not isinstance(page, dict):
            continue
        pid = page.get("page_id") or page.get("id") or "main"
        name = page.get("name") or ""
        out.append(f"    - id: {pid}\n")
        if name:
            out.append(f"      name: {_yaml_quote(name)}\n")
        out.append("      widgets:\n")
        all_widgets = page.get("widgets") or []
        if not isinstance(all_widgets, list):
            all_widgets = []
        kids = children_map([w for w in all_widgets if isinstance(w, dict)])
        roots = [w for w in all_widgets if isinstance(w, dict) and not w.get("parent_id")]
        for w in roots:
            out.append(emit_widget(w, "        ", kids))

    return "".join(out)





# --- Hardware Recipe Loading (Builtin + User + Packs) ---

from pathlib import Path

def _collect_recipe_files(hass):
    """Return list of (name, path, source) for all recipes."""
    recipes = []

    base_dir = Path(hass.config.path(""))
    builtin_dir = Path(__file__).resolve().parent.parent / "recipes" / "builtin"
    user_dir = base_dir / "esphome_touch_designer" / "recipes"
    packs_dir = base_dir / "esphome_touch_designer" / "recipe_packs"

    # Builtin
    if builtin_dir.exists():
        for f in sorted(builtin_dir.glob("*.yaml")):
            recipes.append({
                "name": f.stem,
                "path": str(f),
                "source": "builtin",
                "label": f"Built-in • {f.stem}"
            })

    # User recipes
    if user_dir.exists():
        for f in sorted(user_dir.glob("*.yaml")):
            recipes.append({
                "name": f.stem,
                "path": str(f),
                "source": "user",
                "label": f"Custom • {f.stem}"
            })

    # Recipe packs
    if packs_dir.exists():
        for pack in sorted(packs_dir.iterdir()):
            if not pack.is_dir():
                continue
            for f in sorted(pack.glob("*.yaml")):
                recipes.append({
                    "name": f.stem,
                    "path": str(f),
                    "source": "pack",
                    "pack": pack.name,
                    "label": f"{pack.name} • {f.stem}"
                })

    return recipes

class ContextView(HomeAssistantView):
    url = f"/api/{DOMAIN}/context"
    name = f"api:{DOMAIN}:context"
    requires_auth = False  # Panel loads in iframe; context needed before session may be available

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        entry_id = _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)
        return self.json({"ok": True, "entry_id": entry_id})


class HealthView(HomeAssistantView):
    url = f"/api/{DOMAIN}/health"
    name = f"api:{DOMAIN}:health"
    requires_auth = True

    async def get(self, request):
        return self.json({"ok": True, "version": _integration_version()})



class DiagnosticsView(HomeAssistantView):
    """Lightweight diagnostics for troubleshooting (used by Lane A hardening)."""

    url = f"/api/{DOMAIN}/diagnostics"
    name = f"api:{DOMAIN}:diagnostics"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        entry_id = _active_entry_id(hass)
        device_count = 0
        if entry_id:
            storage = _get_storage(hass, entry_id)
            device_count = len(storage.state.devices)
        return self.json({
            "ok": True,
            "version": _integration_version(),
            "entry_id": entry_id,
            "device_count": device_count,
        })





class SelfCheckView(HomeAssistantView):
    """Run built-in verification suite checks.

    These checks are designed for personal-use "bullet proof" confidence:
    - compile determinism (same project compiles to identical YAML twice)
    - recipe discovery (builtin + user folder visibility)
    - safe merge marker invariants (no silent corruption)

    NOTE: This does not write or deploy anything.
    """

    url = f"/api/{DOMAIN}/self_check"
    name = f"api:{DOMAIN}:self_check"
    requires_auth = False

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        results: list[dict] = []

        # 1) Recipe discovery
        try:
            recipes = list_all_recipes(hass)
            results.append({
                "name": "recipes_list",
                "ok": True,
                "detail": {"count": len(recipes), "first": recipes[0] if recipes else None},
            })
        except Exception as e:
            results.append({"name":"recipes_list", "ok": False, "error": str(e)})

        # 2) Compile determinism on representative mini-projects
        samples = [
            {
                "name": "sample_basic_label",
                "project": {
                    "model_version": 1,
                    "hardware": {"recipe_id": "sunton_2432s028r_320x240"},
                    "pages": [{
                        "page_id": "main",
                        "name": "Main",
                        "widgets": [{
                            "id": "lbl1",
                            "type": "label",
                            "x": 10, "y": 10, "w": 120, "h": 32,
                            "props": {"text": "Hello"},
                            "style": {},
                            "events": {},
                        }]
                    }],
                    "bindings": [],
                    "assets": {"images": [], "fonts": []},
                },
            },
            {
                "name": "sample_entity_card_light",
                "project": {
                    "model_version": 1,
                    "hardware": {"recipe_id": "sunton_2432s028r_320x240"},
                    "pages": [{
                        "page_id": "main",
                        "name": "Main",
                        "widgets": [],
                    }],
                    "bindings": [],
                    "assets": {"images": [], "fonts": []},
                    "palette": {},
                    # A minimal card drop usually expands into widgets; for determinism we just ensure compiler runs.
                },
            },
        ]

        for s in samples:
            try:
                dev = DeviceProject(
                    device_id=f"selfcheck_{s['name']}",
                    slug=f"selfcheck_{s['name']}",
                    name=f"SelfCheck {s['name']}",
                    hardware_recipe_id=(s["project"].get("hardware") or {}).get("recipe_id"),
                    device_settings={},
                    project=s["project"],
                )
                y1 = compile_to_esphome_yaml(dev)
                y2 = compile_to_esphome_yaml(dev)
                results.append({
                    "name": f"compile_determinism:{s['name']}",
                    "ok": y1 == y2 and bool(y1.strip()),
                    "detail": {"len": len(y1), "identical": y1 == y2},
                })
            except Exception as e:
                results.append({"name": f"compile_determinism:{s['name']}", "ok": False, "error": str(e)})

        # 3) Safe merge marker invariant checks (pure string-level; does not touch disk)
        try:
            begin = "# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---"
            end = "# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---"
            sample_generated = f"{begin}\n# generated\n{end}\n"
            # Case: insert into empty file
            merged = _safe_merge_markers("", sample_generated)
            ok_insert = begin in merged and end in merged
            # Case: duplicate markers should raise
            dup = f"{begin}\nA\n{end}\n{begin}\nB\n{end}\n"
            err_dup = None
            try:
                _safe_merge_markers(dup, sample_generated)
            except Exception as e:
                err_dup = str(e)
            results.append({
                "name": "safe_merge_markers",
                "ok": ok_insert and bool(err_dup),
                "detail": {"insert_ok": ok_insert, "duplicate_error": err_dup},
            })
        except Exception as e:
            results.append({"name":"safe_merge_markers", "ok": False, "error": str(e)})

        ok = all(r.get("ok") for r in results)
        return self.json({"ok": ok, "version": _integration_version(), "results": results})


def _safe_merge_markers(existing_text: str, generated_block: str) -> str:
    """Pure helper: merge (or insert) the generated block using the required marker lines.

    This is used by SelfCheck and mirrors the export behavior without touching disk.
    """
    begin = "# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---"
    end = "# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---"

    if begin not in generated_block or end not in generated_block:
        raise ValueError("generated_block_missing_markers")

    # Count markers in existing
    bcount = existing_text.count(begin)
    ecount = existing_text.count(end)

    if bcount == 0 and ecount == 0:
        # Insert at end with a blank line separator
        if existing_text and not existing_text.endswith("\n"):
            existing_text += "\n"
        if existing_text and not existing_text.endswith("\n\n"):
            existing_text += "\n"
        return existing_text + generated_block

    if bcount != 1 or ecount != 1:
        raise ValueError(f"marker_count_mismatch begin={bcount} end={ecount}")

    bidx = existing_text.find(begin)
    eidx = existing_text.find(end)
    if eidx < bidx:
        raise ValueError("marker_order_invalid")

    # Replace block content including markers
    eidx_end = eidx + len(end)
    before = existing_text[:bidx]
    after = existing_text[eidx_end:]
    # Preserve surrounding newlines
    if before and not before.endswith("\n"):
        before += "\n"
    if after and not after.startswith("\n"):
        after = "\n" + after
    return before + generated_block + after

class SchemasView(HomeAssistantView):
    url = f"/api/{DOMAIN}/schemas/widgets"
    name = f"api:{DOMAIN}:schemas_widgets"
    requires_auth = False  # Panel iframe: Safari may not send cookies; panel access is gated by sidebar

    async def get(self, request):
        schemas_path = _schemas_dir()
        items = []
        for p in sorted(schemas_path.glob("*.json")):
            try:
                data = json.loads(p.read_text("utf-8"))
                items.append({
                    "type": data.get("type", p.stem),
                    "title": data.get("title", p.stem),
                    "description": data.get("description", ""),
                })
            except Exception:
                continue
        return self.json({"ok": True, "schemas": items})


class SchemaDetailView(HomeAssistantView):
    url = f"/api/{DOMAIN}/schemas/widgets/{{widget_type}}"
    name = f"api:{DOMAIN}:schemas_widgets_detail"
    requires_auth = False

    async def get(self, request, widget_type: str):
        schemas_path = _schemas_dir() / f"{widget_type}.json"
        if not schemas_path.exists():
            return self.json({"ok": False, "error": "schema_not_found"}, status_code=404)
        data = json.loads(schemas_path.read_text("utf-8"))
        return self.json({"ok": True, "schema": data})


class DevicesView(HomeAssistantView):
    url = f"/api/{DOMAIN}/devices"
    name = f"api:{DOMAIN}:devices"
    requires_auth = False

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)
        storage = _get_storage(hass, entry_id)
        return self.json({
            "ok": True,
            "devices": [
                {
                    "device_id": d.device_id,
                    "slug": d.slug,
                    "name": d.name,
                    "hardware_recipe_id": d.hardware_recipe_id,
                    "api_key": d.api_key,
                }
                for d in storage.state.devices.values()
            ]
        })

    async def post(self, request):
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)

        body = await request.json()
        storage = _get_storage(hass, entry_id)

        existing = storage.get_device(body["device_id"])
        api_key = body.get("api_key")
        if existing is not None:
            api_key = api_key if api_key is not None and str(api_key).strip() else existing.api_key
        else:
            if not api_key or not str(api_key).strip():
                api_key = base64.b64encode(secrets.token_bytes(32)).decode()

        project = body.get("project")
        if project is None and existing is not None:
            project = existing.project

        device_settings = body.get("device_settings")
        if device_settings is None and existing is not None:
            device_settings = existing.device_settings

        device = DeviceProject(
            device_id=body["device_id"],
            slug=body.get("slug", body["device_id"]).lower().replace(" ", "_"),
            name=body.get("name", body["device_id"]),
            hardware_recipe_id=body.get("hardware_recipe_id"),
            api_key=api_key or None,
            device_settings=device_settings if device_settings is not None else {},
            project=project if project is not None else DeviceProject.__dataclass_fields__["project"].default_factory(),  # type: ignore
        )
        storage.upsert_device(device)
        await storage.async_save()
        return self.json({"ok": True})

    async def delete(self, request):
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)

        device_id = request.query.get("device_id")
        if not device_id:
            return self.json({"ok": False, "error": "missing_device_id"}, status_code=400)
        storage = _get_storage(hass, entry_id)
        ok = storage.delete_device(device_id)
        if ok:
            await storage.async_save()
        return self.json({"ok": ok})


class DeviceProjectView(HomeAssistantView):
    url = f"/api/{DOMAIN}/devices/{{device_id}}/project"
    name = f"api:{DOMAIN}:device_project"
    requires_auth = False

    async def get(self, request, device_id: str):
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)
        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)
        project = dict(device.project) if device.project else {}
        # Enrich project with device.screen from recipe when device has hardware_recipe_id
        if device.hardware_recipe_id:
            screen = (project.get("device") or {}).get("screen") or {}
            if not (screen.get("width") and screen.get("height")):
                recipe_path = _find_recipe_path_by_id(hass, device.hardware_recipe_id)
                if recipe_path and recipe_path.exists():
                    try:
                        meta = _extract_recipe_metadata_from_text(recipe_path.read_text("utf-8"), recipe_id=device.hardware_recipe_id)
                        res = meta.get("resolution")
                        if isinstance(res, dict) and res.get("width") and res.get("height"):
                            project.setdefault("device", {})
                            project["device"]["hardware_recipe_id"] = device.hardware_recipe_id
                            project["device"]["screen"] = {
                                "width": int(res["width"]),
                                "height": int(res["height"]),
                            }
                    except Exception:
                        pass
        return self.json({"ok": True, "project": project})

    async def put(self, request, device_id: str):
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)
        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)
        body = await request.json()
        project = body.get("project")
        if not isinstance(project, dict):
            return self.json({"ok": False, "error": "invalid_project"}, status_code=400)
        device.project = project
        storage.upsert_device(device)
        await storage.async_save()
        return self.json({"ok": True})





def _read_recipe_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _user_recipes_root(hass: HomeAssistant) -> Path:
    """Root folder for user-managed recipes.

    We support both:
      v1 legacy: /config/esphome_touch_designer/recipes/*.yaml
      v2:        /config/esphome_touch_designer/recipes/user/<slug>/recipe.yaml (+ metadata.json)

    The v2 layout enables per-recipe metadata and future assets.
    """
    root = Path(hass.config.path("esphome_touch_designer")) / "recipes"
    root.mkdir(parents=True, exist_ok=True)
    return root


def list_all_recipes(hass) -> list[dict]:
    """Return builtin + user-provided recipes."""
    recipes: list[dict] = []

    # Built-in (integration shipped)
    for r in list_builtin_recipes():
        r["builtin"] = True
        r.setdefault("source", "builtin")
        recipes.append(r)

    # User recipes (config directory)
    try:
        root = _user_recipes_root(hass)

        # v2 structured recipes
        v2_dir = root / "user"
        if v2_dir.exists():
            for recipe_dir in sorted([p for p in v2_dir.iterdir() if p.is_dir()]):
                p = recipe_dir / "recipe.yaml"
                if p.exists():
                    rid = recipe_dir.name
                    meta_path = recipe_dir / "metadata.json"
                    meta = None
                    if meta_path.exists():
                        try:
                            meta = json.loads(meta_path.read_text("utf-8"))
                        except Exception:
                            meta = None
                    recipes.append({
                        "id": rid,
                        "label": (meta or {}).get("label") or f"Custom • {rid}",
                        "path": str(p),
                        "builtin": False,
                        "source": "user",
                        "meta": meta,
                    })

        # v1 legacy single-file recipes (keep supported for backwards compatibility)
        for p in sorted(root.glob("*.yaml")):
            rid = p.stem
            meta_path = root / f"{rid}.metadata.json"
            meta = None
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text("utf-8"))
                except Exception:
                    meta = None
            recipes.append({
                "id": rid,
                "label": (meta or {}).get("label") or f"Custom • {rid}",
                "path": str(p),
                "builtin": False,
                "source": "legacy",
                "meta": meta,
            })
    except Exception:
        # best-effort only
        pass

    # Stable ordering for UI (builtin first, then custom)
    def _sort_key(r: dict):
        return (0 if r.get("builtin") else 1, str(r.get("label") or r.get("id") or ""))

    return sorted(recipes, key=_sort_key)


class RecipesView(HomeAssistantView):
    url = f"/api/{DOMAIN}/recipes"
    name = f"api:{DOMAIN}:recipes"
    requires_auth = False

    async def get(self, request):
        hass = request.app["hass"]
        return self.json({"ok": True, "recipes": list_all_recipes(hass)})


class RecipeUserUpdateView(HomeAssistantView):
    """Update a user/legacy recipe label."""

    url = f"/api/{DOMAIN}/recipes/user/{{recipe_id}}"
    name = f"api:{DOMAIN}:recipes_user_update"
    requires_auth = False

    async def patch(self, request, recipe_id: str):
        hass = request.app["hass"]
        body = await request.json()
        label = body.get("label")
        if not isinstance(label, str) or not label.strip():
            return self.json({"ok": False, "error": "invalid_label"}, status_code=400)

        root = _user_recipes_root(hass)

        # v2 recipe
        v2_dir = root / "user" / recipe_id
        if v2_dir.exists() and v2_dir.is_dir():
            meta_path = v2_dir / "metadata.json"
            meta = {}
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text("utf-8"))
                except Exception:
                    meta = {}
            meta["label"] = label.strip()
            meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True), encoding="utf-8")
            return self.json({"ok": True})

        # v1 legacy recipe
        legacy = root / f"{recipe_id}.yaml"
        if legacy.exists():
            meta_path = root / f"{recipe_id}.metadata.json"
            meta = {}
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text("utf-8"))
                except Exception:
                    meta = {}
            meta["label"] = label.strip()
            meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True), encoding="utf-8")
            return self.json({"ok": True})

        return self.json({"ok": False, "error": "recipe_not_found"}, status_code=404)


class RecipeUserDeleteView(HomeAssistantView):
    """Delete a user/legacy recipe."""

    url = f"/api/{DOMAIN}/recipes/user/{{recipe_id}}"
    name = f"api:{DOMAIN}:recipes_user_delete"
    requires_auth = False

    async def delete(self, request, recipe_id: str):
        hass = request.app["hass"]
        root = _user_recipes_root(hass)

        # v2 recipe folder
        v2_dir = root / "user" / recipe_id
        if v2_dir.exists() and v2_dir.is_dir():
            for p in sorted(v2_dir.rglob("*"), reverse=True):
                try:
                    if p.is_file() or p.is_symlink():
                        p.unlink(missing_ok=True)
                    elif p.is_dir():
                        p.rmdir()
                except Exception:
                    pass
            try:
                v2_dir.rmdir()
            except Exception:
                pass
            return self.json({"ok": True})

        # v1 legacy recipe file
        legacy = root / f"{recipe_id}.yaml"
        if legacy.exists():
            try:
                legacy.unlink(missing_ok=True)
            except Exception:
                return self.json({"ok": False, "error": "delete_failed"}, status_code=500)
            meta_path = root / f"{recipe_id}.metadata.json"
            try:
                meta_path.unlink(missing_ok=True)
            except Exception:
                pass
            return self.json({"ok": True})

        return self.json({"ok": False, "error": "recipe_not_found"}, status_code=404)




class EntitiesView(HomeAssistantView):
    """List Home Assistant entities for design-time binding."""

    url = "/api/esphome_touch_designer/entities"
    name = "api:esphome_touch_designer:entities"
    requires_auth = False

    async def get(self, request):
        hass = request.app["hass"]
        # Return a compact list for pickers/search
        items = []
        for st in hass.states.async_all():
            attrs = dict(st.attributes or {})
            items.append({
                "entity_id": st.entity_id,
                "state": st.state,
                "attributes": attrs,
                "friendly_name": attrs.get("friendly_name"),
                "icon": attrs.get("icon"),
                "device_class": attrs.get("device_class"),
                "unit_of_measurement": attrs.get("unit_of_measurement"),
            })
        return self.json(items)


class EntityView(HomeAssistantView):
    """Get one entity state/attributes for inspector previews."""

    url = "/api/esphome_touch_designer/entity/{entity_id}"
    name = "api:esphome_touch_designer:entity"
    requires_auth = False

    async def get(self, request, entity_id):
        hass = request.app["hass"]
        entity_id = entity_id.replace(",", ".")  # simple path-safe hack if needed
        st = hass.states.get(entity_id)
        if not st:
            return self.json({"error": "not_found", "entity_id": entity_id}, status_code=404)
        attrs = dict(st.attributes or {})
        return self.json({
            "entity_id": st.entity_id,
            "state": st.state,
            "attributes": attrs,
            "friendly_name": attrs.get("friendly_name"),
            "icon": attrs.get("icon"),
            "device_class": attrs.get("device_class"),
            "unit_of_measurement": attrs.get("unit_of_measurement"),
        })


class StateBatchView(HomeAssistantView):
    """Batch fetch entity states for live design-time preview (links → canvas)."""

    url = f"/api/{DOMAIN}/state/batch"
    name = f"api:{DOMAIN}:state_batch"
    requires_auth = False

    async def post(self, request):
        body = await request.json() if request.can_read_body else {}
        entity_ids = body.get("entity_ids") if isinstance(body, dict) else []
        if not isinstance(entity_ids, list):
            entity_ids = []
        entity_ids = [str(e).strip() for e in entity_ids if str(e).strip() and "." in str(e)]
        hass = request.app["hass"]
        states = {}
        for eid in entity_ids[:100]:
            st = hass.states.get(eid)
            if st:
                states[eid] = {"state": st.state, "attributes": dict(st.attributes or {})}
        return self.json({"states": states})


class StateWebSocketView(HomeAssistantView):
    """WebSocket endpoint for live state updates (design-time preview)."""

    url = f"/api/{DOMAIN}/state/ws"
    name = f"api:{DOMAIN}:state_ws"
    requires_auth = False

    async def get(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        hass: HomeAssistant = request.app["hass"]
        entity_ids: set = set()
        unsub = None

        async def send_state(eid: str) -> None:
            st = hass.states.get(eid)
            if st:
                payload = json.dumps({
                    "type": "state",
                    "entity_id": eid,
                    "state": st.state,
                    "attributes": dict(st.attributes or {}),
                })
                try:
                    await ws.send_str(payload)
                except Exception:
                    pass

        async def state_changed_listener(event):
            eid = event.data.get("entity_id") if isinstance(event.data, dict) else None
            if eid and eid in entity_ids:
                await send_state(eid)

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        if data.get("type") == "subscribe":
                            ids = data.get("entity_ids")
                            if isinstance(ids, list):
                                entity_ids.clear()
                                entity_ids.update(str(e).strip() for e in ids if str(e).strip() and "." in str(e))
                            if unsub is not None:
                                unsub()
                            unsub = hass.bus.async_listen("state_changed", state_changed_listener)
                            for eid in list(entity_ids)[:100]:
                                await send_state(eid)
                        elif data.get("type") == "unsubscribe":
                            if unsub is not None:
                                unsub()
                                unsub = None
                            entity_ids.clear()
                    except (json.JSONDecodeError, TypeError):
                        pass
                elif msg.type in (web.WSMsgType.CLOSE, web.WSMsgType.ERROR):
                    break
        finally:
            if unsub is not None:
                unsub()
        return ws


class CompileView(HomeAssistantView):
    url = f"/api/{DOMAIN}/devices/{{device_id}}/compile"
    name = f"api:{DOMAIN}:compile"
    requires_auth = False

    async def post(self, request, device_id: str):
        """Compile ESPHome YAML for a device.

        Modes:
        - stored: compile the stored device project.
        - preview: if request JSON includes `project` and/or `hardware_recipe_id`,
          compile that model without mutating HA storage (used by live Compile tab).
        """
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)

        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)

        body = None
        try:
            if request.can_read_body:
                body = await request.json()
        except Exception:
            body = None

        project_override = None
        recipe_override = None
        if isinstance(body, dict):
            if isinstance(body.get("project"), dict):
                project_override = body.get("project")
            if isinstance(body.get("hardware_recipe_id"), str) and body.get("hardware_recipe_id").strip():
                recipe_override = body.get("hardware_recipe_id").strip()

        # Load recipe from same source as UI (builtin or user via _find_recipe_path_by_id)
        project = device.project or {}
        recipe_id = (
            (project.get("hardware") or {}).get("recipe_id")
            or device.hardware_recipe_id
            or "sunton_2432s028r_320x240"
        )
        recipe_path = _find_recipe_path_by_id(hass, recipe_id) or (RECIPES_BUILTIN_DIR / f"{recipe_id}.yaml")
        recipe_text = recipe_path.read_text("utf-8") if recipe_path.exists() else ""

        if project_override is not None or recipe_override is not None:
            original_project = device.project
            original_recipe = device.hardware_recipe_id
            try:
                if project_override is not None:
                    device.project = project_override
                if recipe_override is not None:
                    device.hardware_recipe_id = recipe_override
                # Re-resolve recipe_id and recipe_text when override is present
                proj = device.project or {}
                rid = (proj.get("hardware") or {}).get("recipe_id") or device.hardware_recipe_id or recipe_id
                rpath = _find_recipe_path_by_id(hass, rid) or (RECIPES_BUILTIN_DIR / f"{rid}.yaml")
                rtext = rpath.read_text("utf-8") if rpath.exists() else ""
                yaml_text = compile_to_esphome_yaml(device, recipe_text=rtext)
            finally:
                device.project = original_project
                device.hardware_recipe_id = original_recipe
            yaml_text = yaml_text.replace(ETD_DEVICE_NAME_PLACEHOLDER, json.dumps(device.slug or "device"))
            return self.json({"ok": True, "yaml": yaml_text, "mode": "preview"})

        yaml_text = compile_to_esphome_yaml(device, recipe_text=recipe_text)
        yaml_text = yaml_text.replace(ETD_DEVICE_NAME_PLACEHOLDER, json.dumps(device.slug or "device"))
        return self.json({"ok": True, "yaml": yaml_text, "mode": "stored"})


class ValidateYamlView(HomeAssistantView):
    """Validate compiled YAML with ESPHome CLI (esphome compile) without flashing."""

    url = f"/api/{DOMAIN}/validate_yaml"
    name = f"api:{DOMAIN}:validate_yaml"
    requires_auth = False

    async def post(self, request):
        """POST { \"yaml\": \"...\" } — run esphome compile on the config and return ok/stdout/stderr."""
        try:
            body = await request.json()
        except Exception:
            return self.json({"ok": False, "error": "invalid_json", "stderr": "", "stdout": ""}, status_code=400)
        yaml_text = (body.get("yaml") or "").strip()
        if not yaml_text:
            return self.json({"ok": False, "error": "empty_yaml", "stderr": "", "stdout": ""}, status_code=400)

        fd = None
        path = None
        try:
            fd, path = tempfile.mkstemp(suffix=".yaml", prefix="esphome_validate_")
            os.write(fd, yaml_text.encode("utf-8"))
            os.close(fd)
            fd = None

            proc = await asyncio.create_subprocess_exec(
                "esphome",
                "compile",
                path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(Path(path).parent),
            )
            stdout_bytes, stderr_bytes = await proc.communicate()
            stdout_str = (stdout_bytes or b"").decode("utf-8", errors="replace")
            stderr_str = (stderr_bytes or b"").decode("utf-8", errors="replace")
            ok = proc.returncode == 0
            return self.json({
                "ok": ok,
                "stdout": stdout_str,
                "stderr": stderr_str,
                "returncode": proc.returncode,
            })
        except FileNotFoundError:
            return self.json({
                "ok": False,
                "error": "esphome_cli_not_found",
                "stdout": "",
                "stderr": "The 'esphome' command was not found. Install ESPHome CLI (pip install esphome) or use the ESPHome add-on.",
            })
        except Exception as e:
            return self.json({
                "ok": False,
                "error": "validation_failed",
                "stdout": "",
                "stderr": str(e),
            })
        finally:
            if fd is not None:
                try:
                    os.close(fd)
                except Exception:
                    pass
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception:
                    pass


class DeployView(HomeAssistantView):
    url = f"/api/{DOMAIN}/deploy"
    name = f"api:{DOMAIN}:deploy"
    requires_auth = False

    async def post(self, request):
        hass: HomeAssistant = request.app["hass"]
        entry_id = request.query.get("entry_id") or _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)

        body = await request.json()
        device_id = body["device_id"]

        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)

        pages = device.project.get("pages", [])
        widget_count = sum(len(p.get("widgets", [])) for p in pages if isinstance(p, dict))
        yaml_text = (
            f"# Generated by {DOMAIN} vv0.25.0\n"
            f"# device_id: {device.device_id}\n"
            f"# slug: {device.slug}\n"
            f"# widgets: {widget_count}\n"
            "\n"
            f"esphome:\n  name: {device.slug}\n"
            "\n"
            "## compiled from recipe + project model\n"
        )

        esphome_dir = Path(hass.config.path("esphome"))
        esphome_dir.mkdir(parents=True, exist_ok=True)
        target = esphome_dir / f"{device.slug}.yaml"
        tmp = esphome_dir / f".{device.slug}.yaml.tmp"
        bak = esphome_dir / f"{device.slug}.yaml.bak"

        if target.exists():
            try:
                bak.write_text(target.read_text("utf-8"), encoding="utf-8")
            except Exception:
                pass

        tmp.write_text(yaml_text, encoding="utf-8")
        tmp.replace(target)

        return self.json({"ok": True, "path": str(target)})


def register_api_views(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register all HTTP API views for the integration."""
    hass.http.register_view(ContextView)
    hass.http.register_view(HealthView)
    hass.http.register_view(DiagnosticsView)
    hass.http.register_view(SelfCheckView)

    # Schemas / devices
    hass.http.register_view(SchemasView)
    hass.http.register_view(SchemaDetailView)
    hass.http.register_view(DevicesView)
    hass.http.register_view(DeviceProjectView)

    # Hardware recipes
    hass.http.register_view(RecipesView)
    hass.http.register_view(RecipeCloneView)
    hass.http.register_view(RecipeExportView)
    hass.http.register_view(RecipeUserUpdateView)
    hass.http.register_view(RecipeUserDeleteView)
    hass.http.register_view(RecipeValidateView)
    hass.http.register_view(RecipeImportView)

    # Build / deploy / export
    hass.http.register_view(CompileView)
    hass.http.register_view(ValidateYamlView)
    hass.http.register_view(DeployView)
    hass.http.register_view(DeviceExportPreviewView)
    hass.http.register_view(DeviceExportView)

    # Project backup/restore
    hass.http.register_view(DeviceProjectExportView)
    hass.http.register_view(DeviceProjectImportView)

    # Assets
    hass.http.register_view(AssetsListView)
    hass.http.register_view(AssetsUploadView)

    # Home Assistant entity helpers
    hass.http.register_view(EntitiesView)
    hass.http.register_view(EntityView)
    hass.http.register_view(StateBatchView)
    hass.http.register_view(StateWebSocketView)
    hass.http.register_view(EntityCapabilitiesView)

    # Plugins
    hass.http.register_view(PluginsListView)


def _assets_dir(hass: HomeAssistant) -> Path:
    p = Path(hass.config.path("esphome_touch_designer_assets"))
    p.mkdir(parents=True, exist_ok=True)
    return p

class AssetsListView(HomeAssistantView):
    url = "/api/esphome_touch_designer/assets"
    name = "api:esphome_touch_designer:assets"
    requires_auth = False

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        p = _assets_dir(hass)
        items = []
        for f in sorted(p.iterdir()):
            if f.is_file():
                ext = f.suffix.lower().lstrip(".")
                kind = "font" if ext in ("ttf", "otf") else ("image" if ext in ("png", "jpg", "jpeg", "webp", "bmp") else "file")
                items.append({"name": f.name, "size": f.stat().st_size, "kind": kind})
        return self.json(items)

class AssetsUploadView(HomeAssistantView):
    url = "/api/esphome_touch_designer/assets/upload"
    name = "api:esphome_touch_designer:assets_upload"
    requires_auth = False

    async def post(self, request):
        hass: HomeAssistant = request.app["hass"]
        body = await request.json()
        name = str(body.get("name") or "").strip()
        data_b64 = str(body.get("data_base64") or "").strip()
        if not name or not data_b64:
            return self.json({"error":"name and data_base64 required"}, status_code=400)
        raw = base64.b64decode(data_b64)
        outp = _assets_dir(hass) / name
        outp.write_bytes(raw)
        return self.json({"ok": True, "name": name, "size": len(raw)})

import yaml

import hashlib

_RECIPE_MARKER = "#__LVGL_PAGES__"

_RECIPE_STRIP_TOPLEVEL_KEYS = {
    # Common non-hardware sections we strip when importing full device YAML into a recipe.
    # Users can keep these in their main ESPHome file or secrets include, while recipes focus on hardware + LVGL.
    "wifi",
    "captive_portal",
    "api",
    "ota",
    "logger",
    "web_server",
    "improv_serial",
    "dashboard_import",
    "esp32_improv",
    "bluetooth_proxy",
    "packages",
    "substitutions",
}

def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "recipe"

def _extract_recipe_metadata(model: dict, yaml_text: str, label: str | None = None) -> dict:
    """Best-effort metadata extraction for UI display.

    This is intentionally heuristic and must never block import.
    """
    meta: dict = {"label": label or None}

    # Board/platform
    board = None
    platform = None
    for k in ("esp32", "esp32_s3", "esp32_p4"):
        if isinstance(model.get(k), dict):
            platform = k
            board = model[k].get("board") or board
    if isinstance(model.get("esphome"), dict):
        meta["project_name"] = model["esphome"].get("name")
    if board: meta["board"] = board
    if platform: meta["platform"] = platform

    # Resolution heuristics: look for width/height in display (top-level or dimensions block)
    width = height = None
    try:
        displays = model.get("display")
        if isinstance(displays, list) and displays:
            d0 = displays[0]
            if isinstance(d0, dict):
                width = d0.get("width") or width
                height = d0.get("height") or height
                dims = d0.get("dimensions")
                if isinstance(dims, dict) and (width is None or height is None):
                    width = dims.get("width") or width
                    height = dims.get("height") or height
    except Exception:
        pass
    # fallback regex
    if not (isinstance(width, int) and isinstance(height, int)):
        m = re.search(r"\bwidth:\s*(\d+)\b.*?\bheight:\s*(\d+)\b", yaml_text, flags=re.S)
        if m:
            width = int(m.group(1)); height = int(m.group(2))
    if isinstance(width, int) and isinstance(height, int):
        meta["resolution"] = {"width": width, "height": height}

    # Touch platform
    touch = None
    ts = model.get("touchscreen")
    if isinstance(ts, list) and ts:
        t0 = ts[0]
        if isinstance(t0, dict):
            touch = t0.get("platform") or touch
    if touch:
        meta["touch"] = {"platform": touch}

    # Backlight pin heuristics
    backlight = None
    out = model.get("output")
    if isinstance(out, list):
        for o in out:
            if isinstance(o, dict) and "id" in o and "pin" in o and "backlight" in str(o.get("id")):
                backlight = o.get("pin")
                break
    if backlight:
        meta["backlight_pin"] = backlight

    # PSRAM hint
    meta["psram"] = bool(model.get("psram")) or ("psram" in yaml_text.lower())

    return meta

def _normalize_recipe_yaml(raw_text: str, label: str | None = None) -> tuple[str, dict]:
    """Normalize an imported device YAML into a recipe YAML (Option B).

    - Parses YAML
    - Strips common non-hardware top-level keys
    - Ensures lvgl block exists
    - Ensures #__LVGL_PAGES__ marker exists in lvgl block
    - Dumps canonical YAML (sorted keys, consistent indentation)
    - Re-inserts the marker comment under lvgl:
    """
    model = yaml.safe_load(raw_text) or {}
    if not isinstance(model, dict):
        raise ValueError("Top-level YAML must be a mapping/object")

    # Strip non-hardware top-level keys
    for k in list(model.keys()):
        if k in _RECIPE_STRIP_TOPLEVEL_KEYS:
            model.pop(k, None)

    # Ensure lvgl exists
    if "lvgl" not in model:
        model["lvgl"] = {}

    # Dump canonical YAML
    dumped = yaml.safe_dump(
        model,
        sort_keys=True,
        allow_unicode=True,
        default_flow_style=False,
        width=120,
    )

    # Ensure marker in lvgl
    if _RECIPE_MARKER not in dumped:
        # Insert after 'lvgl:' line
        lines = dumped.splitlines()
        out_lines = []
        inserted = False
        for line in lines:
            out_lines.append(line)
            if not inserted and re.match(r"^lvgl:\s*$", line):
                out_lines.append(f"  {_RECIPE_MARKER}")
                inserted = True
        dumped = "\n".join(out_lines) + ("\n" if not dumped.endswith("\n") else "")

    meta = _extract_recipe_metadata(model, dumped, label=label)
    # Derive default label if missing
    if not meta.get("label"):
        # Use board + resolution if present
        parts = []
        if meta.get("board"): parts.append(str(meta["board"]))
        if isinstance(meta.get("resolution"), dict):
            parts.append(f'{meta["resolution"]["width"]}x{meta["resolution"]["height"]}')
        meta["label"] = " • ".join(parts) if parts else "Custom recipe"

    return dumped, meta

def _find_recipe_path_by_id(hass: HomeAssistant, recipe_id: str) -> Path | None:
    for r in list_all_recipes(hass):
        if r.get("id") == recipe_id:
            try:
                return Path(str(r.get("path")))
            except Exception:
                return None
    return None



def _validate_recipe_text(recipe_text: str) -> list[str]:
    """Return a list of issues/warnings for a recipe YAML text.

    This is best-effort and should not be treated as a schema validator; it is a preflight UX helper.
    """
    issues: list[str] = []
    if "lvgl:" not in recipe_text:
        issues.append("Missing top-level `lvgl:` block.")
    if _RECIPE_MARKER not in recipe_text and "pages:" not in recipe_text:
        issues.append("Missing `#__LVGL_PAGES__` marker (recommended) and no obvious `pages:` key was found.")
    # YAML parse check
    try:
        yaml.safe_load(recipe_text)
    except Exception as e:
        issues.append(f"Recipe YAML parse failed: {e}")
    # Friendly hints
    if "display:" not in recipe_text:
        issues.append("No `display:` section detected (is this a full hardware recipe?).")
    if "touchscreen:" not in recipe_text:
        issues.append("No `touchscreen:` section detected (touch may not be configured).")
    return issues


def _extract_recipe_metadata_from_text(recipe_text: str, recipe_id: str | None = None) -> dict:
    """Extract metadata from a stored recipe file.

    We try to parse YAML; if it fails we fall back to lightweight regex hints.
    If resolution still missing, try to extract WxH from recipe_id (e.g. jc1060p470_esp32p4_1024x600).
    """
    meta: dict = {"label": None}
    try:
        model = yaml.safe_load(recipe_text) or {}
        if isinstance(model, dict):
            meta = _extract_recipe_metadata(model, recipe_text, label=None)
    except Exception:
        pass
    if not isinstance(meta.get("resolution"), dict) or not (meta["resolution"].get("width") and meta["resolution"].get("height")):
        m = re.search(r"\bwidth:\s*(\d+)\b.*?\bheight:\s*(\d+)\b", recipe_text, flags=re.S)
        if m:
            meta["resolution"] = {"width": int(m.group(1)), "height": int(m.group(2))}
    if not isinstance(meta.get("resolution"), dict) or not (meta["resolution"].get("width") and meta["resolution"].get("height")):
        if recipe_id:
            rx = re.search(r"(\d{3,4})\s*[x×]\s*(\d{3,4})", recipe_id, re.I) or re.search(r"(\d{3,4})x(\d{3,4})", recipe_id)
            if rx:
                meta["resolution"] = {"width": int(rx.group(1)), "height": int(rx.group(2))}
    if "psram" not in meta:
        meta["psram"] = ("psram" in recipe_text.lower())
    return meta




class RecipeCloneView(HomeAssistantView):
    """Clone a recipe (builtin or user) into a new v2 user recipe.

    This supports the end-user workflow: start from a known-good builtin board
    scaffold, then tweak it safely as a custom recipe.

    Body:
      - source_id: str (required)
      - id: str (optional)  -> destination recipe id (slug). If omitted, derived.
      - label: str (optional)
    """

    url = f"/api/{DOMAIN}/recipes/clone"
    name = f"api:{DOMAIN}:recipes_clone"
    requires_auth = False

    async def post(self, request):
        hass = request.app["hass"]
        body = await request.json()
        source_id = body.get("source_id")
        if not isinstance(source_id, str) or not source_id.strip():
            return self.json({"ok": False, "error": "invalid_source_id"}, status_code=400)

        dest_id = body.get("id")
        label = body.get("label")

        if dest_id is not None and (not isinstance(dest_id, str) or not dest_id.strip()):
            return self.json({"ok": False, "error": "invalid_id"}, status_code=400)
        if label is not None and (not isinstance(label, str) or not label.strip()):
            return self.json({"ok": False, "error": "invalid_label"}, status_code=400)

        all_recipes = list_all_recipes(hass)
        src = next((r for r in all_recipes if r.get("id") == source_id), None)
        if not src:
            return self.json({"ok": False, "error": "recipe_not_found"}, status_code=404)

        try:
            src_text = _read_recipe_file(Path(src.get("path")))
        except Exception as e:
            return self.json({"ok": False, "error": "read_failed", "detail": str(e)}, status_code=500)

        base = re.sub(r"[^a-zA-Z0-9_\-]+", "_", (dest_id or source_id).strip()).strip("_") or "recipe"
        dest_id = base
        root = _user_recipes_root(hass)
        v2_dir = root / "user" / dest_id
        i = 2
        while v2_dir.exists():
            dest_id = f"{base}_{i}"
            v2_dir = root / "user" / dest_id
            i += 1

        v2_dir.mkdir(parents=True, exist_ok=True)
        (v2_dir / "recipe.yaml").write_text(src_text, encoding="utf-8")

        meta = {}
        if src.get("label"):
            meta["label"] = src.get("label")
        if isinstance(label, str) and label.strip():
            meta["label"] = label.strip()
        meta["cloned_from"] = source_id
        (v2_dir / "metadata.json").write_text(json.dumps(meta, indent=2, sort_keys=True), encoding="utf-8")

        return self.json({"ok": True, "id": dest_id, "label": meta.get("label")})


class RecipeExportView(HomeAssistantView):
    """Export a recipe's YAML + metadata for download/backup."""

    url = f"/api/{DOMAIN}/recipes/{{recipe_id}}/export"
    name = f"api:{DOMAIN}:recipes_export"
    requires_auth = False

    async def get(self, request, recipe_id: str):
        hass = request.app["hass"]
        all_recipes = list_all_recipes(hass)
        r = next((x for x in all_recipes if x.get("id") == recipe_id), None)
        if not r:
            return self.json({"ok": False, "error": "recipe_not_found"}, status_code=404)

        try:
            yaml_text = _read_recipe_file(Path(r.get("path")))
        except Exception as e:
            return self.json({"ok": False, "error": "read_failed", "detail": str(e)}, status_code=500)

        meta = {}
        if r.get("builtin"):
            meta = {"label": r.get("label"), "builtin": True}
        else:
            root = _user_recipes_root(hass)
            v2_meta = root / "user" / recipe_id / "metadata.json"
            legacy_meta = root / f"{recipe_id}.metadata.json"
            mp = v2_meta if v2_meta.exists() else legacy_meta
            if mp.exists():
                try:
                    meta = json.loads(mp.read_text("utf-8"))
                except Exception:
                    meta = {}
            if r.get("label") and "label" not in meta:
                meta["label"] = r.get("label")

        return self.json({"ok": True, "id": recipe_id, "label": r.get("label"), "yaml": yaml_text, "metadata": meta})

class RecipeValidateView(HomeAssistantView):
    url = f"/api/{DOMAIN}/recipes/validate"
    name = f"api:{DOMAIN}:recipes_validate"
    requires_auth = False

    async def post(self, request):
        hass: HomeAssistant = request.app["hass"]
        body = await request.json()
        recipe_id = str(body.get("recipe_id") or "").strip()
        if not recipe_id:
            return self.json({"error": "recipe_id required"}, status_code=400)

        recipe_path = _find_recipe_path_by_id(hass, recipe_id)
        if not recipe_path or not recipe_path.exists():
            return self.json({"error": "recipe not found"}, status_code=404)

        recipe_text = recipe_path.read_text("utf-8")
        issues = _validate_recipe_text(recipe_text)
        meta = _extract_recipe_metadata_from_text(recipe_text)
        return self.json({"ok": len(issues) == 0, "issues": issues, "meta": meta})





class RecipeImportView(HomeAssistantView):
    """Import a raw ESPHome device YAML and convert it into a normalized hardware recipe (Option B).

    This creates a v2 user recipe under:
      /config/esphome_touch_designer/recipes/user/<slug>/{recipe.yaml,metadata.json}
    """

    url = "/api/esphome_touch_designer/recipes/import"
    name = "api:esphome_touch_designer:recipes_import"
    requires_auth = False

    async def post(self, request):
        hass: HomeAssistant = request.app["hass"]
        body = await request.json()
        raw_yaml = str(body.get("yaml") or "")
        label = str(body.get("label") or "").strip() or None
        recipe_id = str(body.get("id") or "").strip() or None

        if not raw_yaml.strip():
            return self.json({"ok": False, "error": "yaml_required"}, status_code=400)

        try:
            norm_yaml, meta = _normalize_recipe_yaml(raw_yaml, label=label)
        except Exception as e:
            return self.json({"ok": False, "error": "import_failed", "detail": str(e)}, status_code=400)

        rid = _slugify(recipe_id or meta.get("label") or "recipe")
        # Avoid collisions by suffixing hash
        root = _user_recipes_root(hass) / "user"
        root.mkdir(parents=True, exist_ok=True)
        target_dir = root / rid
        if target_dir.exists():
            h = hashlib.sha1(norm_yaml.encode("utf-8")).hexdigest()[:6]
            target_dir = root / f"{rid}_{h}"

        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "recipe.yaml").write_text(norm_yaml, encoding="utf-8")
        (target_dir / "metadata.json").write_text(json.dumps(meta, indent=2, sort_keys=True), encoding="utf-8")

        return self.json({
            "ok": True,
            "id": target_dir.name,
            "label": meta.get("label"),
            "path": str(target_dir / "recipe.yaml"),
            "meta": meta,
        })


class DeviceProjectExportView(HomeAssistantView):
    """Export the current device project model as JSON (for backups / cross-chat portability)."""

    url = "/api/esphome_touch_designer/devices/{device_id}/project/export"
    name = "api:esphome_touch_designer:device_project_export"
    requires_auth = False

    async def get(self, request, device_id: str):
        hass: HomeAssistant = request.app["hass"]
        entry_id = _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)
        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)

        payload = {
            "device_id": device.device_id,
            "slug": device.slug,
            "name": device.name,
            "hardware_recipe_id": device.hardware_recipe_id,
            "api_key": device.api_key,
            "project": device.project,
        }
        return self.json({"ok": True, "export": payload})


class DeviceProjectImportView(HomeAssistantView):
    """Import/replace a device project model from JSON."""

    url = "/api/esphome_touch_designer/devices/{device_id}/project/import"
    name = "api:esphome_touch_designer:device_project_import"
    requires_auth = False

    async def post(self, request, device_id: str):
        hass: HomeAssistant = request.app["hass"]
        entry_id = _active_entry_id(hass)
        if not entry_id:
            return self.json({"ok": False, "error": "no_active_entry"}, status_code=500)
        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)

        body = await request.json()
        export = body.get("export") if isinstance(body, dict) else None
        if not isinstance(export, dict):
            return self.json({"ok": False, "error": "export_required"}, status_code=400)

        project = export.get("project")
        if not isinstance(project, dict):
            return self.json({"ok": False, "error": "project_required"}, status_code=400)

        # Minimal validation + migration hook
        if "model_version" not in project:
            project["model_version"] = 1

        device.project = project
        if isinstance(export.get("hardware_recipe_id"), str):
            device.hardware_recipe_id = export.get("hardware_recipe_id") or None
        if export.get("api_key") is not None:
            device.api_key = str(export["api_key"]).strip() or None

        storage.upsert_device(device)
        await storage.async_save()
        return self.json({"ok": True})



class DeviceExportPreviewView(HomeAssistantView):
    """Preview an export (safe-merge) and return a diff + expected hash."""

    url = f"/api/{DOMAIN}/devices/{{device_id}}/export/preview"
    name = f"api:{DOMAIN}:device_export_preview"
    requires_auth = False

    async def post(self, request, device_id: str):
        hass = request.app["hass"]
        entry_id = request.query.get("entry_id")
        if not entry_id:
            return self.json({"ok": False, "error": "missing_entry_id"}, status_code=400)

        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)

        yaml_text = compile_to_esphome_yaml(device)

        BEGIN = "# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---"
        END = "# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---"

        esphome_dir = Path(hass.config.path("esphome"))
        esphome_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{device.slug or device.device_id}.yaml"
        outp = esphome_dir / fname

        generated_block = f"{BEGIN}\n{yaml_text.rstrip()}\n{END}\n"
        existing = outp.read_text("utf-8", errors="ignore") if outp.exists() else ""

        if BEGIN in existing and END in existing:
            begin_idx = existing.find(BEGIN)
            end_idx = existing.find(END)
            if end_idx < begin_idx:
                return self.json({"ok": False, "error": "marker_corrupt", "detail": "END appears before BEGIN", "path": str(outp)}, status_code=409)
            pre = existing[:begin_idx]
            post = existing[end_idx + len(END):]
            new_text = pre.rstrip() + "\n\n" + generated_block + "\n" + post.lstrip()
            mode = "merged"
        else:
            new_text = generated_block + "\n" + "# --- USER YAML BELOW (preserved on future exports if you keep the marker block above) ---\n" + "# Add sensors, switches, substitutions, packages, etc.\n"
            mode = "new"

        import hashlib, difflib
        existing_hash = hashlib.sha256(existing.encode("utf-8")).hexdigest()
        new_hash = hashlib.sha256(new_text.encode("utf-8")).hexdigest()
        diff = "\n".join(difflib.unified_diff(
            existing.splitlines(),
            new_text.splitlines(),
            fromfile=str(outp),
            tofile=str(outp),
            lineterm="",
        ))

        return self.json({
            "ok": True,
            "path": str(outp),
            "mode": mode,
            "expected_hash": existing_hash,
            "new_hash": new_hash,
            "diff": diff,
            "new_text": new_text,
            "exists": outp.exists(),
        })


class DeviceExportView(HomeAssistantView):
    """Write the safe-merged YAML to /config/esphome/<slug>.yaml."""

    url = f"/api/{DOMAIN}/devices/{{device_id}}/export"
    name = f"api:{DOMAIN}:device_export"
    requires_auth = False

    async def post(self, request, device_id: str):
        hass = request.app["hass"]
        entry_id = request.query.get("entry_id")
        if not entry_id:
            return self.json({"ok": False, "error": "missing_entry_id"}, status_code=400)

        storage = _get_storage(hass, entry_id)
        device = storage.get_device(device_id)
        if not device:
            return self.json({"ok": False, "error": "device_not_found"}, status_code=404)

        body = None
        try:
            body = await request.json()
        except Exception:
            body = None
        expected_hash = body.get("expected_hash") if isinstance(body, dict) else None

        yaml_text = compile_to_esphome_yaml(device)

        BEGIN = "# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---"
        END = "# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---"

        esphome_dir = Path(hass.config.path("esphome"))
        esphome_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{device.slug or device.device_id}.yaml"
        outp = esphome_dir / fname

        generated_block = f"{BEGIN}\n{yaml_text.rstrip()}\n{END}\n"
        existing = outp.read_text("utf-8", errors="ignore") if outp.exists() else ""

        import hashlib
        existing_hash = hashlib.sha256(existing.encode("utf-8")).hexdigest()
        if expected_hash and str(expected_hash) != existing_hash:
            return self.json({"ok": False, "error": "externally_modified", "detail": "File changed since preview.", "path": str(outp)}, status_code=409)

        if BEGIN in existing and END in existing:
            begin_idx = existing.find(BEGIN)
            end_idx = existing.find(END)
            if end_idx < begin_idx:
                return self.json({"ok": False, "error": "marker_corrupt", "detail": "END appears before BEGIN", "path": str(outp)}, status_code=409)
            pre = existing[:begin_idx]
            post = existing[end_idx + len(END):]
            new_text = pre.rstrip() + "\n\n" + generated_block + "\n" + post.lstrip()
            mode = "merged"
        else:
            new_text = generated_block + "\n" + "# --- USER YAML BELOW (preserved on future exports if you keep the marker block above) ---\n" + "# Add sensors, switches, substitutions, packages, etc.\n"
            mode = "new"

        outp.write_text(new_text, encoding="utf-8")
        new_hash = hashlib.sha256(new_text.encode("utf-8")).hexdigest()

        return self.json({"ok": True, "path": str(outp), "mode": mode, "hash": new_hash})


class EntityCapabilitiesView(HomeAssistantView):

    url = "/api/esphome_touch_designer/ha/entities/{entity_id}/capabilities"
    name = "api:esphome_touch_designer:ha_entity_capabilities"
    requires_auth = False

    async def get(self, request, entity_id: str):
        hass: HomeAssistant = request.app["hass"]
        st = hass.states.get(entity_id)
        if not st:
            return self.json({"error":"entity not found"}, status_code=404)
        domain = entity_id.split(".",1)[0]
        # Expose supported_features and common attributes for template selection.
        attrs = dict(st.attributes)
        sf = attrs.get("supported_features")
        # Service availability (best-effort)
        svc = hass.services.async_services().get(domain, {})
        services = sorted(list(svc.keys())) if isinstance(svc, dict) else []
        return self.json({
            "entity_id": entity_id,
            "domain": domain,
            "state": st.state,
            "supported_features": sf,
            "attributes": attrs,
            "services": services,
        })

def _plugins_dir(hass: HomeAssistant) -> Path:
    p = Path(hass.config.path("esphome_touch_designer_plugins"))
    (p / "controls").mkdir(parents=True, exist_ok=True)
    (p / "widgets").mkdir(parents=True, exist_ok=True)
    return p

class PluginsListView(HomeAssistantView):
    url = "/api/esphome_touch_designer/plugins"
    name = "api:esphome_touch_designer:plugins"
    requires_auth = False

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        p = _plugins_dir(hass)
        controls=[]
        for f in sorted((p/"controls").glob("*.json")):
            try:
                controls.append(json.loads(f.read_text("utf-8")))
            except Exception as e:
                controls.append({"id": f.stem, "title": f.stem, "error": str(e)})
        widgets=[]
        for f in sorted((p/"widgets").glob("*.json")):
            try:
                widgets.append({"name": f.name, "schema": json.loads(f.read_text("utf-8"))})
            except Exception as e:
                widgets.append({"name": f.name, "error": str(e)})
        return self.json({"controls": controls, "widgets": widgets, "dir": str(p)})
