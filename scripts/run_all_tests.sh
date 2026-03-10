#!/usr/bin/env bash
# Run all test suites (Python + frontend). Exit non-zero if any fail.
# Usage: from repo root, ./scripts/run_all_tests.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Running Python tests..."
python3 scripts/test_compile.py || exit 1
python3 scripts/test_spinbox_compile.py || exit 1
python3 scripts/test_action_yaml.py || exit 1
python3 scripts/test_components_sections.py || exit 1
python3 scripts/test_components_panel_and_merge.py || exit 1
python3 scripts/test_compile_split_fail.py || exit 1
python3 scripts/test_widget_binding_verification.py || exit 1

echo "Running frontend tests..."
(cd frontend && npm run test) || exit 1

echo "All tests passed."
