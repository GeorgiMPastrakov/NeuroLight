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
export HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}"

echo "Evaluating fixed-time controller..."
"$PYTHON" -m train.eval_fixed "$@"

echo
echo "Evaluating trained policy..."
"$PYTHON" -m train.eval_trained "$@"
