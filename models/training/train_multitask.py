#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import math
import time
from functools import partial
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from rotation_policy import (
    RotationAugmentConfig,
    load_rotation_policy,
    summarize_policy,
)
from wha_multitask import (
    GlyphManifestDataset,
    GlyphResNet18MultiHead,
    batch_to_device,
    default_image_transform,
    glyph_collate_batch,
    glyph_multitask_loss,
)

# models/training/train_multitask.py -> repo root is two parents up.
DEFAULT_DICTIONARY_DIR = Path(__file__).resolve().parents[2] / "src" / "lib" / "dictionary"


def parse_args():
    parser = argparse.ArgumentParser(description="Train the WHA glyph class + pose model.")
    parser.add_argument("dataset_root", help="Raster dataset root from wha-ds-imageifier.py")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument(
        "--image-size",
        type=int,
        default=96,
        help="Square input edge the rasters are resized to before training.",
    )
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--checkpoint-dir", default="checkpoints")
    parser.add_argument("--device", default=None, help="Defaults to cuda, mps, then cpu")
    parser.add_argument("--no-pretrained", action="store_true")
    parser.add_argument("--class-weight", type=float, default=1.0)
    parser.add_argument("--angle-weight", type=float, default=0.25)
    parser.add_argument("--scale-weight", type=float, default=0.25)
    parser.add_argument("--center-weight", type=float, default=0.25)
    parser.add_argument(
        "--no-rotation-aug",
        action="store_true",
        help="Disable training-time rotation augmentation.",
    )
    parser.add_argument(
        "--rot-invariant-deg",
        type=float,
        default=180.0,
        help="Max +/- rotation for rotation-invariant classes. 180 spans the full circle.",
    )
    parser.add_argument(
        "--rot-jitter-deg",
        type=float,
        default=12.0,
        help="Max +/- rotation for orientation-bearing classes (signs and unmarked sigils).",
    )
    parser.add_argument(
        "--rot-allowed-jitter-deg",
        type=float,
        default=8.0,
        help="Wobble applied around each allowedRotationsDeg orientation.",
    )
    parser.add_argument(
        "--dictionary-dir",
        default=str(DEFAULT_DICTIONARY_DIR),
        help="Glyph dictionary dir used to read per-class rotation rules.",
    )
    parser.add_argument("--aug-seed", type=int, default=42)
    return parser.parse_args()


