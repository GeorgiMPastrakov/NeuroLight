import os
import shutil
import argparse
import yaml
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import SubprocVecEnv
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback, CallbackList
from train.wrappers import RandomizeParams
from stable_baselines3.common.utils import set_random_seed
from envs.traffic_env import TrafficEnv
from envs.traffic_env_ped import TrafficEnvPed

def make_env(env_type, cfg, seed):
    def _thunk():
        if env_type == "ped":
            e = TrafficEnvPed(
                seed=seed,
                max_queue=cfg["env"]["max_queue"],
                lambda_ns=cfg["env"]["lambda_ns"],
                lambda_ew=cfg["env"]["lambda_ew"],
                veh_throughput=cfg["env"]["veh_throughput"],
                min_green=cfg["env"]["min_green"],
                yellow=cfg["env"]["yellow"],
                episode_len=cfg["env"]["episode_len"],
                lambda_p_ns=cfg["env_ped"]["lambda_p_ns"],
                lambda_p_ew=cfg["env_ped"]["lambda_p_ew"],
                ped_throughput=cfg["env_ped"]["ped_throughput"],
                min_walk=cfg["env_ped"]["min_walk"],
                clearance=cfg["env_ped"]["clearance"],
            )
        else:
            e = TrafficEnv(
                seed=seed,
                max_queue=cfg["env"]["max_queue"],
                lambda_ns=cfg["env"]["lambda_ns"],
                lambda_ew=cfg["env"]["lambda_ew"],
                veh_throughput=cfg["env"]["veh_throughput"],
                min_green=cfg["env"]["min_green"],
                yellow=cfg["env"]["yellow"],
                episode_len=cfg["env"]["episode_len"],
            )
        return e
    return _thunk

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=["base", "ped"], default="base")
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
    args = parser.parse_args()
    with open(args.config, "r") as f:
        cfg = yaml.safe_load(f)
    os.makedirs(args.models_dir, exist_ok=True)
    seed = cfg.get("seed", 42)
    set_random_seed(seed)
    # Vectorized envs (Subproc/Dummy handled by make_vec_env)
    # Build factory with optional domain randomization
    def factory():
        e = make_env(args.env, cfg, seed)()
        rand_cfg = cfg.get("rand")
        if rand_cfg:
            e = RandomizeParams(e, rand_cfg)
        return e

    vec_cls = SubprocVecEnv if args.subproc and args.num_envs > 1 else None
    env = make_vec_env(factory, n_envs=args.num_envs, seed=seed, vec_env_cls=vec_cls)
    policy = cfg["policy"]

    # Learning rate can be a float or a linear schedule
    lr_cfg = cfg.get("learning_rate")
    lr_sched = cfg.get("learning_rate_schedule")
    if lr_sched == "linear" and isinstance(lr_cfg, (int, float)):
        init_lr = float(lr_cfg)
        def lr_schedule(progress_remaining):
            return init_lr * progress_remaining
        lr = lr_schedule
    else:
        lr = lr_cfg

    model = PPO(policy, env,
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
    total_timesteps = args.total_timesteps or cfg["total_timesteps"]

    callbacks = []
    if args.eval_freq and args.eval_freq > 0:
        # single-env eval environment
        def eval_factory():
            e = make_env(args.env, cfg, seed)()
            rand_cfg = cfg.get("rand")
            if rand_cfg:
                e = RandomizeParams(e, rand_cfg)
            return e
        eval_env = make_vec_env(eval_factory, n_envs=1, seed=seed)
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
