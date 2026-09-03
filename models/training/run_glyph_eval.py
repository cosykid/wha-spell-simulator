#!/usr/bin/env python
"""
@file Score one or more ONNX glyph recognizers on a frozen split and print the
comparison table used to decide whether a model may ship.

The first model given is the reference every later model is compared against, so
put the currently deployed graph first.

usage:
  run_glyph_eval.py --frozen .artifacts/glyph-frozen --split test \\
      deployed=static/models/glyph-recognizer.onnx candidate=build/student.onnx
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

from glyph_eval import build_eval_set, evaluate, format_report

REPO_ROOT = Path(__file__).resolve().parents[2]


def parse_args():
    parser = argparse.ArgumentParser(description="Compare ONNX glyph recognizers.")
    parser.add_argument("models", nargs="+", help="name=path.onnx entries, reference first.")
    parser.add_argument("--frozen", default=str(REPO_ROOT / ".artifacts/glyph-frozen"))
    parser.add_argument("--split", default="test")
    parser.add_argument("--batch", type=int, default=128)
    parser.add_argument("--json-out", default=None)
    parser.add_argument(
        "--per-class",
        action="store_true",
        help="Print every class, not just the five weakest. 26 classes hide a lot.",
    )
    return parser.parse_args()


def per_class_table(results: dict[str, dict]) -> str:
    """One row per glyph, one column per model, on the app-faithful renders."""
    names = list(results)
    classes = sorted(next(iter(results.values()))["per_class_app"])
    header = f"{'class':18}" + "".join(f"{name[:16]:>18}" for name in names)
    lines = [header, "-" * len(header)]
    for glyph in classes:
        row = f"{glyph:18}"
        for name in names:
            row += f"{results[name]['per_class_app'][glyph]:>18.3f}"
        lines.append(row)
    return "\n".join(lines)


def onnx_predictor(model_path: str, batch: int):
    options = ort.SessionOptions()
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(model_path, options, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    names = [output.name for output in session.get_outputs()]

    def predict(images: np.ndarray) -> dict[str, np.ndarray]:
        collected: dict[str, list] = {name: [] for name in names}
        for start in range(0, len(images), batch):
            outputs = session.run(None, {input_name: images[start : start + batch]})
            for name, value in zip(names, outputs):
                collected[name].append(value)
        return {name: np.concatenate(values) for name, values in collected.items()}

    return predict


def main():
    args = parse_args()
    frozen = Path(args.frozen)
    evalset = build_eval_set(frozen, args.split)
    print(f"{args.split}: {len(evalset.labels)} rows, {len(evalset.class_to_idx)} classes\n")

    reference = None
    summary = {}
    results = {}
    for entry in args.models:
        name, _, path = entry.partition("=")
        if not path:
            name, path = Path(entry).stem, entry
        size = Path(path).stat().st_size
        sidecar = Path(path + ".data")
        if sidecar.exists():
            size += sidecar.stat().st_size
        result = evaluate(onnx_predictor(path, args.batch), evalset, reference)
        print(format_report(f"{name}  ({size / 1_048_576:.2f} MB on disk)", result))
        print()
        summary[name] = {
            key: value
            for key, value in result.items()
            if not isinstance(value, np.ndarray)
        } | {"bytes": size}
        results[name] = result
        if reference is None:
            reference = result

    if args.per_class:
        print(per_class_table(results))
        print()

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
