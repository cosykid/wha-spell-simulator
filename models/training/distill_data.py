#!/usr/bin/env python
"""
@file Build the augmented image pool the student distills on, plus the teacher's
soft targets for it.

Every labelled vector sample is redrawn many times (see `vector_augment`), cached
as uint8 96x96 pixels in a memmap, and scored once by the teacher. Precomputing
both is what makes a long distillation run cheap: training then reads pixels and
targets straight out of arrays instead of re-rasterizing and re-running the
teacher every epoch.

Renders are dealt out per class, not per sample, so the pool is balanced even
though the corpus is not (`convergence` has ~1.7x the rows `billowing` does).

usage:
  distill_data.py --out POOL_DIR --teacher CHECKPOINT [--per-class 16000]
"""
from __future__ import annotations

import argparse
import json
import random
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import torch

import app_render
from rotation_policy import ClassRotationPolicy, RotationAugmentConfig, load_rotation_policy
from vector_augment import MODEL_SIZE, ShapeAugmentConfig, render_variant
from wha_multitask import GlyphResNet18MultiHead

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FROZEN = REPO_ROOT / ".artifacts/glyph-frozen"
DEFAULT_DICTIONARY_DIR = REPO_ROOT / "src/lib/dictionary"
TEACHER_OUTPUT_KEYS = ("class_logits", "angle", "scale", "center")


def parse_args():
    parser = argparse.ArgumentParser(description="Build a distillation pool for the student.")
    parser.add_argument("--out", required=True, help="Directory to write the pool into.")
    parser.add_argument("--teacher", required=True, help="Teacher checkpoint (best.pt).")
    parser.add_argument("--per-class", type=int, default=16000, help="Renders per glyph class.")
    parser.add_argument("--split", default="train")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=512, help="Teacher inference batch.")
    parser.add_argument("--frozen", default=str(DEFAULT_FROZEN))
    parser.add_argument("--dictionary-dir", default=str(DEFAULT_DICTIONARY_DIR))
    parser.add_argument("--device", default=None)
    parser.add_argument(
        "--rescore-only",
        action="store_true",
        help="Keep an existing pool's pixels and only recompute the teacher targets.",
    )
    parser.add_argument(
        "--student-teacher",
        action="store_true",
        help="The teacher checkpoint holds a GlyphStudent rather than a ResNet18.",
    )
    return parser.parse_args()


def choose_device(explicit: str | None) -> torch.device:
    if explicit:
        return torch.device(explicit)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def load_samples(frozen: Path, split: str):
    """Vector samples for one frozen split, joined to their class index and pose."""
    manifest = {}
    with (frozen / "raster/manifest.jsonl").open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if row["split"] == split:
                manifest[row["id"]] = row

    samples = []
    with (frozen / f"{split}.jsonl").open() as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            row = manifest.get(record["id"])
            if row is None:
                continue
            samples.append(
                {
                    "sign": record["sign"],
                    "class_index": row["class_index"],
                    "strokes": record["data"],
                    # Image-frame pose, as wha-ds-imageifier.py wrote it. Only
                    # valid for the untouched render of the sample.
                    "pose": [
                        row["angle_sin"],
                        row["angle_cos"],
                        row["scale_x"],
                        row["scale_y"],
                        row["center_x"],
                        row["center_y"],
                    ],
                }
            )
    # Sort for determinism, then shuffle on a fixed seed. Row order matters: a
    # sample's variants land contiguously, so a class-ordered pool would make any
    # contiguous read single-class, and training reads the pool in long runs to
    # keep it off the disk.
    samples.sort(key=lambda sample: (sample["class_index"], sample["sign"]))
    random.Random(20260903).shuffle(samples)
    return samples


def variants_per_sample(samples, per_class: int) -> list[int]:
    """Deal `per_class` renders across each class's rows, so every class matches."""
    counts: dict[int, int] = {}
    for sample in samples:
        counts[sample["class_index"]] = counts.get(sample["class_index"], 0) + 1
    return [max(2, round(per_class / counts[sample["class_index"]])) for sample in samples]


_WORKER_STATE: dict = {}


def _init_worker(policy_payload: dict, rotation: RotationAugmentConfig, shape: ShapeAugmentConfig):
    _WORKER_STATE["policy"] = {
        name: ClassRotationPolicy(**values) for name, values in policy_payload.items()
    }
    _WORKER_STATE["rotation"] = rotation
    _WORKER_STATE["shape"] = shape


def _render_sample(job):
    """Render one sample's whole variant run, so a worker parses its strokes once."""
    index, sign, strokes, variants, seed = job
    rng = random.Random(seed)
    policy = _WORKER_STATE["policy"].get(sign, ClassRotationPolicy())
    points = app_render.stroke_points(strokes)
    pixels = np.zeros((variants, MODEL_SIZE, MODEL_SIZE), dtype=np.uint8)
    for variant in range(variants):
        pixels[variant] = render_variant(
            points,
            policy,
            _WORKER_STATE["rotation"],
            _WORKER_STATE["shape"],
            rng,
            # Variant 0 is the untouched dataset raster, the only render whose
            # ground-truth pose label still holds.
            identity=variant == 0,
        )
    return index, pixels


