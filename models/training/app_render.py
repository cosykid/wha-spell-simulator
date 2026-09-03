"""
@file Rasterize strokes the way the browser does at inference time.

`src/lib/parser/ml/rendering.ts` is the source of truth: a candidate is reframed
from its own bounds into a 0.2-margin box, drawn on a 2x supersampled canvas with
a 2px pen, and box-averaged down to the model's 96px input. Test-time
augmentation rotates the ink first and reframes from the rotated bounds.

This matters because it is NOT the same as the dataset rasterizer. The dataset
draws a 2px pen at 224px and only then resizes to 96, so its ink lands roughly a
quarter as wide as the ink the deployed model actually receives. Measuring a model
here is measuring what users get.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

# Mirrors config.recognition.ml in src/lib/config.ts. The browser draws a
# `strokeWidth * renderScale` pen on a `inputSize * renderScale` canvas and box-
# averages it down, so the ink lands STROKE_WIDTH pixels wide at INPUT_SIZE.
INPUT_SIZE = 96
MARGIN = 0.2
STROKE_WIDTH = 2

# Canvas2D antialiases stroke edges and PIL does not, so we draw much larger and
# box-average back down. 4x lands within a rounding error of 8x while staying
# cheap; the ink width is scaled with it so the result stays STROKE_WIDTH wide.
SUPERSAMPLE = 4

# POSE_TTA_ROTATIONS_DEG in src/lib/parser/ml/predictions.ts.
TTA_ROTATIONS_DEG = (0, 45, 90, 135, 180, 225, 270, 315)


def stroke_points(strokes) -> list[np.ndarray]:
    """A sample's `data` field as a list of [n,2] float arrays."""
    out = []
    for stroke in strokes:
        if not stroke:
            continue
        out.append(np.array([[point["x"], point["y"]] for point in stroke], dtype=np.float64))
    return out


def rotate_about_bounds_center(points: list[np.ndarray], degrees: float) -> list[np.ndarray]:
    """Turn the ink about its own bounding-box center, as `rotatedRenderable` does."""
    if not degrees or not points:
        return points
    stacked = np.concatenate(points)
    center = np.array(
        [
            stacked[:, 0].min() + (stacked[:, 0].max() - stacked[:, 0].min()) / 2,
            stacked[:, 1].min() + (stacked[:, 1].max() - stacked[:, 1].min()) / 2,
        ]
    )
    radians = math.radians(degrees)
    cos, sin = math.cos(radians), math.sin(radians)
    turned = []
    for stroke in points:
        delta = stroke - center
        turned.append(
            center
            + np.stack([delta[:, 0] * cos - delta[:, 1] * sin, delta[:, 0] * sin + delta[:, 1] * cos], axis=1)
        )
    return turned


def render(
    points: list[np.ndarray],
    size: int = INPUT_SIZE,
    stroke_width: float = STROKE_WIDTH,
    frame_scale: float = 1.0,
    frame_offset: tuple[float, float] = (0.0, 0.0),
) -> np.ndarray:
    """Reframe from the ink's bounds and draw it into a [size,size] float32 tensor.

    `frame_scale` and `frame_offset` loosen that reframing, which is how a real
    candidate behaves when its bounds caught a little stray ink. They are 1 and
    (0, 0) for a faithful render.
    """
    canvas = size * SUPERSAMPLE
    margin_px = canvas * MARGIN / 2
    usable = canvas - margin_px * 2
    pen = max(1, int(round(stroke_width * SUPERSAMPLE)))

    image = Image.new("L", (canvas, canvas), 0)
    draw = ImageDraw.Draw(image)
    if points:
        stacked = np.concatenate(points)
        min_xy = stacked.min(axis=0)
        scale = max(float((stacked.max(axis=0) - min_xy).max()), 1e-9) * frame_scale
        min_xy = min_xy - np.asarray(frame_offset) * scale
        for stroke in points:
            projected = margin_px + (stroke - min_xy) / scale * (usable - 1)
            if len(projected) == 1:
                x, y = projected[0]
                draw.ellipse([x - pen, y - pen, x + pen, y + pen], fill=255)
                continue
            draw.line(
                [coordinate for point in projected for coordinate in point], fill=255, width=pen
            )
            # Canvas2D strokes with round caps and joins; PIL's line has neither,
            # so the vertices get their own dots to keep corners from notching.
            radius = pen / 2
            for x, y in projected:
                draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=255)

    pixels = np.asarray(image, dtype=np.float32).reshape(size, SUPERSAMPLE, size, SUPERSAMPLE)
    return (pixels.mean(axis=(1, 3)) / 255.0 - 0.5) / 0.5


def render_tta(
    strokes, size: int = INPUT_SIZE, stroke_width: float = STROKE_WIDTH
) -> np.ndarray:
    """[8,size,size] float32: one render per test-time-augmentation rotation."""
    points = stroke_points(strokes)
    return np.stack(
        [
            render(rotate_about_bounds_center(points, deg), size, stroke_width)
            for deg in TTA_ROTATIONS_DEG
        ]
    )
