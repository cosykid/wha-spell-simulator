"""
@file Augment glyph samples in vector space, then rasterize them.

The labelled corpus is strokes, not pixels, so a sample can be re-drawn as many
different ways as we like: rotated, warped, drawn with a thicker pen, framed a
little off. That turns a few thousand samples into an effectively unlimited
training set, which is what a small student model needs to match a ResNet18.

Two rasterizers are in play and a sample may be drawn through either:

- `rasterize` reproduces `models/ai-dataset-processing/wha-ds-imageifier.py`
  pixel for pixel, which is the distribution the deployed model was trained on.
- `app_render.render` reproduces the browser, which is the distribution the
  deployed model is actually served. Its ink lands about 2.3x wider.

Covering both, plus the widths in between, is what stops a model from being
sharp on one and fragile on the other.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw

import app_render
from rotation_policy import ClassRotationPolicy, RotationAugmentConfig

# The dataset rasterizer's defaults. See wha-ds-imageifier.py: --size 224
# --stroke-width 2 --margin 0.2, drawn at 2x and resized down.
RASTER_SIZE = 224
RASTER_SUPERSAMPLE = 2
RASTER_MARGIN = 0.2
RASTER_STROKE_WIDTH = 2
MODEL_SIZE = 96

Stroke = list[dict]


@dataclass(frozen=True)
class ShapeAugmentConfig:
    """How far a redrawn glyph may drift from the sample it came from.

    Every range is centered on "unchanged", so the identity augmentation is a
    valid draw from this config. The magnitudes cover pointer sloppiness (a shaky
    line, a scribble that came out squat) without turning one glyph into another.

    Uniform scale and translation are deliberately absent: both rasterizers
    reframe from the ink's own bounds, so they would be normalized straight back
    out. `frame_jitter` is the augmentation that survives, standing in for a
    candidate whose bounds caught a little stray ink.
    """

    aspect_range: tuple[float, float] = (0.90, 1.11)
    shear_max: float = 0.07
    frame_jitter: float = 0.05
    # Low-frequency sinusoidal displacement, in normalized stroke units.
    warp_amplitude_max: float = 0.022
    warp_frequency_range: tuple[float, float] = (0.6, 2.2)
    # Per-point tremor, plus a slower drift shared along a stroke.
    point_jitter: float = 0.0035
    drift_jitter: float = 0.006
    # Ink width in pixels at the 96px model input. The dataset rasterizer lands
    # near 0.86 and the browser near 2.0, so the range spans both with room over.
    ink_width_range: tuple[float, float] = (0.7, 3.0)
    # How often a variant is drawn through the dataset rasterizer instead of the
    # browser one, so its LANCZOS grays stay covered too.
    dataset_render_share: float = 0.25


def _warp(points: np.ndarray, rng: random.Random, config: ShapeAugmentConfig) -> np.ndarray:
    """Bend the drawing along a smooth sine field, the way an unsteady hand does."""
    amplitude = rng.uniform(0.0, config.warp_amplitude_max)
    if amplitude <= 0:
        return points
    freq_x = rng.uniform(*config.warp_frequency_range)
    freq_y = rng.uniform(*config.warp_frequency_range)
    phase_x = rng.uniform(0, 2 * math.pi)
    phase_y = rng.uniform(0, 2 * math.pi)
    dx = amplitude * np.sin(2 * math.pi * freq_y * points[:, 1] + phase_x)
    dy = amplitude * np.sin(2 * math.pi * freq_x * points[:, 0] + phase_y)
    return points + np.stack([dx, dy], axis=1)


def _tremor(counts, generator: np.random.Generator, config: ShapeAugmentConfig) -> np.ndarray:
    """Per-point noise plus a per-stroke random walk, concatenated stroke by stroke."""
    pieces = []
    for count in counts:
        jitter = generator.normal(0.0, config.point_jitter, size=(count, 2))
        drift = generator.normal(0.0, config.drift_jitter / max(count, 1), size=(count, 2))
        pieces.append(jitter + np.cumsum(drift, axis=0))
    return np.concatenate(pieces) if pieces else np.zeros((0, 2))


def augment_points(
    points: list[np.ndarray],
    degrees: float,
    rng: random.Random,
    config: ShapeAugmentConfig,
) -> list[np.ndarray]:
    """Redraw one sample's ink with a fresh tremor, warp, squash, and rotation."""
    if not points:
        return points
    counts = [len(stroke) for stroke in points]
    flat = np.concatenate(points)

    generator = np.random.default_rng(rng.getrandbits(63))
    flat = flat + _tremor(counts, generator, config)
    flat = _warp(flat, rng, config)

    center = flat.mean(axis=0)
    aspect = rng.uniform(*config.aspect_range)
    shear = rng.uniform(-config.shear_max, config.shear_max)
    centered = flat - center
    centered = np.stack(
        [centered[:, 0] * aspect + shear * centered[:, 1], centered[:, 1] / aspect], axis=1
    )
    flat = centered + center

    out = []
    offset = 0
    for count in counts:
        out.append(flat[offset : offset + count])
        offset += count
    return app_render.rotate_about_bounds_center(out, degrees)