def format_duration(seconds: float) -> str:
    """Compact human-readable duration, e.g. '8.4s', '1m32s', '1h05m'."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes, secs = divmod(int(round(seconds)), 60)
    if minutes < 60:
        return f"{minutes}m{secs:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h{minutes:02d}m"


def choose_device(explicit):
    if explicit:
        return torch.device(explicit)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _reseed_worker(worker_id: int, seed: int) -> None:
    """Give each DataLoader worker its own augmentation RNG stream."""
    info = torch.utils.data.get_worker_info()
    if info is not None:
        info.dataset.reseed(seed + worker_id + 1)


def make_loader(
    dataset_root,
    split,
    batch_size,
    num_workers,
    shuffle,
    image_size=96,
    augment=False,
    rotation_policy=None,
    rotation_aug=None,
    seed=42,
):
    dataset = GlyphManifestDataset(
        dataset_root,
        split=split,
        transform=default_image_transform(image_size),
        augment=augment,
        rotation_policy=rotation_policy,
        rotation_aug=rotation_aug,
        seed=seed,
    )

    # A module-level partial (not a closure) so DataLoader can pickle it to
    # spawned workers on macOS; each worker still gets its own RNG stream. The
    # main-process (num_workers=0) path keeps the dataset seed.
    reseed = partial(_reseed_worker, seed=seed) if augment and num_workers > 0 else None
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=num_workers,
        collate_fn=glyph_collate_batch,
        worker_init_fn=reseed,
    )


def run_epoch(model, loader, optimizer, device, args, train):
    model.train(train)
    totals = {"loss": 0.0, "class": 0.0, "angle": 0.0, "scale": 0.0, "center": 0.0}
    correct = 0
    seen = 0

    for batch in loader:
        images, targets = batch_to_device(batch, device)

        with torch.set_grad_enabled(train):
            outputs = model(images)
            loss, parts = glyph_multitask_loss(
                outputs,
                targets,
                class_weight=args.class_weight,
                angle_weight=args.angle_weight,
                scale_weight=args.scale_weight,
                center_weight=args.center_weight,
            )

            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        batch_size = images.shape[0]
        seen += batch_size
        totals["loss"] += float(loss.detach()) * batch_size
        for key in ("class", "angle", "scale", "center"):
            totals[key] += float(parts[key]) * batch_size
        correct += int((outputs["class_logits"].argmax(dim=1) == targets.class_index).sum())

    return {key: value / seen for key, value in totals.items()} | {"accuracy": correct / seen}


@torch.no_grad()
def angle_bias_by_class(model, loader, device, class_to_idx):
    """Per-class angle prediction error on the (un-augmented) validation set.

    `bias` is the mean signed error (pred - true), `abs` the mean absolute error,
    both circular degrees. `R` is the error resultant length (0..1): a high R
    means the per-sample errors cluster, so a nonzero `bias` is a real
    orientation miscalibration (e.g. the historical `rotate_pose_targets` sign
    bug). A low R means the errors are spread around the circle because the glyph
    has no recoverable absolute orientation -- a rotationally symmetric sigil
    like `crystal` looks identical at many angles -- so its `bias` is meaningless
    noise. A class is only flagged when it has both a large bias AND a tight
    error distribution, so symmetric glyphs stop tripping the alarm.
    """
    model.eval()
    idx_to_class = {index: name for name, index in class_to_idx.items()}
    sum_signed: dict[int, float] = {}
    sum_abs: dict[int, float] = {}
    sum_cos: dict[int, float] = {}
    sum_sin: dict[int, float] = {}
    counts: dict[int, int] = {}

    def wrap_deg(value: torch.Tensor) -> torch.Tensor:
        return (value + 180.0) % 360.0 - 180.0

    for batch in loader:
        images, targets = batch_to_device(batch, device)
        outputs = model(images)
        pred = torch.atan2(outputs["angle"][:, 0], outputs["angle"][:, 1])
        true = torch.atan2(targets.angle[:, 0], targets.angle[:, 1])
        err = wrap_deg(torch.rad2deg(pred - true))
        err_rad = torch.deg2rad(err)
        for cls, e, c, s in zip(
            targets.class_index.tolist(),
            err.tolist(),
            torch.cos(err_rad).tolist(),
            torch.sin(err_rad).tolist(),
        ):
            sum_signed[cls] = sum_signed.get(cls, 0.0) + e
            sum_abs[cls] = sum_abs.get(cls, 0.0) + abs(e)
            sum_cos[cls] = sum_cos.get(cls, 0.0) + c
            sum_sin[cls] = sum_sin.get(cls, 0.0) + s
            counts[cls] = counts.get(cls, 0) + 1

    # Below this resultant the error distribution is too diffuse for `bias` to
    # mean anything, so we do not flag the class regardless of its bias.
    flag_min_resultant = 0.6
    rows = [
        (
            idx_to_class.get(cls, f"class:{cls}"),
            sum_signed[cls] / n,
            sum_abs[cls] / n,
            math.hypot(sum_cos[cls] / n, sum_sin[cls] / n),
            n,
        )
        for cls, n in counts.items()
    ]
    rows.sort(key=lambda row: abs(row[1]), reverse=True)
    print("per-class angle error (deg), worst bias first:")
    print(f"  {'class':16} {'bias':>8} {'abs':>7} {'R':>6} {'n':>5}")
    for name, bias, abs_err, resultant, n in rows:
        flagged = abs(bias) > 20.0 and resultant >= flag_min_resultant
        flag = "  <-- miscalibrated" if flagged else ""
        print(f"  {name:16} {bias:8.1f} {abs_err:7.1f} {resultant:6.2f} {n:5d}{flag}")


def main():
    args = parse_args()
    dataset_root = Path(args.dataset_root)
    class_to_idx = json.loads((dataset_root / "class_to_idx.json").read_text())
    device = choose_device(args.device)

    rotation_aug = RotationAugmentConfig(
        enabled=not args.no_rotation_aug,
        invariant_max_deg=args.rot_invariant_deg,
        jitter_deg=args.rot_jitter_deg,
        allowed_jitter_deg=args.rot_allowed_jitter_deg,
    )
    rotation_policy = load_rotation_policy(args.dictionary_dir)
    if rotation_aug.enabled:
        buckets = summarize_policy(rotation_policy, list(class_to_idx))
        print(
            f"rotation aug: invariant(+/-{rotation_aug.invariant_max_deg:g})={buckets['invariant']} "
            f"jitter(+/-{rotation_aug.jitter_deg:g})={buckets['jitter']} "
            f"allowed={buckets['allowed']} unknown={buckets['unknown']}"
        )
    else:
        print("rotation aug: disabled")

    train_loader = make_loader(
        dataset_root,
        "train",
        args.batch_size,
        args.num_workers,
        True,
        image_size=args.image_size,
        augment=rotation_aug.enabled,
        rotation_policy=rotation_policy,
        rotation_aug=rotation_aug,
        seed=args.aug_seed,
    )
    val_loader = make_loader(
        dataset_root,
        "validation",
        args.batch_size,
        args.num_workers,
        False,
        image_size=args.image_size,
    )

    model = GlyphResNet18MultiHead(
        num_classes=len(class_to_idx),
        pretrained=not args.no_pretrained,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    checkpoint_dir = Path(args.checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    best_val = float("inf")

    print(
        f"device={device} image_size={args.image_size} classes={len(class_to_idx)} "
        f"train={len(train_loader.dataset)} validation={len(val_loader.dataset)}"
    )

    training_started = time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        epoch_started = time.perf_counter()
        train_metrics = run_epoch(model, train_loader, optimizer, device, args, train=True)
        val_metrics = run_epoch(model, val_loader, optimizer, device, args, train=False)
        epoch_seconds = time.perf_counter() - epoch_started
        elapsed_seconds = time.perf_counter() - training_started

        print(
            f"epoch {epoch:03d} "
            f"train loss={train_metrics['loss']:.4f} acc={train_metrics['accuracy']:.3f} "
            f"val loss={val_metrics['loss']:.4f} acc={val_metrics['accuracy']:.3f} "
            f"pose(angle/scale/center)="
            f"{val_metrics['angle']:.4f}/{val_metrics['scale']:.4f}/{val_metrics['center']:.4f} "
            f"time={format_duration(epoch_seconds)} total={format_duration(elapsed_seconds)}"
        )

        latest = checkpoint_dir / "latest.pt"
        payload = {
            "epoch": epoch,
            "model_state": model.state_dict(),
            "optimizer_state": optimizer.state_dict(),
            "class_to_idx": class_to_idx,
            "args": vars(args),
            "val_metrics": val_metrics,
        }
        torch.save(payload, latest)

        if val_metrics["loss"] < best_val:
            best_val = val_metrics["loss"]
            torch.save(payload, checkpoint_dir / "best.pt")

    angle_bias_by_class(model, val_loader, device, class_to_idx)


if __name__ == "__main__":
    main()
