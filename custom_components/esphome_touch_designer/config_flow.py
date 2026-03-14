"""Config flow for ESPHome Touch Designer."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, OPTION_ESPHOME_ADDON_URL


class ESPHomeTouchDesignerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for ESPHome Touch Designer."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        return self.async_create_entry(title="ESPHome Touch Designer", data={})

    @staticmethod
    async def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> config_entries.OptionsFlow:
        """Return an options flow handler."""
        return ESPHomeTouchDesignerOptionsFlow()


class ESPHomeTouchDesignerOptionsFlow(config_entries.OptionsFlow):
    """Options flow for ESPHome add-on API URL."""

    async def async_step_init(self, user_input=None):
        """Single step: optional ESPHome add-on API base URL."""
        if user_input is not None:
            url = (user_input.get(OPTION_ESPHOME_ADDON_URL) or "").strip()
            options = {OPTION_ESPHOME_ADDON_URL: url}
            return self.async_create_entry(title="", data=options)

        current = ""
        if self.config_entry and self.config_entry.options:
            current = self.config_entry.options.get(OPTION_ESPHOME_ADDON_URL) or ""
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(OPTION_ESPHOME_ADDON_URL, default=current): str,
            }),
        )
