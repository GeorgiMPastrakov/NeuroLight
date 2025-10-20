import unittest
import numpy as np
from envs.traffic_env import TrafficEnv

class TestEnvBasic(unittest.TestCase):
    def test_reset_and_spaces(self):
        env = TrafficEnv(seed=0)
        obs, info = env.reset()
        self.assertEqual(obs.shape, (5,))
        self.assertTrue(np.all(obs >= 0.0) and np.all(obs <= 1.0))
    def test_min_green_and_yellow(self):
        env = TrafficEnv(seed=0, min_green=5, yellow=3)
        obs, info = env.reset()
        initial_phase = info["phase"]
        self.assertIn(initial_phase, [0, 1])
        for _ in range(5):
            obs, r, d, tr, info = env.step(0)
            self.assertEqual(info["phase"], initial_phase)
        obs, r, d, tr, info = env.step(1)
        expected_phase = 1 - initial_phase
        self.assertEqual(info["phase"], expected_phase)
        for _ in range(3):
            obs, r, d, tr, info = env.step(0)
        self.assertEqual(env.yellow_left, 0)
    def test_yellow_blocks_service(self):
        env = TrafficEnv(seed=0, min_green=1, yellow=2)
        obs, info = env.reset()
        env.q_ns = 10
        obs, r, d, tr, info = env.step(1)
        q_before = env.q_ns
        obs, r, d, tr, info = env.step(0)
        self.assertEqual(env.q_ns, q_before)

if __name__ == '__main__':
    unittest.main()
