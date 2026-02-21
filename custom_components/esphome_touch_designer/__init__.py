from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow
from homeassistant.core import HomeAssistant

from .const import (
    CONF_DEFAULT_LOG_LEVEL,
    CONF_WIFI_PASSWORD_SECRET,
    CONF_WIFI_SSID,
    DOMAIN,
)
from .panel import async_register_panel
from .storage import DashboardStorage

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional(CONF_WIFI_SSID, default="!secret wifi_ssid"): str,
                vol.Optional(CONF_WIFI_PASSWORD_SECRET, default="!secret wifi_password"): str,
                vol.Optional(CONF_DEFAULT_LOG_LEVEL, default="INFO"): vol.In(
                    ["DEBUG", "INFO", "WARNING", "ERROR"]
                ),
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up via YAML (allows adding when not in brands repo)."""
    if DOMAIN not in config:
        return True
    existing = hass.config_entries.async_entries(DOMAIN)
    if existing:
        return True
    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": ConfigFlow.SOURCE_IMPORT},
            data=dict(config[DOMAIN]),
        )
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from UI."""
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
    if DOMAIN in hass.data and entry.entry_id in hass.data[DOMAIN]:
        hass.data[DOMAIN].pop(entry.entry_id)
    if hass.data.get(DOMAIN, {}).get("active_entry_id") == entry.entry_id:
        hass.data[DOMAIN].pop("active_entry_id", None)
    return True
