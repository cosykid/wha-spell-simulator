#!/usr/bin/env python
"""
@file Fit the student's output temperature on the frozen validation split.

Distillation trains a student against softened teacher targets, and a student that
learned that softness keeps predicting flatter than the teacher does. That is
invisible in top-1 and fatal here: the runtime only lets ML override the template
recognizer when it clears paired confidence and margin thresholds
(`config.recognition.ml` in src/lib/config.ts), so a flatter student quietly stops
overriding anything.

The fix is one scalar. Temperature is fitted by minimizing the negative log
likelihood of the browser's own averaged-softmax probabilities, which is a proper
scoring rule, so it cannot be gamed toward the gates. It is then folded into the
final linear layer, costing the exported graph no extra node.

usage:
  calibrate_student.py --checkpoint CHECKPOINT --out CALIBRATED.pt
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch

from distill_student import choose_device, predict_numpy
from glyph_eval import ACCEPTANCE_GATES, build_eval_set, gate_rates, softmax
from glyph_student import STUDENT_WIDTHS, GlyphStudent

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FROZEN = REPO_ROOT / ".artifacts/glyph-frozen"


def parse_args():
    parser = argparse.ArgumentParser(description="Temperature-scale a distilled student.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--frozen", default=str(DEFAULT_FROZEN))
    parser.add_argument("--split", default="validation", help="Never fit this on `test`.")
    parser.add_argument("--device", default=None)
    parser.add_argument("--batch", type=int, default=512)
    return parser.parse_args()


def averaged_probabilities(logits: np.ndarray, temperature: float) -> np.ndarray:
    """[renders, rows, classes] logits -> the browser's mean-softmax probabilities."""
    return softmax(logits / temperature).mean(axis=0)


def negative_log_likelihood(probabilities: np.ndarray, labels: np.ndarray) -> float:
    picked = probabilities[np.arange(len(labels)), labels]
    return float(-np.log(np.clip(picked, 1e-12, None)).mean())


def fit_temperature(logits: np.ndarray, labels: np.ndarray) -> float:
    """Coarse scan then a local refine; the objective is smooth and one-dimensional."""
    grid = np.geomspace(0.25, 4.0, 61)
    scores = [negative_log_likelihood(averaged_probabilities(logits, t), labels) for t in grid]
    best = float(grid[int(np.argmin(scores))])
    refine = np.linspace(best * 0.85, best * 1.18, 41)
    scores = [negative_log_likelihood(averaged_probabilities(logits, t), labels) for t in refine]
    return float(refine[int(np.argmin(scores))])


def main():
    args = parse_args()
    checkpoint = torch.load(args.checkpoint, map_location="cpu")
    widths = tuple(checkpoint.get("widths") or STUDENT_WIDTHS["small"])
    model = GlyphStudent(num_classes=len(checkpoint["class_to_idx"]), widths=widths)
    model.load_state_dict(checkpoint["model_state"])
    device = choose_device(args.device)
    model.to(device).eval()

    evalset = build_eval_set(Path(args.frozen), args.split)
    logits = np.stack(
        [
            predict_numpy(model, plane, device, args.batch)["class_logits"]
            for plane in evalset.app_planes
        ]
    )

    before = averaged_probabilities(logits, 1.0)
    temperature = fit_temperature(logits, evalset.labels)
    after = averaged_probabilities(logits, temperature)

    print(f"fitted temperature {temperature:.4f} on {args.split} ({len(evalset.labels)} rows)")
    print(
        f"  NLL {negative_log_likelihood(before, evalset.labels):.4f} -> "
        f"{negative_log_likelihood(after, evalset.labels):.4f}"
    )
    print(
        f"  top-1 {float((before.argmax(1) == evalset.labels).mean()):.4%} -> "
        f"{float((after.argmax(1) == evalset.labels).mean()):.4%} (argmax is invariant)"
    )
    before_gates, after_gates = gate_rates(before), gate_rates(after)
    for gate in ACCEPTANCE_GATES:
        print(f"  gate {gate:9} {before_gates[gate]:.3f} -> {after_gates[gate]:.3f}")

    model.apply_temperature(temperature)
    checkpoint["model_state"] = model.cpu().state_dict()
    checkpoint["temperature"] = temperature
    torch.save(checkpoint, args.out)
    print(f"wrote calibrated checkpoint -> {args.out}")


if __name__ == "__main__":
    main()
