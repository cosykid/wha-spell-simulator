"""Per-class rotation augmentation policy, sourced from the glyph dictionary.

The browser model only tolerates rotation to the degree the training data happens
to contain. To make the class head rotation-robust we rotate samples during
training, but how *much* a glyph may rotate depends on the glyph:

- Rotation-invariant glyphs (``recognitionRotationInvariant: true``) mean the same
  thing at any orientation, so they may rotate through the full configured range.
- Glyphs with an ``allowedRotationsDeg`` set may only take those discrete
  orientations, so augmentation snaps to them (with a little jitter for slop).
- Everything else carries meaning in its orientation, so it only receives a small
  jitter around how it was drawn. The jitter is intentionally within the
  recognizer's existing sign tolerance, so it never flips a glyph's meaning; it
  just teaches robustness to wobbly upright drawing.

This mirrors the dictionary metadata the runtime recognizer already keys off, so
changing a glyph's ``recognitionRotationInvariant`` or ``allowedRotationsDeg``
automatically changes augmentation on the next training run.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ClassRotationPolicy:
    """How a single glyph class may be rotated during augmentation."""

    rotation_invariant: bool = False
    allowed_deg: tuple[float, ...] | None = None


# Sigils default to rotation-invariant when the field is absent (matching the
# runtime's ``recognitionRotationInvariant ?? true`` for non-signs); signs carry
# orientation as meaning, so they default to orientation-bearing.
_DEFAULT_INVARIANT_BY_KIND = {"sigils": True, "signs": False}


def load_rotation_policy(dictionary_dir: str | Path) -> dict[str, ClassRotationPolicy]:
    """Read ``recognitionRotationInvariant`` / ``allowedRotationsDeg`` per class."""

    dictionary_dir = Path(dictionary_dir)
    policy: dict[str, ClassRotationPolicy] = {}
    for kind, default_invariant in _DEFAULT_INVARIANT_BY_KIND.items():
        kind_dir = dictionary_dir / kind
        if not kind_dir.is_dir():
            continue
        for path in sorted(kind_dir.glob("*.json")):
            entry = json.loads(path.read_text())
            entry_id = entry.get("id")
            if not entry_id:
                continue
            allowed = entry.get("allowedRotationsDeg")
            policy[entry_id] = ClassRotationPolicy(
                rotation_invariant=bool(
                    entry.get("recognitionRotationInvariant", default_invariant)
                ),
                allowed_deg=tuple(float(a) for a in allowed) if allowed else None,
            )
    return policy


@dataclass(frozen=True)
class RotationAugmentConfig:
    """Tunable ranges for rotation augmentation, applied per class via the policy."""

    enabled: bool = True
    # Rotation-invariant classes are rotated uniformly in [-max, max] degrees.
    # 180 spans the full circle.
    invariant_max_deg: float = 180.0
    # Orientation-bearing classes only wobble within this many degrees.
    jitter_deg: float = 12.0
    # Wobble applied around each discrete allowed orientation.
    allowed_jitter_deg: float = 8.0

    def sample_degrees(self, policy: ClassRotationPolicy, rng: random.Random) -> float:
        """Pick a rotation (degrees, counter-clockwise) for one sample."""

        if not self.enabled:
            return 0.0
        if policy.allowed_deg:
            # Treat the allowed orientations as permissible rotation deltas; a glyph
            # valid at several orientations is class-preserving under those rotations.
            base = rng.choice(policy.allowed_deg)
            return base + rng.uniform(-self.allowed_jitter_deg, self.allowed_jitter_deg)
        if policy.rotation_invariant:
            if self.invariant_max_deg <= 0:
                return 0.0
            return rng.uniform(-self.invariant_max_deg, self.invariant_max_deg)
        if self.jitter_deg <= 0:
            return 0.0
        return rng.uniform(-self.jitter_deg, self.jitter_deg)


def rotate_pose_targets(
    deg: float,
    angle_sin: float,
    angle_cos: float,
    center_x: float,
    center_y: float,
) -> tuple[float, float, float, float]:
    """Transform pose targets to stay consistent with a PIL image rotation.

    The pose is the overlay transform (translate=center, scale, angle). ``PIL``'s
    ``Image.rotate(deg)`` turns the drawing *counter-clockwise* by ``deg``. But the
    label ``angle`` is authored via the canvas ``DOMMatrix.rotateSelf`` (see
    ``buildSample``), whose positive direction is *clockwise* in the y-down canvas.
    So a CCW image rotation is a negative change in the label's convention:

    - ``angle`` *loses* ``deg`` (CCW image turn = clockwise-positive angle goes down);
    - ``center`` orbits the image center (0.5, 0.5) the same CCW way the pixels move,
      via the image-space operator ``[[cos, sin], [-sin, cos]]`` (y points down);
    - ``scale_x`` / ``scale_y`` are unchanged because they live in the overlay's
      own (pre-rotation) frame.

    (``rotateTemplatePoint`` in the app negates its degrees, so it is CCW-positive —
    the opposite of the label here. Do not use it as the convention reference.)

    Returns ``(angle_sin, angle_cos, center_x, center_y)`` after rotation.
    """

    rad = math.radians(deg)
    cos = math.cos(rad)
    sin = math.sin(rad)

    angle = math.atan2(angle_sin, angle_cos) - rad

    dx = center_x - 0.5
    dy = center_y - 0.5
    new_center_x = 0.5 + (cos * dx + sin * dy)
    new_center_y = 0.5 + (-sin * dx + cos * dy)

    return math.sin(angle), math.cos(angle), new_center_x, new_center_y


def summarize_policy(
    policy: dict[str, ClassRotationPolicy],
    class_ids: list[str],
) -> dict[str, int]:
    """Count how the classes about to be trained fall into each rotation bucket."""

    invariant = 0
    allowed = 0
    jitter = 0
    unknown = 0
    for class_id in class_ids:
        entry = policy.get(class_id)
        if entry is None:
            unknown += 1
            jitter += 1
        elif entry.allowed_deg:
            allowed += 1
        elif entry.rotation_invariant:
            invariant += 1
        else:
            jitter += 1
    return {
        "invariant": invariant,
        "allowed": allowed,
        "jitter": jitter,
        "unknown": unknown,
    }
