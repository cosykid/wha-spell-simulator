#!/usr/bin/env python
"""
@file Export a trained WHA glyph checkpoint to a browser-ready ONNX model.

The deployed artifact is FP16-quantized for size and speed, but its inputs and
outputs stay float32 (keep_io_types) so the browser runtime can keep feeding a
float32 tensor unchanged. The model is saved with an external-data sidecar
(`<name>.onnx.data`) the SvelteKit static server ships alongside the graph.

Pipeline: load checkpoint -> FP32 ONNX -> FP16 convert -> validate parity against
the torch model on real validation images -> deploy FP16 (or fall back to FP32 if
FP16 parity is poor).
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import onnx
import torch

from wha_multitask import (
    GlyphManifestDataset,
    GlyphResNet18MultiHead,
    default_image_transform,
)

DEFAULT_IMAGE_SIZE = 96
# argmax disagreement above this fraction on clean glyphs means FP16 rounding
# changed predictions, so we keep FP32 as the deployed model instead.
FP16_PARITY_MIN_AGREEMENT = 0.98


class OnnxGlyphWrapper(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, image):
        outputs = self.model(image)
        return (
            outputs["class_logits"],
            outputs["angle"],
            outputs["scale"],
            outputs["center"],
        )


def parse_args():
    parser = argparse.ArgumentParser(description="Export a WHA glyph checkpoint to ONNX.")
    parser.add_argument("checkpoint", help="Path to best.pt/latest.pt")
    parser.add_argument("--output", required=True, help="Output ONNX file")
    parser.add_argument(
        "--class-map-output",
        required=True,
        help="Where to copy the checkpoint's class_to_idx JSON.",
    )
    parser.add_argument("--opset", type=int, default=18)
    parser.add_argument(
        "--dataset-root",
        default=None,
        help="Raster dataset root used to pull real validation images for parity. "
        "Defaults to the dataset_root saved in the checkpoint args.",
    )
    parser.add_argument(
        "--parity-samples",
        type=int,
        default=16,
        help="Number of validation images to compare FP16 vs torch argmax on.",
    )
    return parser.parse_args()


def image_size_from_checkpoint(checkpoint) -> int:
    """The size the model was trained at, persisted via vars(args)."""
    return int(checkpoint.get("args", {}).get("image_size", DEFAULT_IMAGE_SIZE))


def export_fp32(wrapper, image_size: int, output: Path, opset: int) -> None:
    # A 2-image dummy plus a dynamic batch Dim. The dynamo exporter (torch 2.12
    # default) traces the backbone's global-pool reshape, so a batch=1 dummy with
    # the legacy `dynamic_axes` bakes in a `[1, 512]` reshape that then rejects
    # any other batch size. `dynamic_shapes` keeps that reshape symbolic.
    dummy = torch.zeros(2, 1, image_size, image_size, dtype=torch.float32)
    batch = torch.export.Dim("batch")
    torch.onnx.export(
        wrapper,
        dummy,
        output,
        input_names=["image"],
        output_names=["class_logits", "angle", "scale", "center"],
        dynamic_shapes={"image": {0: batch}},
        opset_version=opset,
        dynamo=True,
        optimize=True,
    )


def convert_to_fp16(fp32_path: Path):
    """Cast weights to FP16 while keeping float32 model I/O for the browser."""
    from onnxconverter_common import float16

    model_fp32 = onnx.load(str(fp32_path))
    return float16.convert_float_to_float16(model_fp32, keep_io_types=True)


def save_with_external_data(model, output: Path) -> None:
    """Write the graph plus a single `<name>.onnx.data` weight sidecar."""
    location = output.name + ".data"
    sidecar = output.with_name(location)
    if sidecar.exists():
        sidecar.unlink()
    onnx.save(
        model,
        str(output),
        save_as_external_data=True,
        all_tensors_to_one_file=True,
        location=location,
    )
    # onnx.save writes the data sidecar with restrictive (0600) permissions;
    # normalize so the static server can serve the deployed weights.
    sidecar.chmod(0o644)


def load_parity_images(dataset_root: Path, image_size: int, count: int):
    """A handful of real validation rasters as a [n,1,H,W] float32 batch."""
    dataset = GlyphManifestDataset(
        dataset_root,
        split="validation",
        transform=default_image_transform(image_size),
    )
    n = min(count, len(dataset))
    images = torch.stack([dataset[i][0] for i in range(n)])
    return images.numpy().astype(np.float32)


def run_onnx_class_argmax(model_path: Path, images: np.ndarray) -> np.ndarray:
    """Class argmax from a single dynamic-batch onnxruntime call (CPU)."""
    import onnxruntime as ort

    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    class_logits = session.run(["class_logits"], {input_name: images})[0]
    return class_logits.argmax(axis=1)


def validate_dynamic_batch(model_path: Path, image_size: int) -> None:
    """Confirm a >=3 image batch runs in one call (exercises the dynamic axis)."""
    import onnxruntime as ort

    batch = np.zeros((3, 1, image_size, image_size), dtype=np.float32)
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    logits = session.run(["class_logits"], {input_name: batch})[0]
    assert logits.shape[0] == 3, f"dynamic batch broken: got {logits.shape}"
    print(f"dynamic batch OK: fed 3 images in one call -> class_logits {logits.shape}")


def report_parity(torch_argmax: np.ndarray, fp16_argmax: np.ndarray) -> float:
    agree = int((torch_argmax == fp16_argmax).sum())
    total = len(torch_argmax)
    fraction = agree / total if total else 1.0
    print(
        f"FP16 vs torch class-argmax parity: {agree}/{total} agree "
        f"({fraction:.1%}) on real validation glyphs"
    )
    if agree != total:
        mismatched = [
            (int(t), int(f)) for t, f in zip(torch_argmax, fp16_argmax) if t != f
        ]
        print(f"  mismatches (torch_idx -> fp16_idx): {mismatched}")
    return fraction


def main():
    args = parse_args()
    checkpoint = torch.load(args.checkpoint, map_location="cpu")
    class_to_idx = checkpoint["class_to_idx"]
    image_size = image_size_from_checkpoint(checkpoint)
    print(f"export image_size={image_size} classes={len(class_to_idx)}")

    model = GlyphResNet18MultiHead(num_classes=len(class_to_idx), pretrained=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    class_map_output = Path(args.class_map_output)
    class_map_output.parent.mkdir(parents=True, exist_ok=True)
    class_map_output.write_text(json.dumps(class_to_idx, indent=2) + "\n")

    # 1. FP32 export to a temp path (FP16-converted and deployed below).
    fp32_path = output.with_name("glyph-recognizer.fp32.onnx")
    wrapper = OnnxGlyphWrapper(model).eval()
    export_fp32(wrapper, image_size, fp32_path, args.opset)
    print(f"exported FP32 {fp32_path}")

    # 2. FP16-convert and write it as the candidate deployed artifact. onnx.save
    # rewrites a model's tensors to point at its external-data file, so we save
    # FP16 straight to `output` once and score that exact file, rather than
    # saving the same in-memory model twice (which would leave stale data refs).
    model_fp16 = convert_to_fp16(fp32_path)
    save_with_external_data(model_fp16, output)

    # 3. Parity: torch argmax vs the deployed FP16 argmax on real validation
    # rasters. A poor agreement means FP16 rounding changed predictions, so we
    # overwrite the deployment with FP32 reloaded fresh from disk.
    dataset_root = Path(
        args.dataset_root or checkpoint.get("args", {}).get("dataset_root", "")
    )
    if dataset_root and dataset_root.exists():
        images = load_parity_images(dataset_root, image_size, args.parity_samples)
        with torch.no_grad():
            torch_logits = model(torch.from_numpy(images))["class_logits"]
        torch_argmax = torch_logits.argmax(dim=1).numpy()
        fp16_argmax = run_onnx_class_argmax(output, images)
        fraction = report_parity(torch_argmax, fp16_argmax)

        if fraction >= FP16_PARITY_MIN_AGREEMENT:
            print(f"deployed FP16 model -> {output} (+ {output.name}.data)")
        else:
            print(
                f"FP16 parity {fraction:.1%} < {FP16_PARITY_MIN_AGREEMENT:.0%}; "
                "FALLING BACK to FP32 as the deployed model."
            )
            save_with_external_data(onnx.load(str(fp32_path)), output)
            print(f"deployed FP32 model -> {output} (+ {output.name}.data)")
    else:
        print(
            f"WARNING: dataset_root '{dataset_root}' missing; skipping parity check. "
            f"deployed FP16 (unverified) -> {output} (+ {output.name}.data)"
        )

    _cleanup(fp32_path)

    # 4. Validate the deployed artifact runs as a dynamic batch.
    validate_dynamic_batch(output, image_size)

    # Keep a class-map copy beside the checkpoint for non-browser experiments.
    checkpoint_sidecar = Path(args.checkpoint).with_suffix(".class_to_idx.json")
    if checkpoint_sidecar != class_map_output:
        shutil.copyfile(class_map_output, checkpoint_sidecar)

    print(f"wrote {class_map_output}")


def _cleanup(onnx_path: Path) -> None:
    onnx_path.unlink(missing_ok=True)
    sidecar = onnx_path.with_name(onnx_path.name + ".data")
    sidecar.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
