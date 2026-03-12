#!/usr/bin/env python3
"""
Smoke-check the integration's entity API when Home Assistant is running.

GETs /api/esphome_touch_designer/entities and optionally
/api/esphome_touch_designer/ha/entities/<id>/capabilities for one entity,
and asserts basic structure so we know the application is functioning correctly.

Requires: HA_BASE_URL and (if HA requires auth) HA_TOKEN.

Example:
  export HA_BASE_URL="http://grimwoodha.local:8123"
  export HA_TOKEN="your_long_lived_access_token"
  python3 scripts/verify_ha_entities_api.py
"""
from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def get(base: str, path: str, token: str) -> dict | list:
    url = f"{base.rstrip('/')}{path}"
    req = Request(url)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    base = (os.environ.get("HA_BASE_URL") or "").strip()
    token = (os.environ.get("HA_TOKEN") or "").strip()
    if not base:
        print("Set HA_BASE_URL (e.g. http://homeassistant.local:8123)", file=sys.stderr)
        return 1
    errors = []
    try:
        entities = get(base, "/api/esphome_touch_designer/entities", token)
    except (HTTPError, URLError, json.JSONDecodeError) as e:
        print(f"Entities API failed: {e}", file=sys.stderr)
        return 1
    if not isinstance(entities, list):
        errors.append("GET /api/.../entities did not return a list")
    else:
        for i, item in enumerate(entities[:20]):
            if not isinstance(item, dict):
                errors.append(f"entities[{i}] is not a dict")
                continue
            eid = item.get("entity_id")
            if not eid or "." not in str(eid):
                errors.append(f"entities[{i}] invalid entity_id: {eid!r}")
            if "state" not in item:
                errors.append(f"entities[{i}] missing 'state'")
            if "attributes" not in item:
                errors.append(f"entities[{i}] missing 'attributes'")
        if not entities:
            errors.append("Entities list is empty (is the integration loaded?)")
        print(f"Entities API OK: {len(entities)} entities, structure check passed on first 20")
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        return 1
    # Optionally hit capabilities for one entity
    if entities and isinstance(entities, list):
        first_eid = entities[0].get("entity_id")
        if first_eid:
            try:
                cap = get(
                    base,
                    f"/api/esphome_touch_designer/ha/entities/{quote(first_eid, safe='')}/capabilities",
                    token,
                )
                if isinstance(cap, dict) and "entity_id" in cap and "domain" in cap:
                    print(f"Entity capabilities API OK for {first_eid}")
                else:
                    print("Capabilities response missing entity_id/domain", file=sys.stderr)
            except (HTTPError, URLError, json.JSONDecodeError) as e:
                print(f"Capabilities API (non-fatal): {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