def rasterize(points: list[np.ndarray], stroke_width: float = RASTER_STROKE_WIDTH) -> Image.Image:
    """Draw normalized strokes into the 224px raster the dataset ships."""
    canvas = RASTER_SIZE * RASTER_SUPERSAMPLE
    margin_px = int(canvas * RASTER_MARGIN / 2)
    usable = canvas - 2 * margin_px
    pen = max(1, int(round(stroke_width * RASTER_SUPERSAMPLE)))

    image = Image.new("L", (canvas, canvas), 0)
    draw = ImageDraw.Draw(image)
    for stroke in points:
        pixels = margin_px + stroke * (usable - 1)
        if len(pixels) == 1:
            x, y = pixels[0]
            draw.ellipse([x - pen, y - pen, x + pen, y + pen], fill=255)
            continue
        if len(pixels) < 2:
            continue
        draw.line([coordinate for point in pixels for coordinate in point], fill=255, width=pen)

    return image.resize((RASTER_SIZE, RASTER_SIZE), Image.LANCZOS)


def reframe(points: list[np.ndarray], jitter: float, rng: random.Random) -> list[np.ndarray]:
    """Normalize ink into the unit box the dataset rasterizer expects, framed loosely."""
    flat = np.concatenate(points)
    min_xy = flat.min(axis=0)
    scale = max(float((flat.max(axis=0) - min_xy).max()), 1e-9)
    scale *= 1.0 + rng.uniform(-jitter, jitter)
    offset = np.array([rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter)])
    return [(stroke - min_xy) / scale + offset for stroke in points]


def to_model_pixels(image: Image.Image, size: int = MODEL_SIZE) -> np.ndarray:
    """The training transform's resize step, as the uint8 pixels we cache."""
    return np.asarray(image.resize((size, size), Image.BILINEAR), dtype=np.uint8)


def render_dataset_style(points: list[np.ndarray], ink_width: float) -> np.ndarray:
    """Draw through the dataset rasterizer, at an ink width measured at 96px."""
    # The dataset pen is specified at 224px and survives the resize to 96, so an
    # ink width quoted at 96 scales up by the ratio between the two.
    return to_model_pixels(rasterize(points, ink_width * RASTER_SIZE / MODEL_SIZE))


def render_app_style(
    points: list[np.ndarray],
    ink_width: float,
    frame_scale: float = 1.0,
    frame_offset: tuple[float, float] = (0.0, 0.0),
) -> np.ndarray:
    """Draw through the browser rasterizer, at an ink width measured at 96px."""
    tensor = app_render.render(points, MODEL_SIZE, ink_width, frame_scale, frame_offset)
    return np.clip((tensor * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def render_variant(
    points: list[np.ndarray],
    policy: ClassRotationPolicy,
    rotation: RotationAugmentConfig,
    shape: ShapeAugmentConfig,
    rng: random.Random,
    identity: bool = False,
) -> np.ndarray:
    """One 96x96 uint8 render, or the untouched dataset raster when `identity`."""
    if identity:
        return render_dataset_style(points, RASTER_STROKE_WIDTH * MODEL_SIZE / RASTER_SIZE)

    degrees = rotation.sample_degrees(policy, rng)
    drawn = augment_points(points, degrees, rng, shape)
    ink_width = rng.uniform(*shape.ink_width_range)
    jitter = shape.frame_jitter
    if rng.random() < shape.dataset_render_share:
        return render_dataset_style(reframe(drawn, jitter, rng), ink_width)
    frame_scale = 1.0 + rng.uniform(-jitter, jitter)
    frame_offset = (rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter))
    return render_app_style(drawn, ink_width, frame_scale, frame_offset)
