from __future__ import annotations

import os
from typing import Optional, Callable, Any, Dict

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback, CallbackList
from stable_baselines3.common.utils import set_random_seed

from envs.traffic_env import TrafficEnv


class Agent:
	"""Agent abstraction for training and evaluating PPO on the base TrafficEnv.

	This class encapsulates environment creation, PPO configuration, and
	training/evaluation helpers. It intentionally targets the vehicle-only
	TrafficEnv for a simpler end-to-end stack.
	"""

	def __init__(
		self,
		cfg: Dict[str, Any],
		seed: int = 42,
		device: str = "auto",
		n_envs: int = 1,
		use_subproc: bool = False,
		tb_log_dir: Optional[str] = None,
	):
		self.cfg = cfg
		self.seed = seed
		self.device = device
		self.n_envs = max(1, int(n_envs))
		self.use_subproc = bool(use_subproc)
		self.tb_log_dir = tb_log_dir
		set_random_seed(seed)

		def env_factory() -> TrafficEnv:
			return TrafficEnv(
				seed=seed,
				max_queue=cfg["env"]["max_queue"],
				lambda_ns=cfg["env"]["lambda_ns"],
				lambda_ew=cfg["env"]["lambda_ew"],
				veh_throughput=cfg["env"]["veh_throughput"],
				min_green=cfg["env"]["min_green"],
				yellow=cfg["env"]["yellow"],
				episode_len=cfg["env"]["episode_len"],
				decision_interval=cfg["env"].get("decision_interval", 1),
			)

		vec_cls = SubprocVecEnv if self.use_subproc and self.n_envs > 1 else None
		self.env = make_vec_env(env_factory, n_envs=self.n_envs, seed=seed, vec_env_cls=vec_cls)

		policy = cfg["policy"]
		lr_cfg = cfg.get("learning_rate")
		lr_sched = cfg.get("learning_rate_schedule")
		if lr_sched == "linear" and isinstance(lr_cfg, (int, float)):
			init_lr = float(lr_cfg)

			def lr_schedule(progress_remaining: float) -> float:
				return init_lr * progress_remaining

			learning_rate: Callable[[float], float] | float = lr_schedule
		else:
			learning_rate = lr_cfg

		self.model = PPO(
			policy,
			self.env,
			learning_rate=learning_rate,
			gamma=cfg["gamma"],
			gae_lambda=cfg["gae_lambda"],
			n_steps=cfg["n_steps"],
			batch_size=cfg["batch_size"],
			n_epochs=cfg["n_epochs"],
			ent_coef=cfg["ent_coef"],
			clip_range=cfg["clip_range"],
			target_kl=cfg.get("target_kl", None),
			seed=seed,
			device=device,
			tensorboard_log=tb_log_dir,
			policy_kwargs=cfg.get("policy_kwargs", None),
			verbose=0,
		)

	def train(
		self,
		total_timesteps: int,
		eval_freq: int = 0,
		eval_episodes: int = 5,
		save_best_path: Optional[str] = None,
		progress_bar: bool = False,
	) -> None:
		callbacks = []
		if eval_freq and eval_freq > 0:
			def eval_factory() -> TrafficEnv:
				return TrafficEnv(
					seed=self.seed,
					max_queue=self.cfg["env"]["max_queue"],
					lambda_ns=self.cfg["env"]["lambda_ns"],
					lambda_ew=self.cfg["env"]["lambda_ew"],
					veh_throughput=self.cfg["env"]["veh_throughput"],
					min_green=self.cfg["env"]["min_green"],
					yellow=self.cfg["env"]["yellow"],
					episode_len=self.cfg["env"]["episode_len"],
					decision_interval=self.cfg["env"].get("decision_interval", 1),
				)

			vec_cls = DummyVecEnv
			eval_env = make_vec_env(eval_factory, n_envs=1, seed=self.seed, vec_env_cls=vec_cls)
			eval_cb = EvalCallback(
				eval_env,
				best_model_save_path=save_best_path if save_best_path else None,
				log_path=self.tb_log_dir,
				eval_freq=eval_freq,
				n_eval_episodes=eval_episodes,
				deterministic=True,
				render=False,
			)
			callbacks.append(eval_cb)

		if callbacks:
			cb = CallbackList(callbacks)
			self.model.learn(total_timesteps=total_timesteps, progress_bar=progress_bar, callback=cb)
		else:
			self.model.learn(total_timesteps=total_timesteps, progress_bar=progress_bar)

	def save(self, path: str) -> None:
		os.makedirs(os.path.dirname(path), exist_ok=True)
		self.model.save(path)

	@classmethod
	def load(cls, path: str, device: str = "auto") -> PPO:
		return PPO.load(path, device=device)

	def predict(self, obs):
		return self.model.predict(obs, deterministic=True)
