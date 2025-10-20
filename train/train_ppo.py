import os
import shutil
import argparse
import yaml
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback, CallbackList
from train.wrappers import RandomizeParams
from stable_baselines3.common.utils import set_random_seed
from envs.traffic_env import TrafficEnv

def make_env(env_type, cfg, seed):
    def _thunk():
        e = TrafficEnv(
                seed=seed,
                max_queue=cfg["env"]["max_queue"],
                lambda_ns=cfg["env"]["lambda_ns"],
                lambda_ew=cfg["env"]["lambda_ew"],
                veh_throughput=cfg["env"]["veh_throughput"],
                min_green=cfg["env"]["min_green"],
                yellow=cfg["env"]["yellow"],
                episode_len=cfg["env"]["episode_len"],
                decision_interval=cfg["env"].get("decision_interval", 1),
                wait_w=cfg["env"].get("wait_w", 1.0),
                max_w=cfg["env"].get("max_w", 0.1),
                switch_w=cfg["env"].get("switch_w", 0.5),
                served_w=cfg["env"].get("served_w", 0.05),
                imbalance_w=cfg["env"].get("imbalance_w", 0.0),
                hold_w=cfg["env"].get("hold_w", 0.0),
            )
        return e
    return _thunk

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=["base"], default="base")
    parser.add_argument("--config", default="train/config.yaml")
    parser.add_argument("--models_dir", default="train/models")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"], help="Torch device for training")
    parser.add_argument("--num_envs", type=int, default=1, help="Number of parallel envs")
    parser.add_argument("--total_timesteps", type=int, default=None, help="Override total timesteps")
    parser.add_argument("--tb_log_dir", default=None, help="TensorBoard log dir")
    parser.add_argument("--subproc", action="store_true", help="Use SubprocVecEnv for parallelism")
    parser.add_argument("--eval_freq", type=int, default=0, help="Eval frequency in steps (0 disables)")
    parser.add_argument("--eval_episodes", type=int, default=5, help="Episodes per evaluation")
    parser.add_argument("--save_best", action="store_true", help="Save best model during training")
    parser.add_argument("--progress_bar", action="store_true", help="Show training progress bar")
    parser.add_argument("--resume_from", default=None, help="Path to an existing SB3 checkpoint to continue training from")
    args = parser.parse_args()
    with open(args.config, "r") as f:
        cfg = yaml.safe_load(f)
    os.makedirs(args.models_dir, exist_ok=True)
    seed = cfg.get("seed", 42)
    set_random_seed(seed)
    def factory():
        e = make_env(args.env, cfg, seed)()
        rand_cfg = cfg.get("rand")
        if rand_cfg:
            e = RandomizeParams(e, rand_cfg)
        return e

    vec_cls = SubprocVecEnv if args.subproc and args.num_envs > 1 else None
    env = make_vec_env(factory, n_envs=args.num_envs, seed=seed, vec_env_cls=vec_cls)
    policy = cfg["policy"]

    lr_cfg = cfg.get("learning_rate")
    lr_sched = cfg.get("learning_rate_schedule")
    if lr_sched == "linear" and isinstance(lr_cfg, (int, float)):
        init_lr = float(lr_cfg)
        def lr_schedule(progress_remaining):
            return init_lr * progress_remaining
        lr = lr_schedule
    else:
        lr = lr_cfg

    def _new_model():
        return PPO(policy, env,
                   learning_rate=lr,
                   gamma=cfg["gamma"],
                   gae_lambda=cfg["gae_lambda"],
                   n_steps=cfg["n_steps"],
                   batch_size=cfg["batch_size"],
                   n_epochs=cfg["n_epochs"],
                   ent_coef=cfg["ent_coef"],
                   clip_range=cfg["clip_range"],
                   target_kl=cfg.get("target_kl", None),
                   seed=seed,
                   device=args.device,
                   tensorboard_log=args.tb_log_dir,
                   policy_kwargs=cfg.get("policy_kwargs", None),
                   verbose=0)

    resume_path = args.resume_from
    if resume_path and os.path.exists(resume_path):
        try:
            probe = PPO.load(resume_path, device=args.device)
            saved_obs_shape = getattr(getattr(probe, "observation_space", None), "shape", None)
            saved_act_n = getattr(getattr(probe, "action_space", None), "n", None)
            cur_obs_shape = getattr(env.observation_space, "shape", None)
            cur_act_n = getattr(env.action_space, "n", None)
            spaces_match = (
                saved_obs_shape == cur_obs_shape and saved_act_n == cur_act_n
            )
            if spaces_match:
                model = PPO.load(resume_path, env=env, device=args.device)
                print(f"Resumed training from {resume_path} (obs={saved_obs_shape}, act_n={saved_act_n}).")
            else:
                print(
                    f"[WARN] Resume skipped due to space mismatch: saved obs={saved_obs_shape}, act_n={saved_act_n} vs current obs={cur_obs_shape}, act_n={cur_act_n}. Starting fresh.")
                model = _new_model()
        except Exception as e:
            print(f"[WARN] Resume failed ('{e}'). Starting fresh.")
            model = _new_model()
    else:
        if resume_path:
            print(f"[WARN] Resume path not found: {resume_path}. Starting fresh.")
        model = _new_model()
    total_timesteps = args.total_timesteps or cfg["total_timesteps"]

    callbacks = []
    if args.eval_freq and args.eval_freq > 0:
        def eval_factory():
            e = make_env(args.env, cfg, seed)()
            rand_cfg = cfg.get("rand")
            if rand_cfg:
                e = RandomizeParams(e, rand_cfg)
            return e
        eval_vec_cls = vec_cls if vec_cls is not None else DummyVecEnv
        eval_env = make_vec_env(eval_factory, n_envs=1, seed=seed, vec_env_cls=eval_vec_cls)
        eval_cb = EvalCallback(eval_env, best_model_save_path=args.models_dir if args.save_best else None,
                               log_path=args.tb_log_dir, eval_freq=args.eval_freq,
                               n_eval_episodes=args.eval_episodes, deterministic=True, render=False)
        callbacks.append(eval_cb)
    if callbacks:
        cb = CallbackList(callbacks)
        model.learn(total_timesteps=total_timesteps, progress_bar=args.progress_bar, callback=cb)
    else:
        model.learn(total_timesteps=total_timesteps, progress_bar=args.progress_bar)
    out_path = os.path.join(args.models_dir, "ppo_single_junction.zip")
    best_candidate = os.path.join(args.models_dir, "best_model.zip")
    if args.save_best and args.eval_freq and os.path.exists(best_candidate):
        shutil.copy2(best_candidate, out_path)
        print(f"Saved best model to {out_path}")
    else:
        model.save(out_path)
        print(out_path)

if __name__ == "__main__":
    main()
