#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import torch

from wha_multitask import GlyphResNet18MultiHead


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
    return parser.parse_args()


def main():
    args = parse_args()
    checkpoint = torch.load(args.checkpoint, map_location="cpu")
    class_to_idx = checkpoint["class_to_idx"]

    model = GlyphResNet18MultiHead(
        num_classes=len(class_to_idx),
        pretrained=False,
    )
    model.load_state_dict(checkpoint["model_state"])
    model.eval()

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    class_map_output = Path(args.class_map_output)
    class_map_output.parent.mkdir(parents=True, exist_ok=True)
    class_map_output.write_text(json.dumps(class_to_idx, indent=2) + "\n")

    dummy = torch.zeros(1, 1, 224, 224, dtype=torch.float32)
    wrapper = OnnxGlyphWrapper(model).eval()
    torch.onnx.export(
        wrapper,
        dummy,
        output,
        input_names=["image"],
        output_names=["class_logits", "angle", "scale", "center"],
        dynamic_axes={
            "image": {0: "batch"},
            "class_logits": {0: "batch"},
            "angle": {0: "batch"},
            "scale": {0: "batch"},
            "center": {0: "batch"},
        },
        opset_version=args.opset,
    )

    # Keep a copy beside the checkpoint as well, for non-browser experiments.
    checkpoint_sidecar = Path(args.checkpoint).with_suffix(".class_to_idx.json")
    if checkpoint_sidecar != class_map_output:
        shutil.copyfile(class_map_output, checkpoint_sidecar)

    print(f"exported {output}")
    print(f"wrote {class_map_output}")


if __name__ == "__main__":
    main()
