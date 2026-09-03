"""
@file Read the precomputed distillation pool and deal it out in training batches.

The pool is a memmap several times larger than the page cache this machine can
spare, so how it is read decides whether the GPU is fed. `distill_data` shuffles
the pool's row order on disk; this module reads it back as a shuffled sequence of
contiguous blocks. Together they give a class-mixed stream of batches at
sequential-read speed.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch


class Pool:
    """The precomputed pool: pixels plus hard labels, teacher outputs, and poses."""

    def __init__(self, directory: Path):
        self.meta = json.loads((directory / "pool.json").read_text())
        count = self.meta["images"]
        size = self.meta["image_size"]
        self.pixels = np.memmap(
            directory / "pixels.u8", dtype=np.uint8, mode="r", shape=(count, size, size)
        )
        self.labels = np.load(directory / "labels.npy")
        self.pose = np.load(directory / "pose.npy")
        self.pose_valid = np.load(directory / "pose_valid.npy")
        self.teacher_logits = np.load(directory / "teacher_class_logits.npy")
        self.teacher_pose = np.concatenate(
            [
                np.load(directory / "teacher_angle.npy"),
                np.load(directory / "teacher_scale.npy"),
                np.load(directory / "teacher_center.npy"),
            ],
            axis=1,
        )
        # Where the teacher is already wrong its soft target is noise, so the
        # student learns those rows from the hard label alone.
        self.teacher_correct = self.teacher_logits.argmax(axis=1) == self.labels

    def __len__(self) -> int:
        return len(self.labels)


# Rows pulled in per buffer fill. Row-at-a-time random reads over a memmap this
# size turn every step into a seek and starve the GPU, so an epoch reads whole
# blocks and shuffles within them rather than permuting the whole pool.
SHUFFLE_BUFFER_ROWS = 8192


def epoch_batches(pool, batch_size: int, generator: np.random.Generator):
    """Yield (row indices, pixel block) for one epoch, one sequential read per block."""
    starts = np.arange(0, len(pool) - SHUFFLE_BUFFER_ROWS + 1, SHUFFLE_BUFFER_ROWS)
    generator.shuffle(starts)
    for start in starts:
        block = np.asarray(pool.pixels[start : start + SHUFFLE_BUFFER_ROWS])
        order = generator.permutation(SHUFFLE_BUFFER_ROWS)
        for offset in range(0, SHUFFLE_BUFFER_ROWS - batch_size + 1, batch_size):
            picks = order[offset : offset + batch_size]
            yield start + picks, block[picks]


def batches_per_epoch(total: int, batch_size: int) -> int:
    blocks = max(total // SHUFFLE_BUFFER_ROWS, 1)
    return blocks * (SHUFFLE_BUFFER_ROWS // batch_size)


def normalized_images(pixels: np.ndarray) -> torch.Tensor:
    """uint8 [N,H,W] renders to the model's float32 [N,1,H,W] input range."""
    tensor = torch.from_numpy(np.ascontiguousarray(pixels)).float().div_(255.0)
    return tensor.sub_(0.5).div_(0.5).unsqueeze(1)
