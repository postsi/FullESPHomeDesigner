"""Config flow for ESPHome Touch Designer."""

from __future__ import annotations

from homeassistant import config_entries

from .const import DOMAIN


class ESPHomeTouchDesignerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for ESPHome Touch Designer."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        return self.async_create_entry(title="ESPHome Touch Designer", data={})
