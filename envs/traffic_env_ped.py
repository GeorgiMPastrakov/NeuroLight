import numpy as np
import gymnasium as gym
from gymnasium import spaces

class TrafficEnvPed(gym.Env):
    metadata = {"render_modes": []}
    def __init__(self, seed=0, max_queue=20, lambda_ns=0.7, lambda_ew=0.7, veh_throughput=2, min_green=8, yellow=3, episode_len=1500, lambda_p_ns=0.2, lambda_p_ew=0.2, ped_throughput=3, min_walk=7, clearance=3):
        self.max_queue = max_queue
        self.lambda_ns = lambda_ns
        self.lambda_ew = lambda_ew
        self.veh_throughput = veh_throughput
        self.min_green = min_green
        self.yellow_dur = yellow
        self.episode_len = episode_len
        self.lambda_p_ns = lambda_p_ns
        self.lambda_p_ew = lambda_p_ew
        self.ped_throughput = ped_throughput
        self.min_walk = min_walk
        self.clearance = clearance
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(8,), dtype=np.float32)
        self.action_space = spaces.Discrete(3)
        self.rng = np.random.default_rng(seed)
        self.reset(seed=seed)
    def seed(self, seed=None):
        self.rng = np.random.default_rng(seed)
    def _obs(self):
        qns = min(self.q_ns, self.max_queue)
        qew = min(self.q_ew, self.max_queue)
        pns = min(self.p_ns, self.max_queue)
        pew = min(self.p_ew, self.max_queue)
        onehot = [1.0 if self.phase == i else 0.0 for i in range(3)]
        if self.phase == 2:
            tbase = max(1, self.min_walk)
        else:
            tbase = max(1, self.min_green)
        tnorm = min(self.t_in_phase / tbase, 1.0)
        return np.array([qns / self.max_queue, qew / self.max_queue, pns / self.max_queue, pew / self.max_queue, onehot[0], onehot[1], onehot[2], tnorm], dtype=np.float32)
    def reset(self, seed=None, options=None):
        if seed is not None:
            self.seed(seed)
        self.q_ns = 0
        self.q_ew = 0
        self.p_ns = 0
        self.p_ew = 0
        self.phase = 0
        self.prev_veh_phase = 0
        self.t_in_phase = 0
        self.yellow_left = 0
        self.ped_walk_left = 0
        self.ped_clear_left = 0
        self.t = 0
        self.terminated = False
        self.truncated = False
        self.switches = 0
        self.total_reward = 0.0
        self.total_served_v = 0
        self.total_served_p = 0
        obs = self._obs()
        info = {"t": self.t, "q_ns": self.q_ns, "q_ew": self.q_ew, "p_ns": self.p_ns, "p_ew": self.p_ew, "phase": self.phase, "served_v": 0, "served_p": 0, "switches": self.switches}
        return obs, info
    def step(self, action):
        if self.terminated or self.truncated:
            return self._obs(), 0.0, self.terminated, self.truncated, {}
        self.q_ns += self.rng.poisson(self.lambda_ns)
        self.q_ew += self.rng.poisson(self.lambda_ew)
        self.p_ns += self.rng.poisson(self.lambda_p_ns)
        self.p_ew += self.rng.poisson(self.lambda_p_ew)
        served_v = 0
        served_p = 0
        switched = 0
        if self.yellow_left > 0:
            self.yellow_left -= 1
            self.t_in_phase = 0
        elif self.ped_clear_left > 0:
            self.ped_clear_left -= 1
            if self.ped_clear_left == 0:
                self.phase = self.prev_veh_phase
                self.t_in_phase = 0
        elif self.phase == 2 and self.ped_walk_left > 0:
            s_ns = min(self.ped_throughput // 2 if self.ped_throughput > 1 else self.ped_throughput, self.p_ns)
            s_ew = min(self.ped_throughput - s_ns, self.p_ew)
            self.p_ns -= s_ns
            self.p_ew -= s_ew
            served_p += s_ns + s_ew
            self.ped_walk_left -= 1
            self.t_in_phase += 1
            if self.ped_walk_left == 0:
                self.ped_clear_left = self.clearance
        else:
            if action == 2 and (self.p_ns > 0 or self.p_ew > 0) and self.t_in_phase >= self.min_green and self.phase in [0,1]:
                self.prev_veh_phase = self.phase
                self.phase = 2
                self.ped_walk_left = self.min_walk
                self.t_in_phase = 0
                switched = 1
                self.switches += 1
            elif action == 1 and self.phase in [0,1] and self.t_in_phase >= self.min_green:
                self.phase = 1 - self.phase
                self.yellow_left = self.yellow_dur
                self.t_in_phase = 0
                switched = 1
                self.switches += 1
            else:
                if self.phase == 0:
                    s = min(self.veh_throughput, self.q_ns)
                    self.q_ns -= s
                    served_v += s
                elif self.phase == 1:
                    s = min(self.veh_throughput, self.q_ew)
                    self.q_ew -= s
                    served_v += s
                self.t_in_phase += 1
        cost = 0.5 * (self.q_ns + self.q_ew) + 0.3 * max(self.q_ns, self.q_ew) + 0.5 * (self.p_ns + self.p_ew) + 0.05 * switched
        reward = -float(cost)
        self.total_reward += reward
        self.total_served_v += served_v
        self.total_served_p += served_p
        self.t += 1
        if self.t >= self.episode_len:
            self.truncated = True
        obs = self._obs()
        info = {"t": self.t, "q_ns": self.q_ns, "q_ew": self.q_ew, "p_ns": self.p_ns, "p_ew": self.p_ew, "phase": self.phase, "served_v": served_v, "served_p": served_p, "switches": self.switches}
        return obs, reward, self.terminated, self.truncated, info
