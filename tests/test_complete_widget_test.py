"""
CompleteWidgetTest: compile the comprehensive fixture and run esphome config in the sandbox.
The fixture includes every widget type, display/action bindings, scripts/lambdas, Create Component,
and user sections. This test must pass before release to catch compiler regressions.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from custom_components.esphome_touch_designer.storage import DeviceProject, _default_project
from custom_components.esphome_touch_designer.api.views import compile_to_esphome_yaml

from tests.fixtures.complete_widget_test_project import get_complete_widget_test_project
from tests.test_compile import validate, run_esphome_config

REPO_ROOT = Path(__file__).resolve().parent.parent


def test_complete_widget_test_compiles_and_passes_esphome_config(jc1060_recipe_text):
    """CompleteWidgetTest fixture compiles to valid YAML and passes esphome config in the sandbox."""
    project = get_complete_widget_test_project()
    device = DeviceProject(
        device_id="complete_widget_test",
        slug="completewidgettest",
        name="CompleteWidgetTest",
        hardware_recipe_id="jc1060p470_esp32p4_1024x600",
        api_key=None,
        project=project,
    )
    yaml_text = compile_to_esphome_yaml(device, recipe_text=jc1060_recipe_text)
    errors = validate(yaml_text, device.slug)
    assert not errors, f"CompleteWidgetTest validate errors: {errors}"
    if shutil.which("esphome"):
        config_errors = run_esphome_config(yaml_text, "CompleteWidgetTest")
        if config_errors:
            # Run again to capture full stderr for the assertion message
            with tempfile.TemporaryDirectory(prefix="etd_cwt_") as tmp:
                config_path = Path(tmp) / "config.yaml"
                config_path.write_text(yaml_text, encoding="utf-8")
                (Path(tmp) / "secrets.yaml").write_text("wifi_ssid: test\nwifi_password: testpass\n", encoding="utf-8")
                env = os.environ.copy()
                env["ESPHOME_CONFIG_DIR"] = tmp
                r = subprocess.run(
                    [shutil.which("esphome"), "config", str(config_path)],
                    capture_output=True,
                    text=True,
                    timeout=60,
                    cwd=tmp,
                    env=env,
                )
                full_err = (r.stderr or "").strip() + "\n" + (r.stdout or "").strip()
            assert not config_errors, f"CompleteWidgetTest esphome config failed:\n{full_err[:3000]}"
