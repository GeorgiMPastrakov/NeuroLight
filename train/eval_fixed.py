import yaml
from envs.traffic_env import TrafficEnv
from envs.traffic_env_ped import TrafficEnvPed

def run_episode(env, fixed_cycle=30):
    obs, info = env.reset()
    t_local = 0
    switches = 0
    total_reward = 0.0
    total_q = 0.0
    served_v = 0
    served_p = 0
    done = False
    trunc = False
    current_phase_time = 0
    while not (done or trunc):
        action = 0
        if getattr(env, "phase", 0) == 2:
            action = 0
        else:
            if current_phase_time >= fixed_cycle:
                action = 1
                current_phase_time = 0
            else:
                action = 0
        obs, reward, done, trunc, info = env.step(action)
        total_reward += reward
        total_q += info.get("q_ns", 0) + info.get("q_ew", 0)
        served_v += info.get("served_v", 0)
        served_p += info.get("served_p", 0)
        switches = info.get("switches", switches)
        if env.yellow_left == 0 and env.phase in [0,1]:
            current_phase_time += 1
        t_local += 1
    avg_q = total_q / max(1, t_local)
    return {"reward": total_reward, "avg_q": avg_q, "served_v": served_v, "served_p": served_p, "switches": switches}

def main():
    with open("train/config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
    seed = cfg.get("seed", 42)
    env_base = TrafficEnv(seed=seed, **cfg["env"])
    r_base = run_episode(env_base)
    env_ped = TrafficEnvPed(seed=seed, **cfg["env"], **cfg["env_ped"])
    r_ped = run_episode(env_ped)
    print({"base": r_base, "ped": r_ped})

if __name__ == "__main__":
    main()
