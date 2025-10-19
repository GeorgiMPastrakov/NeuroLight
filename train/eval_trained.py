import os
import yaml
import numpy as np
from stable_baselines3 import PPO
from envs.traffic_env import TrafficEnv
from envs.traffic_env_ped import TrafficEnvPed

def run_episode(env, model):
    obs, info = env.reset()
    done = False
    trunc = False
    total_reward = 0.0
    total_q = 0.0
    served_v = 0
    served_p = 0
    switches = 0
    action_counts = {}
    while not (done or trunc):
        action, _ = model.predict(obs, deterministic=True)
        a = int(action)
        action_counts[a] = action_counts.get(a, 0) + 1
        obs, reward, done, trunc, info = env.step(a)
        total_reward += reward
        total_q += info.get("q_ns", 0) + info.get("q_ew", 0)
        served_v += info.get("served_v", 0)
        served_p += info.get("served_p", 0)
        switches = info.get("switches", switches)
    avg_q = total_q / max(1, info.get("t", 1))
    return {"reward": total_reward, "avg_q": avg_q, "served_v": served_v, "served_p": served_p, "switches": switches, "actions": action_counts}

def main():
    with open("train/config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
    path = "train/models/ppo_single_junction.zip"
    if not os.path.exists(path):
        print("missing model")
        return
    seed = cfg.get("seed", 42)
    model = PPO.load(path)
    # Infer which env the model was trained on from its spaces
    obs_shape = getattr(model.observation_space, "shape", None)
    act_n = getattr(getattr(model, "action_space", None), "n", None)
    results = {}
    if obs_shape and len(obs_shape) == 1 and (obs_shape[0] == 5 or act_n == 2):
        env_base = TrafficEnv(seed=seed, **cfg["env"])
        results["base"] = run_episode(env_base, model)
    if obs_shape and len(obs_shape) == 1 and (obs_shape[0] == 8 or act_n == 3):
        env_ped = TrafficEnvPed(seed=seed, **cfg["env"], **cfg["env_ped"])
        results["ped"] = run_episode(env_ped, model)
    if not results:
        print({"error": "Could not infer env type from model", "obs_shape": obs_shape, "action_n": act_n})
        return
    print(results)

if __name__ == "__main__":
    main()
