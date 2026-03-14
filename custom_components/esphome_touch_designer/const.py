DOMAIN = "esphome_touch_designer"
PLATFORMS: list[str] = []

# Service called by ESPHome devices to set a light's RGB (avoids passing a list in homeassistant.action)
SERVICE_SET_LIGHT_RGB = "set_light_rgb"
# Service called by ESPHome devices to set a light's white temperature (mireds)
SERVICE_SET_LIGHT_COLOR_TEMP = "set_light_color_temp"

CONF_WIFI_SSID = "wifi_ssid"                    # suggest "!secret wifi_ssid"
CONF_WIFI_PASSWORD_SECRET = "wifi_password"     # suggest "!secret wifi_password"
CONF_DEFAULT_LOG_LEVEL = "default_log_level"

STORAGE_VERSION = 1

PANEL_URL_PATH = "esphome-touch-designer"
PANEL_TITLE = "ESPHome Touch Designer"

# ESPHome API add-on (validate / build+upload). Default URL; overridable via integration options.
ESPHOME_ADDON_API_URL = "http://localhost:8098"
# Option keys for Configure (Settings → Integrations → ESPHome Touch Designer → Configure)
CONF_ESPHOME_ADDON_URL = "esphome_addon_url"
CONF_ESPHOME_ADDON_TOKEN = "esphome_addon_token"

STATIC_URL_PATH = f"/api/{DOMAIN}/static"       # served from custom_components/.../web/dist
