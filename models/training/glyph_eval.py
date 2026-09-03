"""
@file Score a glyph recognizer the way the app will use it, on a frozen split.

Top-1 alone does not decide whether a model can ship here. The runtime gates ML
against the template recognizer with paired confidence/margin thresholds (see
`config.recognition.ml` in src/lib/config.ts), so a model that ranks classes
correctly but predicts them less sharply silently loses its ability to override
the template matcher. Every metric below is reported per model so a swap can be
judged on ranking *and* on sharpness.

Two views of the same held-out rows:

- `dataset` - the upright rasters the training pipeline builds, which is the
  number the training script prints.
- `app` - eight rotated renders through `app_render`, averaged into one
  probability vector exactly as `aggregateProbs` does, which is the distribution
  the deployed model actually sees.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

from app_render import render_tta

# config.recognition.ml in src/lib/config.ts. Each gate is (confidence, margin);
# a prediction clears it only when it meets both.
ACCEPTANCE_GATES = {
    "accept": (0.74, 0.16),
    "override": (0.84, 0.18),
    "super": (0.94, 0.28),
}


def load_records(frozen_dir: Path, split: str) -> list[dict]:
    """The vector samples for one frozen split, in a stable order."""
    records = []
    with (frozen_dir / f"{split}.jsonl").open() as handle:
        for line in handle:
            if line.strip():
                records.append(json.loads(line))
    records.sort(key=lambda record: record["id"])
    return records


def load_manifest(raster_root: Path, split: str) -> dict[str, dict]:
    """Manifest rows for one split, keyed by sample id."""
    rows = {}
    with (raster_root / "manifest.jsonl").open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if row["split"] == split:
                rows[row["id"]] = row
    return rows


def normalize(pixels: np.ndarray) -> np.ndarray:
    """uint8 [.., H, W] to the model's float32 [.., 1, H, W] input range."""
    scaled = pixels.astype(np.float32) / 255.0
    return ((scaled - 0.5) / 0.5)[..., None, :, :]


@dataclass
class EvalSet:
    """One frozen split, rendered both ways, with its labels and pose targets.

    Renders are kept as uint8 and normalized a plane at a time. Holding all eight
    rotated planes as float32 costs a few hundred megabytes, which is enough to
    push a training run into swap on a 16GB machine.
    """

    labels: np.ndarray
    signs: list[str]
    class_to_idx: dict[str, int]
    dataset_pixels: np.ndarray
    app_pixels: np.ndarray
    angle: np.ndarray
    scale: np.ndarray
    center: np.ndarray
    ids: list[str] = field(default_factory=list)

    @property
    def idx_to_class(self) -> dict[int, str]:
        return {index: name for name, index in self.class_to_idx.items()}

    @property
    def dataset_images(self) -> np.ndarray:
        return normalize(self.dataset_pixels)

    @property
    def app_planes(self):
        """One normalized [N,1,H,W] plane per test-time-augmentation rotation."""
        for plane in self.app_pixels:
            yield normalize(plane)


