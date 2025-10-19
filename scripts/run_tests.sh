#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${VENV:-"$ROOT/.venv"}"
PYTHON="${PYTHON:-"$VENV/bin/python"}"

if [[ ! -x "$PYTHON" ]]; then
  echo "Python virtualenv not found at $PYTHON" >&2
  echo "Run scripts/setup.sh first." >&2
  exit 1
fi

export PYTHONPATH="$ROOT"

if "$PYTHON" - <<'PYCODE'
import importlib.util
import sys
sys.exit(0 if importlib.util.find_spec("pytest") else 1)
PYCODE
then
  echo "Running pytest..."
  exec "$PYTHON" -m pytest "$@"
else
  echo "pytest not found; falling back to unittest discover."
  exec "$PYTHON" -m unittest discover -s tests -p "test_*.py" "$@"
fi
