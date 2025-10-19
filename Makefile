VENV?=.venv
PY=$(VENV)/bin/python
PIP=$(VENV)/bin/pip
RUN=HSA_OVERRIDE_GFX_VERSION=11.0.0 PYTHONPATH=. $(PY)
# Defaults tuned for 14700KF + 7800 XT
DEV?=cuda
NUM_ENVS?=16
TB?=logs/tb
TOTAL?=5000000
EVAL_FREQ?=50000
EVAL_EPISODES?=10
SAVE_BEST?=1
PROGRESS?=1

.PHONY: venv install train serve eval-fixed eval-rl
.PHONY: setup verify train-fast train-full eval open clean

venv:
	python3 -m venv $(VENV)

install: venv
	$(PIP) install -r requirements.txt

install-rocm: venv
	$(PIP) install --upgrade pip
	$(PIP) install torch --index-url https://download.pytorch.org/whl/rocm6.0

train:
	$(RUN) -m train.train_ppo --env ped --device $(DEV) --num_envs $(NUM_ENVS) --subproc $(if $(TB),--tb_log_dir $(TB),) $(if $(TOTAL),--total_timesteps $(TOTAL),) $(if $(SAVE_BEST),--save_best,) --eval_freq $(EVAL_FREQ) --eval_episodes $(EVAL_EPISODES) $(if $(PROGRESS),--progress_bar,)

# Convenience targets
setup: install-rocm install ## Create venv, install deps (incl. ROCm torch)

verify: ## Quick sanity checks (Python, Torch presence, ports)
	@echo "Python: " && $(PY) --version
	@echo "Torch installed?" && $(PY) -c "import importlib.util as u; print(u.find_spec('torch') is not None)" || true
	@echo "CUDA/HIP available?" && $(PY) -c "import importlib.util as u; spec=u.find_spec('torch'); print('n/a' if spec is None else __import__('torch').cuda.is_available())" || true
	@echo "Port 8000 in use?" && ( (ss -ltn 2>/dev/null | rg ':8000' || true) )

train-fast: ## Shorter training (for quick smoke tests)
	$(RUN) -m train.train_ppo --env ped --device $(DEV) --num_envs 8 --subproc --total_timesteps 500000 --tb_log_dir logs/tb --eval_freq 50000 --eval_episodes 5 --save_best $(if $(PROGRESS),--progress_bar,)

train-full: ## Full training with tuned defaults
	$(MAKE) train

eval: ## Evaluate trained and fixed policies
	$(RUN) -m train.eval_fixed
	$(RUN) -m train.eval_trained

open: ## Attempt to open web UI
	@echo "Open http://localhost:8000 in your browser after 'make serve'"

clean: ## Remove venv and logs (keeps models)
	rm -rf $(VENV) logs/tb

serve:
	$(RUN) -m api.server

eval-fixed:
	$(RUN) -m train.eval_fixed

eval-rl:
	$(RUN) -m train.eval_trained
