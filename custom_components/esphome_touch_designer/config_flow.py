from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN, CONF_WIFI_SSID, CONF_WIFI_PASSWORD_SECRET, CONF_DEFAULT_LOG_LEVEL


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_import(self, user_input=None):
        """Import config from configuration.yaml."""
        if user_input is not None:
            return self.async_create_entry(title="ESPHome Touch Designer", data=user_input)
        return self.async_abort(reason="invalid_config")

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="ESPHome Touch Designer", data=user_input)

        schema = vol.Schema({
            vol.Optional(CONF_WIFI_SSID, default="!secret wifi_ssid"): str,
            vol.Optional(CONF_WIFI_PASSWORD_SECRET, default="!secret wifi_password"): str,
            vol.Optional(CONF_DEFAULT_LOG_LEVEL, default="INFO"): vol.In(["DEBUG","INFO","WARNING","ERROR"]),
        })
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return OptionsFlowHandler(config_entry)


class OptionsFlowHandler(config_entries.OptionsFlow):
    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        opts = self.config_entry.options
        data = self.config_entry.data
        schema = vol.Schema({
            vol.Optional(CONF_WIFI_SSID, default=opts.get(CONF_WIFI_SSID, data.get(CONF_WIFI_SSID, "!secret wifi_ssid"))): str,
            vol.Optional(CONF_WIFI_PASSWORD_SECRET, default=opts.get(CONF_WIFI_PASSWORD_SECRET, data.get(CONF_WIFI_PASSWORD_SECRET, "!secret wifi_password"))): str,
            vol.Optional(CONF_DEFAULT_LOG_LEVEL, default=opts.get(CONF_DEFAULT_LOG_LEVEL, data.get(CONF_DEFAULT_LOG_LEVEL, "INFO"))): vol.In(["DEBUG","INFO","WARNING","ERROR"]),
        })
        return self.async_show_form(step_id="init", data_schema=schema)
