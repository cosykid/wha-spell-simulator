#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from wha_multitask import (
    GlyphManifestDataset,
    GlyphResNet18MultiHead,
    batch_to_device,
    glyph_collate_batch,
    glyph_multitask_loss,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Train the WHA glyph class + pose model.")
    parser.add_argument("dataset_root", help="Raster dataset root from wha-ds-imageifier.py")
    parser.add_argument("--epochs", type=int, default=20)
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
    return parser.parse_args()


def choose_device(explicit):
    if explicit:
        return torch.device(explicit)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def make_loader(dataset_root, split, batch_size, num_workers, shuffle):
    dataset = GlyphManifestDataset(dataset_root, split=split)
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=num_workers,
        collate_fn=glyph_collate_batch,
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


def main():
    args = parse_args()
    dataset_root = Path(args.dataset_root)
    class_to_idx = json.loads((dataset_root / "class_to_idx.json").read_text())
    device = choose_device(args.device)

    train_loader = make_loader(dataset_root, "train", args.batch_size, args.num_workers, True)
    val_loader = make_loader(dataset_root, "validation", args.batch_size, args.num_workers, False)

    model = GlyphResNet18MultiHead(
        num_classes=len(class_to_idx),
        pretrained=not args.no_pretrained,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    checkpoint_dir = Path(args.checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    best_val = float("inf")

    print(f"device={device} classes={len(class_to_idx)} train={len(train_loader.dataset)} validation={len(val_loader.dataset)}")

    for epoch in range(1, args.epochs + 1):
        train_metrics = run_epoch(model, train_loader, optimizer, device, args, train=True)
        val_metrics = run_epoch(model, val_loader, optimizer, device, args, train=False)

        print(
            f"epoch {epoch:03d} "
            f"train loss={train_metrics['loss']:.4f} acc={train_metrics['accuracy']:.3f} "
            f"val loss={val_metrics['loss']:.4f} acc={val_metrics['accuracy']:.3f} "
            f"pose(angle/scale/center)="
            f"{val_metrics['angle']:.4f}/{val_metrics['scale']:.4f}/{val_metrics['center']:.4f}"
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


if __name__ == "__main__":
    main()
