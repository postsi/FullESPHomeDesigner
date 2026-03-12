"""
Optional integration tests using a snapshot of real HA entities.

When tests/fixtures/ha_entities_snapshot.json exists (see TESTING.md for how to generate it),
these tests verify that the compiler and helpers handle real-world entity_ids and shapes
from your Home Assistant instance. They run without a live HA server.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from custom_components.esphome_touch_designer.storage import _default_project
from custom_components.esphome_touch_designer.api.views import (
    _safe_id,
    _slugify_entity_id,
    compile_to_esphome_yaml,
)

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "ha_entities_snapshot.json"


def _load_entities_fixture():
    """Load optional HA entities snapshot. Returns None if file missing."""
    if not FIXTURE_PATH.exists():
        return None
    data = json.loads(FIXTURE_PATH.read_text("utf-8"))
    if not isinstance(data, list):
        return None
    return data


@pytest.fixture(scope="module")
def ha_entities_snapshot():
    """Load HA entities fixture if present; skip tests in this module otherwise."""
    out = _load_entities_fixture()
    if out is None:
        pytest.skip(
            f"Optional fixture not found: {FIXTURE_PATH}. "
            "See docs/TESTING.md 'Optional: HA entity fixture' to generate it."
        )
    return out


def test_entity_snapshot_structure(ha_entities_snapshot):
    """Each item must have entity_id, state, attributes (integration API shape)."""
    for i, item in enumerate(ha_entities_snapshot):
        assert isinstance(item, dict), f"item[{i}] is not a dict"
        eid = item.get("entity_id")
        assert eid is not None, f"item[{i}] missing entity_id"
        assert isinstance(eid, str) and "." in eid, f"item[{i}] entity_id must be 'domain.name': {eid!r}"
        assert "state" in item, f"item[{i}] missing state"
        assert isinstance(item.get("attributes", {}), dict), f"item[{i}] attributes must be dict"


def test_slugify_and_safe_id_on_real_entity_ids(ha_entities_snapshot):
    """Compiler helpers must not crash on any real entity_id from the snapshot."""
    for item in ha_entities_snapshot:
        eid = item.get("entity_id")
        if not eid or "." not in eid:
            continue
        slug = _slugify_entity_id(eid)
        assert isinstance(slug, str) and len(slug) > 0, f"slugify failed for {eid!r}"
        safe = _safe_id(eid)
        assert isinstance(safe, str), f"_safe_id failed for {eid!r}"


def test_compile_with_real_entity_bindings(ha_entities_snapshot, jc1060_recipe_text, make_device):
    """Minimal project with bindings to real entity_ids from snapshot must compile."""
    # Pick up to one entity per domain for a small binding set
    seen_domains = set()
    bind_entity_ids = []
    for item in ha_entities_snapshot:
        eid = item.get("entity_id")
        if not eid or "." not in eid:
            continue
        domain = eid.split(".", 1)[0]
        if domain not in seen_domains and len(bind_entity_ids) < 5:
            seen_domains.add(domain)
            bind_entity_ids.append(eid)
    if not bind_entity_ids:
        pytest.skip("Snapshot has no valid entity_ids")

    proj = _default_project()
    proj["pages"] = [{"page_id": "main", "name": "Main", "widgets": []}]
    proj.setdefault("device", {})["hardware_recipe_id"] = "jc1060p470_esp32p4_1024x600"
    # One label per entity; bind state to label_text
    widgets = []
    bindings = []
    links = []
    for i, eid in enumerate(bind_entity_ids):
        wid = f"l{i}"
        widgets.append({"id": wid, "type": "label", "x": 0, "y": i * 30, "w": 200, "h": 28, "props": {"text": eid}, "style": {}, "custom_events": {}})
        bindings.append({"entity_id": eid, "kind": "state", "attribute": ""})
        links.append({
            "source": {"entity_id": eid, "kind": "state", "attribute": ""},
            "target": {"widget_id": wid, "action": "label_text"},
        })
    proj["pages"][0]["widgets"] = widgets
    proj["bindings"] = bindings
    proj["links"] = links

    dev = make_device(project=proj, recipe_id="jc1060p470_esp32p4_1024x600", slug="fixture_test")
    out = compile_to_esphome_yaml(dev, recipe_text=jc1060_recipe_text)
    assert "platform: homeassistant" in out
    for eid in bind_entity_ids:
        assert eid in out
