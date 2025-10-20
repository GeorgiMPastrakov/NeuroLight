import numpy as np
import gymnasium as gym
from gymnasium import spaces

class TrafficEnv(gym.Env):
    metadata = {"render_modes": []}
    def __init__(
        self,
        seed=0,
        max_queue=20,
        lambda_ns=0.7,
        lambda_ew=0.7,
        veh_throughput=2,
        min_green=8,
        yellow=3,
        episode_len=1500,
        decision_interval=1,
    ):
        self.max_queue = max_queue
        self.lambda_ns = lambda_ns
        self.lambda_ew = lambda_ew
        self.veh_throughput = veh_throughput
        self.min_green = min_green
        self.yellow_dur = yellow
        self.episode_len = episode_len
        self.decision_interval = max(1, decision_interval)
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(5,), dtype=np.float32)
        self.action_space = spaces.Discrete(2)
        self.rng = np.random.default_rng(seed)
        self.reset(seed=seed)
    def seed(self, seed=None):
        self.rng = np.random.default_rng(seed)
    def _obs(self):
        qns = min(self.q_ns, self.max_queue)
        qew = min(self.q_ew, self.max_queue)
        tnorm = min(self.t_in_phase / max(1, self.min_green), 1.0)
        if self.phase == 0:
            is_ns = 1.0
            is_ew = 0.0
        else:
            is_ns = 0.0
            is_ew = 1.0
        return np.array([qns / self.max_queue, qew / self.max_queue, is_ns, is_ew, tnorm], dtype=np.float32)
    def reset(self, seed=None, options=None):
        if seed is not None:
            self.seed(seed)
        self.q_ns = 0
        self.q_ew = 0
        self.phase = 0
        self.t_in_phase = 0
        self.yellow_left = 0
        self.t = 0
        self.terminated = False
        self.truncated = False
        self.switches = 0
        self.total_reward = 0.0
        self.total_served_v = 0
        self.pending_switch = False
        self.action_timer = 0
        self.last_action = 0
        obs = self._obs()
        info = {"t": self.t, "q_ns": self.q_ns, "q_ew": self.q_ew, "phase": self.phase, "served_v": 0, "switches": self.switches}
        return obs, info
    def _resolve_action(self, action: int) -> int:
        a = int(action)
        if self.decision_interval <= 1:
            self.last_action = a
            return a
        if self.action_timer > 0:
            self.action_timer -= 1
            return self.last_action
        self.last_action = a
        self.action_timer = self.decision_interval - 1
        return self.last_action
    def step(self, action):
        if self.terminated or self.truncated:
            return self._obs(), 0.0, self.terminated, self.truncated, {}
        action = self._resolve_action(action)
        arrivals_ns = self.rng.poisson(self.lambda_ns)
        arrivals_ew = self.rng.poisson(self.lambda_ew)
        self.q_ns += arrivals_ns
        self.q_ew += arrivals_ew
        served = 0
        switched = 0
        if self.yellow_left > 0:
            self.yellow_left -= 1
            self.t_in_phase = 0
        else:
            can_switch = self.t_in_phase >= self.min_green
            if self.pending_switch and can_switch:
                self.phase = 1 - self.phase
                self.yellow_left = self.yellow_dur
                self.t_in_phase = 0
                self.pending_switch = False
                switched = 1
                self.switches += 1
            elif action == 1 and can_switch:
                self.phase = 1 - self.phase
                self.yellow_left = self.yellow_dur
                self.t_in_phase = 0
                self.pending_switch = False
                switched = 1
                self.switches += 1
            else:
                if action == 1 and not can_switch:
                    self.pending_switch = True
                if self.phase == 0:
                    s = min(self.veh_throughput, self.q_ns)
                    self.q_ns -= s
                    served += s
                else:
                    s = min(self.veh_throughput, self.q_ew)
                    self.q_ew -= s
                    served += s
                self.t_in_phase += 1
        queue_sum = self.q_ns + self.q_ew
        queue_max = max(self.q_ns, self.q_ew)
        cost = 1.0 * queue_sum + 0.1 * queue_max + 0.5 * switched
        reward = -float(cost)
        self.total_reward += reward
        self.total_served_v += served
        self.t += 1
        if self.t >= self.episode_len:
            self.truncated = True
        obs = self._obs()
        info = {"t": self.t, "q_ns": self.q_ns, "q_ew": self.q_ew, "phase": self.phase, "served_v": served, "switches": self.switches}
        return obs, reward, self.terminated, self.truncated, info
