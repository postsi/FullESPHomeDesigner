#!/usr/bin/env python3
"""
Fetch entities from the ESPHome Touch Designer integration API and save to
tests/fixtures/ha_entities_snapshot.json so optional tests in
tests/test_entity_data_integration.py can run.

Requires:
  - Home Assistant running with the esphome_touch_designer integration loaded.
  - HA_BASE_URL and HA_TOKEN environment variables.

Example:
  export HA_BASE_URL="http://grimwoodha.local:8123"
  export HA_TOKEN="your_long_lived_access_token"
  python3 scripts/fetch_ha_entities_fixture.py

The integration exposes GET /api/esphome_touch_designer/entities (no auth if
using HA's built-in auth for the panel). If your HA requires auth, use a
long-lived access token in the Authorization header.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "ha_entities_snapshot.json"


def main() -> int:
    base = (os.environ.get("HA_BASE_URL") or "").strip().rstrip("/")
    token = (os.environ.get("HA_TOKEN") or "").strip()
    if not base:
        print("Set HA_BASE_URL (e.g. http://homeassistant.local:8123)", file=sys.stderr)
        return 1
    url = f"{base}/api/esphome_touch_designer/entities"
    req = Request(url)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError) as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Invalid JSON: {e}", file=sys.stderr)
        return 1
    if not isinstance(data, list):
        print("Expected a JSON array of entities", file=sys.stderr)
        return 1
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Saved {len(data)} entities to {FIXTURE_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
