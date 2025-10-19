import unittest
import numpy as np
from envs.traffic_env import TrafficEnv

class TestReward(unittest.TestCase):
    def test_reward_monotonicity(self):
        env = TrafficEnv(seed=0)
        obs, info = env.reset()
        env.q_ns = 0
        env.q_ew = 0
        obs, r0, d, tr, info = env.step(0)
        env.q_ns = 10
        env.q_ew = 10
        obs, r1, d, tr, info = env.step(0)
        self.assertLess(r1, r0)
    def test_best_reward_zero_queues(self):
        env = TrafficEnv(seed=0)
        obs, info = env.reset()
        env.q_ns = 0
        env.q_ew = 0
        obs, r_keep, d, tr, info = env.step(0)
        env.q_ns = 5
        env.q_ew = 0
        obs, r_more, d, tr, info = env.step(0)
        self.assertLess(r_more, r_keep)

if __name__ == '__main__':
    unittest.main()
