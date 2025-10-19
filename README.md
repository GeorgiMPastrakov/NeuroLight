# Adaptive Traffic Light RL

Setup

- make install
- make train
- make serve
- open web/index.html

Structure

- envs/traffic_env.py
- envs/traffic_env_ped.py
- train/train_ppo.py
- train/eval_fixed.py
- train/eval_trained.py
- train/config.yaml
- api/server.py
- web/index.html
- tests/
- requirements.txt
- Makefile

Usage

- Train PPO and save to train/models/ppo_single_junction.zip
- Start the API
- Open the UI and switch between Fixed and RL
- Adjust arrival rates and trigger pedestrian calls

GPU Training

- Install a CUDA build of PyTorch that matches your system. Example (CUDA 12.1):
  - pip install --upgrade pip
  - pip install torch --index-url https://download.pytorch.org/whl/cu121
- Verify GPU is visible: python -c "import torch; print(torch.cuda.is_available())" -> True
- AMD (ROCm): install a ROCm build of PyTorch that matches your ROCm version, e.g.:
  - pip install torch --index-url https://download.pytorch.org/whl/rocm6.0
  - Verify: python -c "import torch; print(torch.cuda.is_available()); import torch; print(torch.version.hip)"
- Defaults are tuned for Ubuntu + 14700KF + 7800 XT:
  - make train  # uses DEV=cuda, NUM_ENVS=16, SUBPROC=1, TB=logs/tb, TOTAL=5e6
  - For different setups, override variables: DEV, NUM_ENVS, TOTAL, TB.

Domain randomization (for robustness)

- Enabled by default in train/config.yaml under `rand:`. It randomly scales vehicle and pedestrian arrival rates per episode.
- Disable by removing or commenting the `rand:` block in config.

Evaluation and checkpoints

- make train now runs with periodic evaluation and saves the best model by default.
- The best model is copied to train/models/ppo_single_junction.zip after training,
  which the UI and eval scripts use automatically.
- Customize via variables: EVAL_FREQ, EVAL_EPISODES, SAVE_BEST=0 to disable.
- Example (explicit script):
  - python -m train.train_ppo --env ped --device cuda --num_envs 16 --subproc \
    --total_timesteps 5000000 --tb_log_dir logs/tb --progress_bar \
    --eval_freq 50000 --eval_episodes 10 --save_best
- The script also accepts: --device, --num_envs, --total_timesteps, --tb_log_dir, --progress_bar

GPU Inference (Server)

- To run RL inference on GPU when loading a policy in the UI:
  - SB3_DEVICE=cuda USE_PED=1 make serve  # or omit USE_PED if not needed
  - Click "Load Policy" in the UI.

Notes

- USE_PED=1 enables pedestrians on the server
