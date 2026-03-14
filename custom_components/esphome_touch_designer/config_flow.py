"""Config flow for ESPHome Touch Designer."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_ESPHOME_ADDON_TOKEN,
    CONF_ESPHOME_ADDON_URL,
    DOMAIN,
    ESPHOME_ADDON_API_URL,
)


class ESPHomeTouchDesignerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for ESPHome Touch Designer."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        return self.async_create_entry(title="ESPHome Touch Designer", data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> ESPHomeTouchDesignerOptionsFlow:
        return ESPHomeTouchDesignerOptionsFlow(config_entry)


@callback
def _options_schema(entry: config_entries.ConfigEntry) -> vol.Schema:
    opts = entry.options or {}
    return vol.Schema(
        {
            vol.Optional(
                CONF_ESPHOME_ADDON_URL,
                default=opts.get(CONF_ESPHOME_ADDON_URL) or ESPHOME_ADDON_API_URL,
            ): str,
            vol.Optional(
                CONF_ESPHOME_ADDON_TOKEN,
                default=opts.get(CONF_ESPHOME_ADDON_TOKEN) or "",
            ): str,
        }
    )


class ESPHomeTouchDesignerOptionsFlow(config_entries.OptionsFlow):
    """Options flow for ESPHome Touch Designer (Configure)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage options: ESPHome add-on URL and API token."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=_options_schema(self.config_entry),
            description="Validate YAML and Deploy call the ESPHome API add-on. Set its base URL (e.g. http://localhost:8098 or http://homeassistant:8098) and the API token from the add-on Setup page.",
        )
