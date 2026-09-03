#!/usr/bin/env python
"""
@file Distill the ResNet18 glyph teacher into the small student.

The teacher's soft outputs carry far more per-sample signal than a one-hot label:
they say which of the other 25 glyphs a drawing nearly is. Training on them lets a
model 26x smaller land in the same place. Two guards keep that honest:

- the KL term is masked off wherever the teacher's own argmax is wrong, so the
  student is never taught a mistake the hard label already contradicts;
- the pose heads are distilled from the teacher on every render but also fitted
  to the real labelled pose on the untouched ones, where the label still holds.

Selection runs on the frozen validation split, scored the way the browser scores:
eight rotated renders averaged into one probability vector. The test split is
never read here.

usage:
  distill_student.py --pool POOL_DIR --teacher CHECKPOINT --out CHECKPOINT_DIR
"""
from __future__ import annotations

import argparse
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from distill_pool import Pool, batches_per_epoch, epoch_batches, normalized_images
from glyph_eval import build_eval_set, softmax
from glyph_student import STUDENT_WIDTHS, GlyphStudent, parameter_count
from wha_multitask import GlyphResNet18MultiHead

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FROZEN = REPO_ROOT / ".artifacts/glyph-frozen"

# `resnet18` retrains the teacher architecture on the augmented pool. That is how
# a teacher stops being fragile on browser-width ink before it teaches a student.
MODEL_SIZES = sorted(STUDENT_WIDTHS) + ["resnet18"]


def build_model(size: str, num_classes: int, dropout: float):
    if size == "resnet18":
        return GlyphResNet18MultiHead(num_classes=num_classes, pretrained=False, dropout=dropout)
    return GlyphStudent(num_classes=num_classes, widths=STUDENT_WIDTHS[size], dropout=dropout)


def parse_args():
    parser = argparse.ArgumentParser(description="Distill the glyph teacher into a student.")
    parser.add_argument("--pool", required=True, help="Pool directory from distill_data.py.")
    parser.add_argument("--out", required=True, help="Checkpoint directory.")
    parser.add_argument("--size", default="small", choices=MODEL_SIZES)
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--weight-decay", type=float, default=5e-4)
    parser.add_argument("--warmup-epochs", type=int, default=2)
    parser.add_argument("--temperature", type=float, default=4.0, help="Distillation temperature.")
    parser.add_argument("--alpha", type=float, default=0.7, help="Weight on the teacher's KL term.")
    parser.add_argument("--pose-weight", type=float, default=0.25)
    parser.add_argument("--label-pose-weight", type=float, default=0.5)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--frozen", default=str(DEFAULT_FROZEN))
    parser.add_argument("--device", default=None)
    parser.add_argument("--eval-batch", type=int, default=512)
    parser.add_argument("--resume", default=None, help="Checkpoint to continue training from.")
    return parser.parse_args()


def choose_device(explicit: str | None) -> torch.device:
    if explicit:
        return torch.device(explicit)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def distillation_loss(outputs, batch, args):
    """Hard-label cross entropy, masked teacher KL, and the two pose fits."""
    logits = outputs["class_logits"]
    cross_entropy = F.cross_entropy(logits, batch["labels"])

    temperature = args.temperature
    student_log = F.log_softmax(logits / temperature, dim=1)
    teacher_prob = F.softmax(batch["teacher_logits"] / temperature, dim=1)
    per_row = F.kl_div(student_log, teacher_prob, reduction="none").sum(dim=1)
    mask = batch["teacher_correct"]
    trusted = mask.sum()
    kl = (per_row * mask).sum() / trusted.clamp(min=1) * (temperature**2)
    alpha = args.alpha * (trusted > 0)

    # The pose target rows are laid out as the heads are: angle, scale, center.
    # Angle is a unit vector so it takes MSE; the other two keep the teacher's
    # smooth L1, matching `glyph_multitask_loss`.
    def pose_loss(rows):
        target = batch["teacher_pose"] if rows is None else batch["pose"][rows]
        angle, scale, center = (
            (outputs["angle"], outputs["scale"], outputs["center"])
            if rows is None
            else (outputs["angle"][rows], outputs["scale"][rows], outputs["center"][rows])
        )
        return (
            F.mse_loss(angle.contiguous(), target[:, 0:2].contiguous())
            + F.smooth_l1_loss(scale.contiguous(), target[:, 2:4].contiguous())
            + F.smooth_l1_loss(center.contiguous(), target[:, 4:6].contiguous())
        )

    teacher_pose = pose_loss(None)
    valid = batch["pose_valid"]
    label_pose = pose_loss(valid) if valid.any() else torch.zeros((), device=logits.device)

    total = (
        (1 - alpha) * cross_entropy
        + alpha * kl
        + args.pose_weight * teacher_pose
        + args.label_pose_weight * label_pose
    )
    return total, {
        "ce": float(cross_entropy.detach()),
        "kl": float(kl.detach()),
        "pose": float(teacher_pose.detach()),
        "label_pose": float(label_pose.detach()),
    }


