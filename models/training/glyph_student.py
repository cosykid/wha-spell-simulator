"""
@file The small glyph recognizer that replaces the ResNet18 in the browser.

ResNet18's parameters are lopsided for this job: its last two stages alone are
~10M of its 11.7M weights, sized for ImageNet texture that 96px binary line art
does not have. This backbone spends its capacity where the signal is instead, and
lands near half a megabyte at FP16.

It deliberately uses only the operators the deployed ResNet18 already proves work
on both onnxruntime-web execution providers: dense Conv, BatchNorm, ReLU,
MaxPool, GlobalAveragePool and Gemm. Nothing here is a new kernel risk.

The output contract is the ResNet18's, unchanged, because
`src/lib/parser/ml/predictions.ts` reads these four tensors by name.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

# Channel widths per stage. `small` is the shipped size; `tiny` exists to check
# how much further the architecture can be pushed before quality moves.
STUDENT_WIDTHS = {
    "small": (16, 32, 48, 96, 128),
    "tiny": (12, 24, 32, 64, 96),
    "wide": (24, 40, 64, 128, 160),
}
POSE_OUTPUTS = 6


def conv_block(in_channels: int, out_channels: int, stride: int = 1) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(in_channels, out_channels, 3, stride=stride, padding=1, bias=False),
        nn.BatchNorm2d(out_channels),
        nn.ReLU(inplace=True),
    )


class GlyphStudent(nn.Module):
    """A small VGG-shaped backbone with the ResNet18's two heads.

    Outputs:
      class_logits: [batch, num_classes]
      angle:        [batch, 2] as sin(angle), cos(angle)
      scale:        [batch, 2] as normalized scale_x, scale_y
      center:       [batch, 2] as normalized center_x, center_y
    """

    def __init__(
        self,
        num_classes: int,
        widths: tuple[int, ...] = STUDENT_WIDTHS["small"],
        pose_hidden: int = 96,
        dropout: float = 0.1,
    ):
        super().__init__()
        first, second, third, fourth, fifth = widths

        # One full-resolution layer keeps the thin ink readable before the first
        # stride, which matters here: a glyph line is barely a pixel wide at 96.
        self.backbone = nn.Sequential(
            conv_block(1, first),
            conv_block(first, second, stride=2),
            nn.MaxPool2d(2),
            conv_block(second, third),
            conv_block(third, third),
            nn.MaxPool2d(2),
            conv_block(third, fourth),
            conv_block(fourth, fourth),
            nn.MaxPool2d(2),
            conv_block(fourth, fifth),
            conv_block(fifth, fifth),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
        )
        self.class_head = nn.Sequential(nn.Dropout(dropout), nn.Linear(fifth, num_classes))
        self.pose_head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(fifth, pose_hidden),
            nn.ReLU(inplace=True),
            nn.Linear(pose_hidden, POSE_OUTPUTS),
        )

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        features = self.backbone(x)
        pose = self.pose_head(features)
        return {
            "class_logits": self.class_head(features),
            "angle": F.normalize(pose[:, 0:2], dim=1),
            "scale": pose[:, 2:4].contiguous(),
            "center": pose[:, 4:6].contiguous(),
        }

    def apply_temperature(self, temperature: float) -> None:
        """Divide the class logits by a fitted temperature, in place and for free.

        Folding the scalar into the final linear layer keeps the exported graph
        identical, so a calibrated model costs no extra node and no extra kernel.
        """
        if temperature == 1.0:
            return
        final = self.class_head[-1]
        with torch.no_grad():
            final.weight.div_(temperature)
            if final.bias is not None:
                final.bias.div_(temperature)


def parameter_count(model: nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters())
