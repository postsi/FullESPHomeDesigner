from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, SERVICE_SET_LIGHT_RGB

_LOGGER = logging.getLogger(__name__)

SET_LIGHT_RGB_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("red"): vol.All(vol.Coerce(int), vol.Range(0, 255)),
        vol.Required("green"): vol.All(vol.Coerce(int), vol.Range(0, 255)),
        vol.Required("blue"): vol.All(vol.Coerce(int), vol.Range(0, 255)),
    }
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up (optional). Register services so they exist before config entries."""

    async def async_set_light_rgb(call: ServiceCall) -> None:
        """Set a light's colour from scalar red/green/blue (for ESPHome colour picker Apply)."""
        entity_id = call.data["entity_id"]
        rgb = [call.data["red"], call.data["green"], call.data["blue"]]
        await hass.services.async_call(
            "light",
            "turn_on",
            {"entity_id": entity_id, "rgb_color": rgb},
            blocking=True,
        )

    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_LIGHT_RGB,
        async_set_light_rgb,
        schema=SET_LIGHT_RGB_SCHEMA,
    )
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