def build_eval_set(frozen_dir: Path, split: str = "test", image_size: int = 96) -> EvalSet:
    raster_root = frozen_dir / "raster"
    class_to_idx = json.loads((raster_root / "class_to_idx.json").read_text())
    manifest = load_manifest(raster_root, split)
    records = [record for record in load_records(frozen_dir, split) if record["id"] in manifest]

    dataset_pixels = np.zeros((len(records), image_size, image_size), dtype=np.uint8)
    app_pixels = np.zeros((8, len(records), image_size, image_size), dtype=np.uint8)
    for index, record in enumerate(records):
        raster = Image.open(raster_root / manifest[record["id"]]["image_path"]).convert("L")
        dataset_pixels[index] = np.asarray(
            raster.resize((image_size, image_size), Image.BILINEAR), np.uint8
        )
        rendered = render_tta(record["data"], image_size)
        app_pixels[:, index] = np.clip((rendered * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(
            np.uint8
        )

    rows = [manifest[record["id"]] for record in records]
    return EvalSet(
        labels=np.array([row["class_index"] for row in rows], dtype=np.int64),
        signs=[row["sign"] for row in rows],
        class_to_idx=class_to_idx,
        dataset_pixels=dataset_pixels,
        app_pixels=app_pixels,
        angle=np.array([[row["angle_sin"], row["angle_cos"]] for row in rows], np.float32),
        scale=np.array([[row["scale_x"], row["scale_y"]] for row in rows], np.float32),
        center=np.array([[row["center_x"], row["center_y"]] for row in rows], np.float32),
        ids=[record["id"] for record in records],
    )


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=-1, keepdims=True)
    exponentiated = np.exp(shifted)
    return exponentiated / exponentiated.sum(axis=-1, keepdims=True)


def wrapped_degrees(value: np.ndarray) -> np.ndarray:
    return (value + 180.0) % 360.0 - 180.0


def angle_error_deg(predicted: np.ndarray, target: np.ndarray) -> np.ndarray:
    first = np.arctan2(predicted[:, 0], predicted[:, 1])
    second = np.arctan2(target[:, 0], target[:, 1])
    return wrapped_degrees(np.degrees(first - second))


def gate_rates(probabilities: np.ndarray) -> dict[str, float]:
    """Fraction of predictions clearing each (confidence, margin) acceptance gate."""
    ordered = np.sort(probabilities, axis=1)
    confidence = ordered[:, -1]
    margin = np.maximum(0.0, ordered[:, -1] - ordered[:, -2])
    return {
        name: float(((confidence >= min_confidence) & (margin >= min_margin)).mean())
        for name, (min_confidence, min_margin) in ACCEPTANCE_GATES.items()
    }


def per_class_accuracy(predicted: np.ndarray, labels: np.ndarray, idx_to_class) -> dict[str, float]:
    scores = {}
    for index in sorted(set(labels.tolist())):
        mask = labels == index
        scores[idx_to_class.get(index, f"class:{index}")] = float(
            (predicted[mask] == labels[mask]).mean()
        )
    return scores


def evaluate(predict, evalset: EvalSet, reference: dict | None = None) -> dict:
    """Score one model. `predict(images) -> {class_logits, angle, scale, center}`.

    Pass a previous result as `reference` to also get argmax agreement with it,
    which is how a replacement model is checked against the one it replaces.
    """
    dataset_outputs = predict(evalset.dataset_images)
    dataset_probabilities = softmax(dataset_outputs["class_logits"])
    dataset_predicted = dataset_probabilities.argmax(axis=1)

    app_probabilities = np.zeros_like(dataset_probabilities)
    planes = 0
    upright_app_angle = None
    for plane in evalset.app_planes:
        plane_outputs = predict(plane)
        app_probabilities += softmax(plane_outputs["class_logits"])
        # The first plane is the unrotated render, so the labelled pose still
        # describes it and the pose head can be scored on browser-width ink.
        if upright_app_angle is None:
            upright_app_angle = plane_outputs.get("angle")
        planes += 1
    app_probabilities /= planes
    app_predicted = app_probabilities.argmax(axis=1)

    result = {
        "dataset_top1": float((dataset_predicted == evalset.labels).mean()),
        "app_top1": float((app_predicted == evalset.labels).mean()),
        "dataset_gates": gate_rates(dataset_probabilities),
        "app_gates": gate_rates(app_probabilities),
        "per_class_app": per_class_accuracy(app_predicted, evalset.labels, evalset.idx_to_class),
        "per_class_dataset": per_class_accuracy(
            dataset_predicted, evalset.labels, evalset.idx_to_class
        ),
        "dataset_predicted": dataset_predicted,
        "app_predicted": app_predicted,
        "app_probabilities": app_probabilities,
    }

    if "angle" in dataset_outputs:
        error = np.abs(angle_error_deg(dataset_outputs["angle"], evalset.angle))
        result["angle_abs_median_deg"] = float(np.median(error))
        result["angle_abs_mean_deg"] = float(error.mean())
    if upright_app_angle is not None:
        app_error = np.abs(angle_error_deg(upright_app_angle, evalset.angle))
        result["app_angle_abs_median_deg"] = float(np.median(app_error))
    if "scale" in dataset_outputs:
        result["scale_mae"] = float(np.abs(dataset_outputs["scale"] - evalset.scale).mean())
    if "center" in dataset_outputs:
        result["center_mae"] = float(np.abs(dataset_outputs["center"] - evalset.center).mean())

    if reference is not None:
        result["agree_dataset"] = float(
            (dataset_predicted == reference["dataset_predicted"]).mean()
        )
        result["agree_app"] = float((app_predicted == reference["app_predicted"]).mean())
    return result


def format_report(name: str, result: dict) -> str:
    lines = [
        f"{name}",
        f"  top-1        dataset {result['dataset_top1']:.4%}   app-tta {result['app_top1']:.4%}",
        "  gate rate    "
        + "  ".join(
            f"{gate} d={result['dataset_gates'][gate]:.3f}/a={result['app_gates'][gate]:.3f}"
            for gate in ACCEPTANCE_GATES
        ),
    ]
    if "angle_abs_median_deg" in result:
        lines.append(
            f"  pose         |angle| median d={result['angle_abs_median_deg']:.2f} "
            f"a={result.get('app_angle_abs_median_deg', float('nan')):.2f} deg  "
            f"scale MAE {result.get('scale_mae', float('nan')):.4f}  "
            f"center MAE {result.get('center_mae', float('nan')):.4f}"
        )
    if "agree_app" in result:
        lines.append(
            f"  agreement    dataset {result['agree_dataset']:.4%}  app-tta {result['agree_app']:.4%}"
        )
    worst = sorted(result["per_class_app"].items(), key=lambda item: item[1])[:5]
    lines.append(
        "  worst app classes  " + "  ".join(f"{name}={score:.3f}" for name, score in worst)
    )
    return "\n".join(lines)