def learning_rate_at(step: int, steps_per_epoch: int, args) -> float:
    """Linear warmup into a cosine decay, on the step clock."""
    warmup = args.warmup_epochs * steps_per_epoch
    total = args.epochs * steps_per_epoch
    if step < warmup:
        return args.lr * (step + 1) / max(warmup, 1)
    progress = (step - warmup) / max(total - warmup, 1)
    return args.lr * 0.5 * (1 + math.cos(math.pi * min(progress, 1.0)))


@torch.no_grad()
def predict_numpy(model, images: np.ndarray, device, batch: int) -> dict[str, np.ndarray]:
    model.eval()
    collected: dict[str, list] = {}
    for start in range(0, len(images), batch):
        chunk = torch.from_numpy(images[start : start + batch]).to(device)
        for key, value in model(chunk).items():
            collected.setdefault(key, []).append(value.float().cpu().numpy())
    return {key: np.concatenate(value) for key, value in collected.items()}


def app_probabilities(model, evalset, device, batch: int) -> np.ndarray:
    """Mean softmax over the eight rotated renders, as `aggregateProbs` computes it."""
    total = None
    planes = 0
    for plane in evalset.app_planes:
        probabilities = softmax(predict_numpy(model, plane, device, batch)["class_logits"])
        total = probabilities if total is None else total + probabilities
        planes += 1
    return total / planes


def main():
    args = parse_args()
    pool = Pool(Path(args.pool))
    device = choose_device(args.device)
    class_to_idx = pool.meta["class_to_idx"]

    evalset = build_eval_set(Path(args.frozen), "validation")
    print(
        f"pool {len(pool)} renders (teacher correct on {pool.teacher_correct.mean():.2%}), "
        f"validation {len(evalset.labels)} rows, device {device}"
    )

    model = build_model(args.size, len(class_to_idx), args.dropout).to(device)
    if args.resume:
        model.load_state_dict(torch.load(args.resume, map_location="cpu")["model_state"])
    print(f"student '{args.size}' {parameter_count(model):,} parameters")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    steps_per_epoch = batches_per_epoch(len(pool), args.batch_size)
    best_app_top1 = -1.0
    generator = np.random.default_rng(7)
    started = time.perf_counter()

    for epoch in range(1, args.epochs + 1):
        model.train()
        totals = {"ce": 0.0, "kl": 0.0, "pose": 0.0, "label_pose": 0.0}
        seen = 0
        correct = 0
        epoch_started = time.perf_counter()

        for step, (index, pixels) in enumerate(epoch_batches(pool, args.batch_size, generator)):
            batch = {
                "labels": torch.from_numpy(pool.labels[index]).to(device),
                "teacher_logits": torch.from_numpy(pool.teacher_logits[index]).to(device),
                "teacher_pose": torch.from_numpy(pool.teacher_pose[index]).to(device),
                "pose": torch.from_numpy(pool.pose[index]).to(device),
                "pose_valid": torch.from_numpy(pool.pose_valid[index]).to(device),
                "teacher_correct": torch.from_numpy(
                    pool.teacher_correct[index].astype(np.float32)
                ).to(device),
            }
            images = normalized_images(pixels).to(device)

            rate = learning_rate_at((epoch - 1) * steps_per_epoch + step, steps_per_epoch, args)
            for group in optimizer.param_groups:
                group["lr"] = rate

            outputs = model(images)
            loss, parts = distillation_loss(outputs, batch, args)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            seen += len(index)
            correct += int((outputs["class_logits"].argmax(dim=1) == batch["labels"]).sum())
            for key, value in parts.items():
                totals[key] += value * len(index)

        dataset_predicted = predict_numpy(
            model, evalset.dataset_images, device, args.eval_batch
        )["class_logits"].argmax(axis=1)
        dataset_top1 = float((dataset_predicted == evalset.labels).mean())
        app_probs = app_probabilities(model, evalset, device, args.eval_batch)
        app_top1 = float((app_probs.argmax(axis=1) == evalset.labels).mean())

        print(
            f"epoch {epoch:03d} lr={rate:.2e} train acc={correct / seen:.4f} "
            f"ce={totals['ce'] / seen:.4f} kl={totals['kl'] / seen:.4f} "
            f"pose={totals['pose'] / seen:.4f} "
            f"val dataset={dataset_top1:.4f} app-tta={app_top1:.4f} "
            f"time={time.perf_counter() - epoch_started:.0f}s "
            f"total={(time.perf_counter() - started) / 60:.1f}m",
            flush=True,
        )

        payload = {
            "epoch": epoch,
            "model_state": model.state_dict(),
            "class_to_idx": class_to_idx,
            "args": vars(args),
            "widths": STUDENT_WIDTHS.get(args.size),
            "val": {"dataset_top1": dataset_top1, "app_top1": app_top1},
        }
        torch.save(payload, out_dir / "latest.pt")
        if app_top1 > best_app_top1:
            best_app_top1 = app_top1
            torch.save(payload, out_dir / "best.pt")

    print(f"best validation app-tta top-1 {best_app_top1:.4%} -> {out_dir / 'best.pt'}")


if __name__ == "__main__":
    main()
