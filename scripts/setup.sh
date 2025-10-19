#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${VENV:-"$ROOT/.venv"}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TORCH_CHANNEL="default"
RECREATE=0

usage() {
  cat <<'EOF'
Usage: scripts/setup.sh [options]

Bootstrap a virtual environment and install project dependencies.

Options:
  --recreate           Remove the existing virtualenv before creating a new one.
  --torch <channel>    Install a specific PyTorch build. Supported values:
                       - default  (CPU build from PyPI, default)
                       - cu121    (CUDA 12.1 build from the PyTorch index)
                       - rocm6.0  (ROCm 6.0 build from the PyTorch index)
  --python <path>      Python executable to use for creating the venv (default: python3).
  -h, --help           Show this help message.

Environment variables:
  VENV          Override the virtualenv path (default: $ROOT/.venv)
  PYTHON_BIN    Same as --python.

Examples:
  scripts/setup.sh
  scripts/setup.sh --recreate --torch cu121
EOF
}

while (($#)); do
  case "$1" in
    --recreate)
      RECREATE=1
      ;;
    --torch)
      TORCH_CHANNEL="${2:-}"
      if [[ -z "$TORCH_CHANNEL" ]]; then
        echo "Error: --torch requires a value." >&2
        usage
        exit 1
      fi
      shift
      ;;
    --python)
      PYTHON_BIN="${2:-}"
      if [[ -z "$PYTHON_BIN" ]]; then
        echo "Error: --python requires a path." >&2
        usage
        exit 1
      fi
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ "$RECREATE" -eq 1 && -d "$VENV" ]]; then
  echo "Removing existing virtualenv at $VENV"
  rm -rf "$VENV"
fi

if [[ ! -d "$VENV" ]]; then
  echo "Creating virtualenv at $VENV"
  "$PYTHON_BIN" -m venv "$VENV"
fi

PIP="$VENV/bin/pip"
PYTHON="$VENV/bin/python"

if [[ ! -x "$PIP" ]]; then
  echo "Virtualenv looks incomplete (pip missing). Recreating..." >&2
  rm -rf "$VENV"
  "$PYTHON_BIN" -m venv "$VENV"
fi

echo "Upgrading pip/setuptools/wheel"
"$PIP" install --upgrade pip setuptools wheel

install_with_torch_channel() {
  local channel="$1"
  case "$channel" in
    default)
      echo "Installing requirements from PyPI (CPU builds)"
      "$PIP" install --upgrade -r "$ROOT/requirements.txt"
      ;;
    cu121)
      echo "Installing requirements using PyTorch CUDA 12.1 wheels"
      "$PIP" install --upgrade torch --index-url https://download.pytorch.org/whl/cu121
      "$PIP" install --upgrade -r "$ROOT/requirements.txt" --extra-index-url https://download.pytorch.org/whl/cu121
      ;;
    rocm6.0)
      echo "Installing requirements using PyTorch ROCm 6.0 wheels"
      "$PIP" install --upgrade torch --index-url https://download.pytorch.org/whl/rocm6.0
      "$PIP" install --upgrade -r "$ROOT/requirements.txt" --extra-index-url https://download.pytorch.org/whl/rocm6.0
      ;;
    *)
      echo "Unknown torch channel: $channel" >&2
      usage
      exit 1
      ;;
  esac
}

install_with_torch_channel "$TORCH_CHANNEL"

echo
echo "Environment ready."
echo "Activate with: source \"$VENV/bin/activate\""
echo "Or use the scripts in ./scripts which automatically use this venv."
