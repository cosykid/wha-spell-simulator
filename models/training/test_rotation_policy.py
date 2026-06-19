"""Standalone checks for rotation augmentation math and policy loading.

Pure-stdlib so it runs without the PyTorch training venv:

    python3 models/training/test_rotation_policy.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from rotation_policy import (
    ClassRotationPolicy,
    RotationAugmentConfig,
    load_rotation_policy,
    rotate_pose_targets,
)

DICTIONARY_DIR = Path(__file__).resolve().parents[2] / "src" / "lib" / "dictionary"


def approx(a: float, b: float, tol: float = 1e-9) -> bool:
    return abs(a - b) <= tol


def test_full_turn_is_identity() -> None:
    sin0, cos0, cx0, cy0 = math.sin(0.42), math.cos(0.42), 0.7, 0.2
    sin1, cos1, cx1, cy1 = rotate_pose_targets(360.0, sin0, cos0, cx0, cy0)
    assert approx(sin0, sin1, 1e-6), (sin0, sin1)
    assert approx(cos0, cos1, 1e-6), (cos0, cos1)
    assert approx(cx0, cx1, 1e-6), (cx0, cx1)
    assert approx(cy0, cy1, 1e-6), (cy0, cy1)


def test_round_trip_cancels() -> None:
    sin0, cos0, cx0, cy0 = math.sin(0.4), math.cos(0.4), 0.62, 0.81
    s, c, x, y = rotate_pose_targets(37.0, sin0, cos0, cx0, cy0)
    s, c, x, y = rotate_pose_targets(-37.0, s, c, x, y)
    assert approx(s, sin0, 1e-9)
    assert approx(c, cos0, 1e-9)
    assert approx(x, cx0, 1e-9)
    assert approx(y, cy0, 1e-9)


def test_ccw_90_moves_top_to_left() -> None:
    # A point at top-center should land at left-center under a CCW 90 rotation,
    # matching PIL's Image.rotate(90) on an upright glyph.
    _, _, cx, cy = rotate_pose_targets(90.0, 0.0, 1.0, 0.5, 0.1)
    assert approx(cx, 0.1, 1e-9), cx
    assert approx(cy, 0.5, 1e-9), cy


def test_angle_accumulates() -> None:
    # PIL's Image.rotate(90) turns the glyph CCW, but the label angle is
    # clockwise-positive (canvas DOMMatrix), so an upright glyph (angle 0) should
    # report angle -90 degrees, not +90.
    sin1, cos1, _, _ = rotate_pose_targets(90.0, 0.0, 1.0, 0.5, 0.5)
    assert approx(math.degrees(math.atan2(sin1, cos1)), -90.0, 1e-6)


def test_policy_reads_dictionary() -> None:
    policy = load_rotation_policy(DICTIONARY_DIR)
    # Sigils and signs are now flagged rotation-invariant, so both train on the
    # full rotation range.
    assert "aeroform" in policy, sorted(policy)[:5]
    assert policy["aeroform"].rotation_invariant is True
    assert policy["aeroform"].allowed_deg is None
    assert "column" in policy
    assert policy["column"].rotation_invariant is True


def test_sample_ranges() -> None:
    rng = random.Random(0)
    cfg = RotationAugmentConfig(invariant_max_deg=180.0, jitter_deg=12.0, allowed_jitter_deg=8.0)

    invariant = ClassRotationPolicy(rotation_invariant=True)
    jitter = ClassRotationPolicy(rotation_invariant=False)
    allowed = ClassRotationPolicy(allowed_deg=(0.0, 90.0, 180.0, 270.0))

    for _ in range(2000):
        assert -180.0 <= cfg.sample_degrees(invariant, rng) <= 180.0
        assert -12.0 <= cfg.sample_degrees(jitter, rng) <= 12.0
        a = cfg.sample_degrees(allowed, rng)
        assert min(abs(a - base) for base in (0.0, 90.0, 180.0, 270.0)) <= 8.0 + 1e-9

    disabled = RotationAugmentConfig(enabled=False)
    assert disabled.sample_degrees(invariant, rng) == 0.0


def main() -> None:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
        print(f"ok  {test.__name__}")
    print(f"\n{len(tests)} passed")


if __name__ == "__main__":
    main()
