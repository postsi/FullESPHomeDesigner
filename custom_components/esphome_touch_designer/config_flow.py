from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries

from .const import DOMAIN, CONF_WIFI_SSID, CONF_WIFI_PASSWORD_SECRET, CONF_DEFAULT_LOG_LEVEL


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="ESPHome Touch Designer", data=user_input)

        schema = vol.Schema({
            vol.Optional(CONF_WIFI_SSID, default="!secret wifi_ssid"): str,
            vol.Optional(CONF_WIFI_PASSWORD_SECRET, default="!secret wifi_password"): str,
            vol.Optional(CONF_DEFAULT_LOG_LEVEL, default="INFO"): vol.In(["DEBUG","INFO","WARNING","ERROR"]),
        })
        return self.async_show_form(step_id="user", data_schema=schema)
