DOMAIN = "esphome_touch_designer"
PLATFORMS: list[str] = []

CONF_WIFI_SSID = "wifi_ssid"                    # suggest "!secret wifi_ssid"
CONF_WIFI_PASSWORD_SECRET = "wifi_password"     # suggest "!secret wifi_password"
CONF_DEFAULT_LOG_LEVEL = "default_log_level"

STORAGE_VERSION = 1

PANEL_URL_PATH = "esphome-touch-designer"
PANEL_TITLE = "ESPHome Touch Designer"

STATIC_URL_PATH = f"/api/{DOMAIN}/static"       # served from custom_components/.../web/dist
