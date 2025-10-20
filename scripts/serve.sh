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

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
SB3_DEVICE="${SB3_DEVICE:-auto}"
DEBUG="${DEBUG:-0}"

export PYTHONPATH="$ROOT"
export SB3_DEVICE
export HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}"

echo "Starting API server on http://$HOST:$PORT (SB3_DEVICE=$SB3_DEVICE, DEBUG=$DEBUG)"

if [[ "$DEBUG" != "0" ]]; then
  exec "$PYTHON" -m api.server --host "$HOST" --port "$PORT" --debug "$@"
else
  exec "$PYTHON" -m api.server --host "$HOST" --port "$PORT" "$@"
fi
