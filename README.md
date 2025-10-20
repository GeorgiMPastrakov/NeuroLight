# NeuroLight

Adaptive traffic-light control with reinforcement learning and a real-time visualizer.

## Why It’s Useful
- **End-to-end demo:** train an RL policy, evaluate it against a handcrafted baseline, and serve live decisions through a Flask API plus WebGL canvas UI.
- Base-only simulation: vehicle phases with queue-aware fixed controller for comparison.
- **Domain randomization:** configurable arrival-rate perturbations for robustness testing.
- **Ready-to-run scripts:** one-liners for setup, training, serving, evaluation, and tests.

---

## Prerequisites
- Linux or macOS (Windows WSL works)
- Python 3.10 or newer
- Recommended: virtual environment (automatically handled by `scripts/setup.sh`)
- Optional: CUDA 12.1 or ROCm 6.0 drivers for GPU acceleration

---

## Quick Start
```bash
git clone <repo-url>
cd NeuroLight
scripts/setup.sh             # creates .venv and installs dependencies
scripts/train.sh             # trains a PPO agent (base-only)
scripts/serve.sh             # starts the Flask API with the trained model
# In another terminal
xdg-open http://localhost:8000  # or open manually in your browser
```

> The UI starts in **Fixed** mode. Click **Load Policy** then switch to **RL** to watch queues adapt. Toggle **Rush hour** to stress the controller.

---

## Script Reference

| Script | Purpose | Key Environment Vars |
| --- | --- | --- |
| `scripts/setup.sh` | Create/update `.venv` and install deps | `TORCH_CHANNEL` via `--torch`, `PYTHON_BIN`, `VENV` |
| `scripts/train.sh` | Train PPO with sensible defaults | `ENV_TYPE`, `DEVICE`, `NUM_ENVS`, `TOTAL_TIMESTEPS`, `TB_LOG_DIR`, `SUBPROC`, `SAVE_BEST` |
| `scripts/serve.sh` | Launch API + UI backend | `HOST`, `PORT`, `SB3_DEVICE`, `DEBUG` |
| `scripts/eval.sh` | Run fixed and RL evaluations, persist `results/last_run.json` | — |
| `scripts/run_tests.sh` | Execute unit tests (pytest if available, otherwise unittest) | — |

Scripts automatically activate the project virtualenv (`.venv`). Override defaults with environment variables:

```bash
ENV_TYPE=base TOTAL_TIMESTEPS=100000 DEVICE=cpu scripts/train.sh --progress_bar
HOST=127.0.0.1 PORT=8080 DEBUG=1 scripts/serve.sh
```

---

## Training

- Configuration lives in `train/config.yaml`:
  - `env` controls traffic demand and signal timing.
  - `policy_kwargs` sets a two-layer MLP (256 units).
  - `rand` enables domain randomization (per-episode scaling of vehicle/pedestrian arrival rates). Remove the block to disable.
- `scripts/train.sh` defaults to a 500 k step run with 8 vector environments, periodic evaluation, and automatic best-model checkpointing to `train/models/ppo_single_junction.zip`.
- For smoke tests or CI:

  ```bash
  TOTAL_TIMESTEPS=50000 NUM_ENVS=4 SAVE_BEST=0 scripts/train.sh
  ```

- GPU training: install CUDA/ROCm builds via `scripts/setup.sh --torch cu121` (for CUDA 12.1) or `--torch rocm6.0`, then set `DEVICE=cuda`.

---

## Serving & Frontend

```bash
USE_PED=1 SB3_DEVICE=cuda scripts/serve.sh
```

- `USE_PED=1` loads the pedestrian-aware environment; omit or set to `0` for vehicle-only.
- `SB3_DEVICE` controls inference device (`auto`, `cpu`, or `cuda`).
- Server auto-resets episodes once they reach `episode_len`, clears per-episode metrics, and reports summaries under `metrics.last_episode`.
- Endpoints:
  - `POST /load_policy` – load model (defaults to `train/models/ppo_single_junction.zip`)
  - `POST /mode` – switch between `fixed` and `rl`
  - `POST /step` – advance simulation; returns current observation, reward, action taken, and `episode_reset`/`episode_summary` when an episode rolls over
  - `POST /set_params` – adjust arrival rates on the fly
  - `POST /ped_call` – queue a pedestrian request (`side` = `ns` or `ew`)
  - `GET /metrics` – live dashboard metrics per episode

The web UI (in `web/`) polls `/step` at the selected frame rate, renders queues with canvas, and displays live metrics and a wait-time sparkline. Episodes now cycle seamlessly without manual resets.

---

## Evaluation & Testing

```bash
scripts/eval.sh        # deterministic fixed-time and trained policy evals
scripts/run_tests.sh   # unit tests (pytest if installed, else unittest)
```

Evaluation writes summaries to stdout and `results/last_run.json`. The RL evaluation infers whether the loaded model expects the base or pedestrian observation space and runs on both when possible.

---

## Configuration Cheatsheet

| Setting | Location | Description |
| --- | --- | --- |
| `episode_len` | `train/config.yaml` → `env.episode_len` | Steps per episode before auto-reset |
| `min_green`, `yellow` | same | Signal timing constraints |
| `lambda_ns`, `lambda_ew` | same | Mean vehicle arrivals (Poisson) |
| (pedestrian settings removed) | — | — |
| `rand.*` | `train/config.yaml` | Domain randomization ranges |
| `step_fixed()` | `api/server.py` | Queue-aware baseline controller |

---

## Project Layout

```
api/            Flask API and fixed baseline controller
envs/           Gymnasium environments (vehicles)
train/          Training, evaluation scripts, wrappers, configs
web/            Static frontend (canvas renderer + controls)
tests/          Unit tests for environment dynamics and rewards
scripts/        Entry-point helpers for setup, training, serving, etc.
train/models/   Saved PPO checkpoints (gitignored)
logs/, results/ Output directories for TensorBoard and eval summaries
```

---

## Troubleshooting

- **“Virtualenv not found”** – run `scripts/setup.sh` first (consider `--recreate` if the env is stale).
- **GPU not detected** – confirm `python -c "import torch; print(torch.cuda.is_available())"` inside `.venv`. Reinstall with `scripts/setup.sh --torch cu121`.
- **UI stops updating** – episodes now auto-reset, but if the UI appears stuck, reload the page. For debugging, check the browser console for network errors.
- **Metrics look cumulative** – `/reset` and episode rollovers clear counters; if values keep climbing, ensure you’re on the updated server (`scripts/serve.sh`).
- **Custom configs** – point training to another config file with `CONFIG=path/to/other.yaml scripts/train.sh` and the server will pick up changes automatically on restart.

---

## Development Tips

- Activate the virtualenv manually with `source .venv/bin/activate` for ad-hoc work.
- Export `PYTHONPATH=.` if you run modules directly without the helper scripts.
- Use `ENV_TYPE=base` to focus on vehicle-only training and reduce action space to 2.
- Scripts replace the older make targets; prefer `scripts/*.sh` helpers for reproducible commands.

Happy tinkering! PRs that add new scenarios, controllers, or evaluation suites are welcome.
