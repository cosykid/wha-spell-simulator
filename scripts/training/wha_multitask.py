from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms
from torchvision.models import ResNet18_Weights, resnet18


@dataclass(frozen=True)
class GlyphTargets:
    class_index: torch.Tensor
    angle: torch.Tensor
    scale: torch.Tensor
    center: torch.Tensor


def default_image_transform(image_size: int = 224):
    return transforms.Compose(
        [
            transforms.Grayscale(num_output_channels=1),
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5], std=[0.5]),
        ]
    )


class GlyphManifestDataset(Dataset):
    """Loads images and class/pose targets from wha-ds-imageifier.py manifests."""

    def __init__(
        self,
        dataset_root: str | Path,
        split: str = "train",
        transform: Any | None = None,
        manifest_name: str = "manifest.jsonl",
    ):
        self.dataset_root = Path(dataset_root)
        self.transform = transform or default_image_transform()
        manifest_path = self.dataset_root / manifest_name

        rows = []
        with manifest_path.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                if row["split"] == split:
                    rows.append(row)

        if not rows:
            raise ValueError(f"No rows for split '{split}' in {manifest_path}")

        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int):
        row = self.rows[index]
        image = Image.open(self.dataset_root / row["image_path"]).convert("L")
        image = self.transform(image)

        targets = GlyphTargets(
            class_index=torch.tensor(row["class_index"], dtype=torch.long),
            angle=torch.tensor([row["angle_sin"], row["angle_cos"]], dtype=torch.float32),
            scale=torch.tensor([row["scale_x"], row["scale_y"]], dtype=torch.float32),
            center=torch.tensor([row["center_x"], row["center_y"]], dtype=torch.float32),
        )

        return image, targets


class GlyphResNet18MultiHead(nn.Module):
    """
    ResNet18 backbone with separate prediction heads for glyph class and overlay pose.

    Outputs:
      class_logits: [batch, num_classes]
      angle: [batch, 2] as sin(angle), cos(angle)
      scale: [batch, 2] as normalized scale_x, scale_y
      center: [batch, 2] as normalized center_x, center_y
    """

    def __init__(self, num_classes: int, pretrained: bool = True, dropout: float = 0.2):
        super().__init__()
        weights = ResNet18_Weights.DEFAULT if pretrained else None
        backbone = resnet18(weights=weights)

        self._adapt_first_conv_to_grayscale(backbone)
        feature_dim = backbone.fc.in_features
        backbone.fc = nn.Identity()
        self.backbone = backbone

        self.class_head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(feature_dim, num_classes),
        )
        self.pose_head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(feature_dim, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, 6),
        )

    @staticmethod
    def _adapt_first_conv_to_grayscale(backbone) -> None:
        old = backbone.conv1
        new = nn.Conv2d(
            in_channels=1,
            out_channels=old.out_channels,
            kernel_size=old.kernel_size,
            stride=old.stride,
            padding=old.padding,
            bias=old.bias is not None,
        )
        with torch.no_grad():
            new.weight.copy_(old.weight.mean(dim=1, keepdim=True))
            if old.bias is not None:
                new.bias.copy_(old.bias)
        backbone.conv1 = new

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        features = self.backbone(x)
        pose = self.pose_head(features)
        angle = F.normalize(pose[:, 0:2], dim=1)

        return {
            "class_logits": self.class_head(features),
            "angle": angle,
            "scale": pose[:, 2:4].contiguous(),
            "center": pose[:, 4:6].contiguous(),
        }


def glyph_multitask_loss(
    outputs: dict[str, torch.Tensor],
    targets: GlyphTargets,
    class_weight: float = 1.0,
    angle_weight: float = 0.25,
    scale_weight: float = 0.25,
    center_weight: float = 0.25,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    class_loss = F.cross_entropy(outputs["class_logits"], targets.class_index)
    angle_loss = F.mse_loss(outputs["angle"], targets.angle)
    scale_loss = F.smooth_l1_loss(outputs["scale"], targets.scale)
    center_loss = F.smooth_l1_loss(outputs["center"], targets.center)

    total = (
        class_weight * class_loss
        + angle_weight * angle_loss
        + scale_weight * scale_loss
        + center_weight * center_loss
    )

    parts = {
        "total": total.detach(),
        "class": class_loss.detach(),
        "angle": angle_loss.detach(),
        "scale": scale_loss.detach(),
        "center": center_loss.detach(),
    }
    return total, parts


def batch_to_device(batch, device: torch.device | str):
    images, targets = batch
    return images.to(device), GlyphTargets(
        class_index=targets.class_index.to(device),
        angle=targets.angle.to(device),
        scale=targets.scale.to(device),
        center=targets.center.to(device),
    )


def glyph_collate_batch(batch):
    images, targets = zip(*batch)
    return torch.stack(images), GlyphTargets(
        class_index=torch.stack([target.class_index for target in targets]),
        angle=torch.stack([target.angle for target in targets]),
        scale=torch.stack([target.scale for target in targets]),
        center=torch.stack([target.center for target in targets]),
    )
