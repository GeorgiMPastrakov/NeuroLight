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

ENV_TYPE="${ENV_TYPE:-ped}"
DEVICE="${DEVICE:-auto}"
NUM_ENVS="${NUM_ENVS:-8}"
TOTAL_TIMESTEPS="${TOTAL_TIMESTEPS:-500000}"
TB_LOG_DIR="${TB_LOG_DIR:-logs/tb}"
EVAL_FREQ="${EVAL_FREQ:-50000}"
EVAL_EPISODES="${EVAL_EPISODES:-5}"
SAVE_BEST="${SAVE_BEST:-1}"
PROGRESS="${PROGRESS:-1}"
SUBPROC="${SUBPROC:-1}"
CONFIG="${CONFIG:-train/config.yaml}"
MODELS_DIR="${MODELS_DIR:-train/models}"
export HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}"

ARGS=(
  --env "$ENV_TYPE"
  --config "$CONFIG"
  --models_dir "$MODELS_DIR"
  --device "$DEVICE"
  --num_envs "$NUM_ENVS"
  --total_timesteps "$TOTAL_TIMESTEPS"
  --eval_freq "$EVAL_FREQ"
  --eval_episodes "$EVAL_EPISODES"
)

if [[ -n "$TB_LOG_DIR" ]]; then
  ARGS+=(--tb_log_dir "$TB_LOG_DIR")
fi
if [[ "$SUBPROC" != "0" && "$NUM_ENVS" -gt 1 ]]; then
  ARGS+=(--subproc)
fi
if [[ "$SAVE_BEST" != "0" ]]; then
  ARGS+=(--save_best)
fi
if [[ "$PROGRESS" != "0" ]]; then
  ARGS+=(--progress_bar)
fi

ARGS+=("$@")

export PYTHONPATH="$ROOT"

exec "$PYTHON" -m train.train_ppo "${ARGS[@]}"
