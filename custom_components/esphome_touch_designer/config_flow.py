"""Config flow for ESPHome Touch Designer."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_NAME
from homeassistant.core import callback

from .const import DOMAIN


class ESPHomeTouchDesignerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for ESPHome Touch Designer."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        # Single instance - one integration per HA
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            name = user_input.get(CONF_NAME) or "ESPHome Touch Designer"
            return self.async_create_entry(title=name, data={})

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Optional(CONF_NAME, default="ESPHome Touch Designer"): str,
            }),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        """Return options flow handler."""
        return ESPHomeTouchDesignerOptionsFlow(config_entry)


class ESPHomeTouchDesignerOptionsFlow(config_entries.OptionsFlow):
    """Options flow for ESPHome Touch Designer."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        super().__init__()
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(step_id="init", data_schema=vol.Schema({}))