def build_pixels(samples, variants, seed: int, workers: int, dictionary_dir: str, out_dir: Path):
    policy = load_rotation_policy(dictionary_dir)
    payload = {
        name: {"rotation_invariant": value.rotation_invariant, "allowed_deg": value.allowed_deg}
        for name, value in policy.items()
    }
    rotation = RotationAugmentConfig()
    shape = ShapeAugmentConfig()

    offsets = np.cumsum([0] + list(variants))
    total = int(offsets[-1])
    pixels = np.memmap(
        out_dir / "pixels.u8", dtype=np.uint8, mode="w+", shape=(total, MODEL_SIZE, MODEL_SIZE)
    )
    jobs = [
        (index, sample["sign"], sample["strokes"], variants[index], seed * 1_000_003 + index)
        for index, sample in enumerate(samples)
    ]

    done = 0
    with ProcessPoolExecutor(
        max_workers=workers, initializer=_init_worker, initargs=(payload, rotation, shape)
    ) as pool:
        for index, rendered in pool.map(_render_sample, jobs, chunksize=4):
            pixels[offsets[index] : offsets[index + 1]] = rendered
            done += 1
            if done % 500 == 0:
                print(f"  rendered {done}/{len(samples)} samples", flush=True)
    pixels.flush()
    return pixels, offsets


@torch.no_grad()
def score_with_teacher(teacher, pixels, device, batch_size: int, num_classes: int):
    """Run the teacher over every pooled image, in the model's own normalization."""
    total = len(pixels)
    outputs = {
        "class_logits": np.zeros((total, num_classes), dtype=np.float32),
        "angle": np.zeros((total, 2), dtype=np.float32),
        "scale": np.zeros((total, 2), dtype=np.float32),
        "center": np.zeros((total, 2), dtype=np.float32),
    }
    for start in range(0, total, batch_size):
        chunk = np.asarray(pixels[start : start + batch_size], dtype=np.float32) / 255.0
        images = torch.from_numpy((chunk - 0.5) / 0.5).unsqueeze(1).to(device)
        predicted = teacher(images)
        for key in TEACHER_OUTPUT_KEYS:
            outputs[key][start : start + len(chunk)] = predicted[key].float().cpu().numpy()
        if (start // batch_size) % 100 == 0:
            print(f"  teacher {start}/{total}", flush=True)
    return outputs


def main():
    args = parse_args()
    frozen = Path(args.frozen)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.rescore_only:
        existing = json.loads((out_dir / "pool.json").read_text())
        pixels = np.memmap(
            out_dir / "pixels.u8",
            dtype=np.uint8,
            mode="r",
            shape=(existing["images"], existing["image_size"], existing["image_size"]),
        )
        labels = np.load(out_dir / "labels.npy")
        print(f"rescoring {len(pixels)} existing renders with {Path(args.teacher).name}")
    else:
        samples = load_samples(frozen, args.split)
        variants = variants_per_sample(samples, args.per_class)
        print(
            f"pool: {len(samples)} {args.split} samples, "
            f"{min(variants)}-{max(variants)} variants each, {sum(variants)} renders"
        )

        pixels, offsets = build_pixels(
            samples, variants, args.seed, args.workers, args.dictionary_dir, out_dir
        )
        labels = np.repeat(
            np.array([sample["class_index"] for sample in samples], dtype=np.int64), variants
        )
        poses = np.repeat(
            np.array([sample["pose"] for sample in samples], dtype=np.float32), variants, axis=0
        )
        # Only the untouched render of each sample keeps its labelled pose; every
        # other variant moved the ink, and the label did not move with it.
        pose_valid = np.zeros(len(labels), dtype=bool)
        pose_valid[offsets[:-1]] = True

        np.save(out_dir / "labels.npy", labels)
        np.save(out_dir / "pose.npy", poses)
        np.save(out_dir / "pose_valid.npy", pose_valid)

    checkpoint = torch.load(args.teacher, map_location="cpu")
    class_to_idx = checkpoint["class_to_idx"]
    device = choose_device(args.device)
    if args.student_teacher:
        from glyph_student import GlyphStudent

        teacher = GlyphStudent(num_classes=len(class_to_idx), widths=tuple(checkpoint["widths"]))
    else:
        teacher = GlyphResNet18MultiHead(num_classes=len(class_to_idx), pretrained=False)
    teacher.load_state_dict(checkpoint["model_state"])
    teacher.eval().to(device)

    print(f"teacher {Path(args.teacher).name} on {device}: scoring {len(pixels)} renders")
    outputs = score_with_teacher(teacher, pixels, device, args.batch_size, len(class_to_idx))
    for key, value in outputs.items():
        np.save(out_dir / f"teacher_{key}.npy", value)

    agreement = float((outputs["class_logits"].argmax(axis=1) == labels).mean())
    (out_dir / "pool.json").write_text(
        json.dumps(
            {
                "split": args.split,
                "samples": existing["samples"] if args.rescore_only else len(samples),
                "images": int(len(pixels)),
                "per_class": args.per_class,
                "seed": args.seed,
                "image_size": MODEL_SIZE,
                "class_to_idx": class_to_idx,
                "teacher_checkpoint": str(args.teacher),
                "teacher_accuracy_on_pool": agreement,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"teacher agrees with the hard label on {agreement:.2%} of the augmented pool")
    print(f"wrote pool -> {out_dir}")


if __name__ == "__main__":
    main()
