from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up (optional)."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from UI."""
    from .storage import DashboardStorage
    from .panel import async_register_panel

    storage = DashboardStorage(hass, entry.entry_id)
    await storage.async_load()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "storage": storage,
        "entry": entry,
    }

    # Simple: assume one active config entry.
    hass.data[DOMAIN]["active_entry_id"] = entry.entry_id

    await async_register_panel(hass, entry)
    _LOGGER.debug("%s set up for entry_id=%s", DOMAIN, entry.entry_id)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    from .panel import _unregister_panel

    _unregister_panel(hass)
    if DOMAIN in hass.data and entry.entry_id in hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(entry.entry_id)
    if hass.data.get(DOMAIN, {}).get("active_entry_id") == entry.entry_id:
        hass.data[DOMAIN].pop("active_entry_id", None)
    return True
