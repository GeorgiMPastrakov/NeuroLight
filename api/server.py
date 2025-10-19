import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import yaml
from envs.traffic_env import TrafficEnv
from envs.traffic_env_ped import TrafficEnvPed

app = Flask(__name__, static_folder="../web", static_url_path="")
CORS(app)

with open("train/config.yaml", "r") as f:
    cfg = yaml.safe_load(f)

seed = cfg.get("seed", 42)
use_ped = os.environ.get("USE_PED", "0") == "1"
sb3_device = os.environ.get("SB3_DEVICE", "auto")
env = TrafficEnvPed(seed=seed, **cfg["env"], **cfg["env_ped"]) if use_ped else TrafficEnv(seed=seed, **cfg["env"])
obs, info = env.reset()
model = None
mode = "fixed"
metrics = {"t": 0, "avg_wait_proxy": 0.0, "served_v": 0, "served_p": 0, "switches": 0, "reward_avg": 0.0}

def step_fixed():
    """Queue-aware fixed controller with ped priority and max green cap.

    - Gives pedestrians the walk once min_green is satisfied and no yellow is active.
    - Switches between NS/EW after min_green if the other approach is busier.
    - Enforces a max green cap so no approach starves.
    """
    global env
    # Determine a max green cap (fallback to 15 if not in config)
    try:
        max_green = int(cfg.get("env", {}).get("max_green", 15))
    except Exception:
        max_green = 15

    # If pedestrian phase or yellow is active, do nothing
    if getattr(env, "phase", 0) == 2:
        return 0
    if getattr(env, "yellow_left", 0) > 0:
        return 0

    # Vehicle switching logic (evaluate before serving pedestrians)
    if env.phase in [0, 1]:
        # Only consider switching after min green
        if env.t_in_phase >= env.min_green:
            ns_q = getattr(env, "q_ns", 0)
            ew_q = getattr(env, "q_ew", 0)
            # If the opposing approach is busier, or we've hit the max green cap, switch
            if (env.phase == 0 and ew_q > ns_q) or (env.phase == 1 and ns_q > ew_q) or env.t_in_phase >= max_green:
                return 1

    # Pedestrian priority: if a call is pending and min green is satisfied, serve ped
    if hasattr(env, "p_ns") and hasattr(env, "p_ew"):
        if (env.p_ns > 0 or env.p_ew > 0) and env.t_in_phase >= env.min_green:
            return 2
    return 0

@app.post("/load_policy")
def load_policy():
    global model
    data = request.get_json(force=True)
    p = data.get("path", "train/models/ppo_single_junction.zip")
    if not os.path.exists(p):
        return jsonify({"ok": False}), 400
    # Lazy import to avoid torch dependency unless RL is used
    from stable_baselines3 import PPO
    model = PPO.load(p, device=sb3_device)
    return jsonify({"ok": True})

@app.post("/mode")
def set_mode():
    global mode
    data = request.get_json(force=True)
    m = data.get("mode", "fixed")
    if m not in ["fixed", "rl"]:
        return jsonify({"ok": False}), 400
    mode = m
    return jsonify({"ok": True, "mode": mode})

@app.post("/reset")
def reset():
    global env, obs
    obs, info = env.reset()
    return jsonify({"obs": obs.tolist(), "info": info})

@app.post("/step")
def step():
    global env, obs, model, mode, metrics
    data = request.get_json(force=True) if request.data else {}
    m = data.get("mode", mode)
    if m == "rl":
        if model is None:
            return jsonify({"error": "no model"}), 400
        # Lazy import in case model was loaded via other path
        from stable_baselines3 import PPO  # noqa: F401
        action, _ = model.predict(obs, deterministic=True)
        action = int(action)
    else:
        action = step_fixed()
    obs, reward, terminated, truncated, info = env.step(action)
    if hasattr(env, "yellow_left"):
        info["yellow"] = int(env.yellow_left)
    if hasattr(env, "t_in_phase"):
        info["t_in_phase"] = int(env.t_in_phase)
    if hasattr(env, "min_green"):
        info["min_green"] = int(env.min_green)
    if hasattr(env, "ped_walk_left"):
        info["ped_walk_left"] = int(env.ped_walk_left)
    if hasattr(env, "ped_clear_left"):
        info["ped_clear_left"] = int(env.ped_clear_left)
    t = info.get("t", metrics["t"]) or 1
    metrics["t"] = t
    avg_wait = (info.get("q_ns", 0) + info.get("q_ew", 0))
    metrics["avg_wait_proxy"] = (metrics["avg_wait_proxy"] * (t - 1) + avg_wait) / t
    metrics["served_v"] += info.get("served_v", 0)
    metrics["served_p"] += info.get("served_p", 0)
    metrics["switches"] = info.get("switches", metrics["switches"]) 
    metrics["reward_avg"] = (metrics["reward_avg"] * (t - 1) + reward) / t
    return jsonify({"obs": obs.tolist(), "reward": float(reward), "terminated": bool(terminated), "truncated": bool(truncated), "info": info})

@app.get("/metrics")
def get_metrics():
    return jsonify(metrics)

@app.get("/")
def root():
    return app.send_static_file("index.html")

@app.post("/set_params")
def set_params():
    global env
    data = request.get_json(force=True)
    if "lambda_ns" in data:
        env.lambda_ns = float(data["lambda_ns"])
    if "lambda_ew" in data:
        env.lambda_ew = float(data["lambda_ew"])
    if hasattr(env, "lambda_p_ns") and "lambda_p_ns" in data:
        env.lambda_p_ns = float(data["lambda_p_ns"])
    if hasattr(env, "lambda_p_ew") and "lambda_p_ew" in data:
        env.lambda_p_ew = float(data["lambda_p_ew"])
    return jsonify({"ok": True})

@app.post("/ped_call")
def ped_call():
    global env
    if not hasattr(env, "p_ns"):
        return jsonify({"ok": False}), 400
    side = request.get_json(force=True).get("side", "ns")
    if side == "ns":
        env.p_ns += 1
    else:
        env.p_ew += 1
    return jsonify({"ok": True})

if __name__ == "main__":
    app.run(host="0.0.0.0", port=8000, debug=False)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
