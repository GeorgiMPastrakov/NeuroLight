import random
import gymnasium as gym


class RandomizeParams(gym.Wrapper):

    def __init__(self, env, cfg: dict):
        super().__init__(env)
        self.cfg = cfg or {}
        self.base = {
            "lambda_ns": getattr(env, "lambda_ns", None),
            "lambda_ew": getattr(env, "lambda_ew", None),
            "lambda_p_ns": getattr(env, "lambda_p_ns", None),
            "lambda_p_ew": getattr(env, "lambda_p_ew", None),
        }

    def _scale(self, low, high):
        return random.uniform(low, high)

    def _apply_randomization(self):
        r = self.cfg
        ns_scale = self._scale(r.get("lambda_scale_min", 0.7), r.get("lambda_scale_max", 1.3))
        ew_scale = self._scale(r.get("lambda_scale_min", 0.7), r.get("lambda_scale_max", 1.3))
        p_scale_ns = self._scale(r.get("ped_scale_min", 0.7), r.get("ped_scale_max", 1.3))
        p_scale_ew = self._scale(r.get("ped_scale_min", 0.7), r.get("ped_scale_max", 1.3))
        if self.base["lambda_ns"] is not None:
            self.env.lambda_ns = float(self.base["lambda_ns"]) * ns_scale
        if self.base["lambda_ew"] is not None:
            self.env.lambda_ew = float(self.base["lambda_ew"]) * ew_scale
        if self.base["lambda_p_ns"] is not None:
            self.env.lambda_p_ns = float(self.base["lambda_p_ns"]) * p_scale_ns
        if self.base["lambda_p_ew"] is not None:
            self.env.lambda_p_ew = float(self.base["lambda_p_ew"]) * p_scale_ew

    def reset(self, *args, **kwargs):
        self._apply_randomization()
        return self.env.reset(*args, **kwargs)
