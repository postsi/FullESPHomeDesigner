#!/usr/bin/env bash
# Run all test suites (Python pytest + frontend). Exit non-zero if any fail.
# Usage: from repo root, ./scripts/run_all_tests.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Running Python tests (pytest)..."
python3 -m pytest tests/ -v --tb=short || exit 1

echo "Running frontend tests..."
(cd frontend && npm run test) || exit 1

echo "All tests passed."
