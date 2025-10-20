import os
import yaml
from stable_baselines3 import PPO
from envs.traffic_env import TrafficEnv

def run_episode(env, model):
    obs, info = env.reset()
    done = False
    trunc = False
    total_reward = 0.0
    total_q = 0.0
    served_v = 0
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
        switches = info.get("switches", switches)
    avg_q = total_q / max(1, info.get("t", 1))
    return {"reward": total_reward, "avg_q": avg_q, "served_v": served_v, "switches": switches, "actions": action_counts}

def main():
    with open("train/config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
    path = "train/models/ppo_single_junction.zip"
    if not os.path.exists(path):
        print("missing model")
        return
    seed = cfg.get("seed", 42)
    model = PPO.load(path)
    env_base = TrafficEnv(seed=seed, **cfg["env"])
    results = {"base": run_episode(env_base, model)}
    print(results)
    os.makedirs('results', exist_ok=True)
    import json
    with open('results/last_run.json','w') as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()
