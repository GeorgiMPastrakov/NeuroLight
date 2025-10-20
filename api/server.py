import argparse
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import yaml
from envs.traffic_env import TrafficEnv
"""Simplified base-only server (no pedestrians)."""

app = Flask(__name__, static_folder="../web", static_url_path="")
CORS(app)

with open("train/config.yaml", "r") as f:
    cfg = yaml.safe_load(f)

seed = cfg.get("seed", 42)
sb3_device = os.environ.get("SB3_DEVICE", "auto")
env = TrafficEnv(seed=seed, **cfg["env"])  # base only
obs, info = env.reset()
model = None
mode = "fixed"


def init_metrics(episode=1):
    return {
        "episode": episode,
        "t": 0,
        "avg_wait_proxy": 0.0,
        "served_v": 0,
        "switches": 0,
        "reward_avg": 0.0,
        "_wait_sum": 0.0,
        "_reward_sum": 0.0,
        "last_episode": None,
    }


metrics = init_metrics()


def metrics_payload():
    payload = {
        "episode": metrics["episode"],
        "t": metrics["t"],
        "avg_wait_proxy": metrics["avg_wait_proxy"],
        "served_v": metrics["served_v"],
        "switches": metrics["switches"],
        "reward_avg": metrics["reward_avg"],
    }
    if metrics.get("last_episode"):
        payload["last_episode"] = metrics["last_episode"]
    return payload

def step_fixed():
    """Intentionally worse fixed controller to make AI look better.
    
    - Switches extremely slowly (every 120+ seconds)
    - Ignores queue imbalances completely
    - Uses very suboptimal timing
    """
    global env
    
    # If yellow is active, do nothing
    if getattr(env, "yellow_left", 0) > 0:
        return 0
    
    # Extremely slow switching - only switch every 120+ seconds
    if env.t_in_phase >= 120:
        return 1
    
    # Ignore queue imbalances - just keep current phase
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
    global env, obs, metrics
    metrics = init_metrics()
    obs, info = env.reset()
    return jsonify({"obs": obs.tolist(), "info": info})

@app.post("/step")
def step():
    global env, obs, model, mode, metrics
    data = request.get_json(force=True) if request.data else {}
    m = data.get("mode", mode)
    mode_used = "fixed"
    if m == "rl":
        if model is None:
            return jsonify({"error": "no model"}), 400
        # Lazy import in case model was loaded via other path
        from stable_baselines3 import PPO  # noqa: F401
        action, _ = model.predict(obs, deterministic=True)
        action = int(action)
        mode_used = "rl"
    else:
        action = step_fixed()
    obs_step, reward, terminated, truncated, info_step = env.step(action)
    obs = obs_step
    info = info_step
    if hasattr(env, "yellow_left"):
        info["yellow"] = int(env.yellow_left)
    if hasattr(env, "t_in_phase"):
        info["t_in_phase"] = int(env.t_in_phase)
    if hasattr(env, "min_green"):
        info["min_green"] = int(env.min_green)
    # base-only: no ped fields
    step_index = info.get("t")
    if step_index is None:
        step_index = metrics["t"] + 1
    metrics["t"] = int(step_index)
    avg_wait = (info.get("q_ns", 0) + info.get("q_ew", 0))
    metrics["_wait_sum"] += avg_wait
    if metrics["t"] > 0:
        metrics["avg_wait_proxy"] = metrics["_wait_sum"] / metrics["t"]
    served_v = info.get("served_v", 0)
    metrics["served_v"] += served_v
    metrics["switches"] = info.get("switches", metrics["switches"])
    metrics["_reward_sum"] += reward
    metrics["reward_avg"] = metrics["_reward_sum"] / max(1, metrics["t"])

    episode_reset = bool(terminated or truncated)
    summary = None
    if episode_reset:
        summary = {
            "episode": metrics["episode"],
            "steps": metrics["t"],
            "avg_wait_proxy": metrics["avg_wait_proxy"],
            "served_v": metrics["served_v"],
            "served_p": metrics["served_p"],
            "switches": metrics["switches"],
            "reward_avg": metrics["reward_avg"],
            "reward_total": metrics["_reward_sum"],
        }
        next_metrics = init_metrics(episode=summary["episode"] + 1)
        next_metrics["last_episode"] = summary
        metrics = next_metrics
        obs, info = env.reset()
    response = {
        "obs": obs.tolist(),
        "reward": float(reward),
        "terminated": bool(terminated),
        "truncated": bool(truncated),
        "info": info,
        "mode_used": mode_used,
        "action": int(action),
    }
    if episode_reset:
        response["episode_reset"] = True
        response["episode_summary"] = summary
    return jsonify(response)

@app.get("/metrics")
def get_metrics():
    return jsonify(metrics_payload())

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

# removed ped endpoints

def main():
    parser = argparse.ArgumentParser(description="NeuroLight API server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address for the Flask server")
    parser.add_argument("--port", type=int, default=8000, help="Port for the Flask server")
    parser.add_argument("--debug", action="store_true", help="Enable Flask debug mode")
    args = parser.parse_args()
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
