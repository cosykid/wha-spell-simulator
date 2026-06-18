#!/usr/bin/env python
import argparse
import csv
import json
import math
import os
import random
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw
from tqdm import tqdm

RESAMPLE_LANCZOS = getattr(Image, "Resampling", Image).LANCZOS


def sanitise_id(sample_id):
    safe = sample_id.replace("/", "_").replace("\\", "_").replace(":", "_")
    if safe != sample_id:
        print(f"warning: sanitised sample_id '{sample_id}' -> '{safe}'", file=sys.stderr)
    return safe


def dirname_for_sign(sign):
    return sign.replace("/", "_").replace("\\", "_")


def check_collisions(samples):
    seen = {}
    for sample in samples:
        mapped = dirname_for_sign(sample["sign"])
        if mapped in seen and seen[mapped] != sample["sign"]:
            print(
                f"error: signs '{seen[mapped]}' and '{sample['sign']}' both map to '{mapped}'",
                file=sys.stderr,
            )
            sys.exit(1)
        seen[mapped] = sample["sign"]


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Render WHA pose-aware stroke JSONL into a PyTorch-friendly raster dataset "
            "with manifest files."
        )
    )
    parser.add_argument("input", nargs="?", default="-", help="JSONL file (default: stdin)")
    parser.add_argument("-o", "--output", required=True, help="Output root directory")
    parser.add_argument("--size", type=int, default=224, help="Image size in pixels")
    parser.add_argument("--stroke-width", type=int, default=2, help="Stroke line width")
    parser.add_argument(
        "--validation-split",
        type=float,
        default=0,
        help="Fraction per class for validation set. Use 0 when input is already split.",
    )
    parser.add_argument(
        "--test-split",
        type=float,
        default=0,
        help="Fraction per class for test set. 0 disables it. Requires --validation-split > 0.",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for splitting")
    parser.add_argument(
        "--split-name",
        default="train",
        help="Split name to use when --validation-split is 0. Defaults to train.",
    )
    parser.add_argument(
        "--coord-range",
        type=float,
        default=1.0,
        help="Coordinate range of input data. Defaults to 1.0 for normalized data.",
    )
    parser.add_argument(
        "--margin",
        type=float,
        default=0.2,
        help="Blank margin fraction around strokes. Default 0.2 means 10%% per side.",
    )
    parser.add_argument(
        "--format",
        choices=["png", "jpg"],
        default="png",
        help="Raster format. PNG is the default because these are sparse line drawings.",
    )
    return parser.parse_args()


def load_samples(infile):
    samples = []
    for line in infile:
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        samples.append(d)
    return samples


def stratified_split(samples, val_frac, test_frac, seed):
    by_class = defaultdict(list)
    for sample in samples:
        by_class[sample["sign"]].append(sample)

    rng = random.Random(seed)
    train = []
    val = []
    test = []
    for _, cls_samples in sorted(by_class.items()):
        cls_samples = list(cls_samples)
        rng.shuffle(cls_samples)
        n = len(cls_samples)
        if n == 1:
            train.extend(cls_samples)
            continue

        if test_frac > 0:
            test_count = max(1, round(n * test_frac))
            test_count = min(test_count, n - 2)
        else:
            test_count = 0

        val_count = max(1, round(n * val_frac))
        val_count = min(val_count, n - test_count - 1)

        test.extend(cls_samples[:test_count])
        val.extend(cls_samples[test_count:test_count + val_count])
        train.extend(cls_samples[test_count + val_count:])

    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    result = {"train": train, "validation": val}
    if test_frac > 0:
        result["test"] = test
    return result


def render_strokes(strokes, size, stroke_width, coord_range, margin):
    scale = 2
    canvas_size = size * scale
    margin_px = int(canvas_size * margin / 2)
    usable = canvas_size - 2 * margin_px

    img = Image.new("L", (canvas_size, canvas_size), 0)
    draw = ImageDraw.Draw(img)

    for stroke in strokes:
        if len(stroke) < 2:
            if len(stroke) == 1:
                px = int(margin_px + stroke[0]["x"] / coord_range * (usable - 1))
                py = int(margin_px + stroke[0]["y"] / coord_range * (usable - 1))
                draw.ellipse(
                    [
                        px - stroke_width * scale,
                        py - stroke_width * scale,
                        px + stroke_width * scale,
                        py + stroke_width * scale,
                    ],
                    fill=255,
                )
            continue

        coords = []
        for pt in stroke:
            px = int(margin_px + pt["x"] / coord_range * (usable - 1))
            py = int(margin_px + pt["y"] / coord_range * (usable - 1))
            coords.extend([px, py])

        draw.line(coords, fill=255, width=stroke_width * scale)

    return img.resize((size, size), RESAMPLE_LANCZOS)


def image_pose(vector_pose, margin):
    if vector_pose is None:
        return None

    edge = margin / 2
    usable = 1 - margin
    angle = vector_pose["angle"]
    return {
        "center_x": edge + vector_pose["center_x"] * usable,
        "center_y": edge + vector_pose["center_y"] * usable,
        "scale_x": vector_pose["scale_x"] * usable,
        "scale_y": vector_pose["scale_y"] * usable,
        "angle": angle,
        "angle_sin": vector_pose.get("angle_sin", math.sin(angle)),
        "angle_cos": vector_pose.get("angle_cos", math.cos(angle)),
    }


def save_image(img, path, fmt):
    if fmt == "png":
        img.save(path, optimize=True)
    else:
        img.save(path, optimize=True, quality=90)


def manifest_row(sample, split, class_index, rel_path, pose):
    row = {
        "id": sample["id"],
        "sample_id": sample.get("sample_id"),
        "split": split,
        "sign": sample["sign"],
        "class_index": class_index,
        "image_path": rel_path,
    }
    if pose is not None:
        row.update(
            {
                "center_x": pose["center_x"],
                "center_y": pose["center_y"],
                "scale_x": pose["scale_x"],
                "scale_y": pose["scale_y"],
                "angle": pose["angle"],
                "angle_sin": pose["angle_sin"],
                "angle_cos": pose["angle_cos"],
            }
        )
    return row


def save_splits(splits, root_dir, size, stroke_width, coord_range, margin, fmt):
    root = Path(root_dir)
    root.mkdir(parents=True, exist_ok=True)

    classes = sorted({sample["sign"] for samples in splits.values() for sample in samples})
    class_to_idx = {sign: i for i, sign in enumerate(classes)}
    (root / "class_to_idx.json").write_text(json.dumps(class_to_idx, indent=2) + "\n")

    rows = []
    seen_ids = defaultdict(set)
    suffix = f".{fmt}"

    for split, samples in splits.items():
        for sample in tqdm(samples, desc=split):
            sign = sample["sign"]
            safe_id = sanitise_id(sample["id"])
            if safe_id in seen_ids[split]:
                print(f"warning: duplicate {split}/{safe_id}, skipping", file=sys.stderr)
                continue
            seen_ids[split].add(safe_id)

            rel_path = Path(split) / dirname_for_sign(sign) / f"{safe_id}{suffix}"
            out_path = root / rel_path
            out_path.parent.mkdir(parents=True, exist_ok=True)

            img = render_strokes(sample["data"], size, stroke_width, coord_range, margin)
            save_image(img, out_path, fmt)

            pose = image_pose(sample.get("pose"), margin)
            rows.append(
                manifest_row(sample, split, class_to_idx[sign], rel_path.as_posix(), pose)
            )

    write_manifests(root, rows)
    return rows


def write_manifests(root, rows):
    jsonl_path = root / "manifest.jsonl"
    with jsonl_path.open("w") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    csv_path = root / "manifest.csv"
    fieldnames = [
        "id",
        "sample_id",
        "split",
        "sign",
        "class_index",
        "image_path",
        "center_x",
        "center_y",
        "scale_x",
        "scale_y",
        "angle",
        "angle_sin",
        "angle_cos",
    ]
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    args = parse_args()

    if not 0 <= args.validation_split < 1:
        print("error: --validation-split must be in [0, 1)", file=sys.stderr)
        sys.exit(1)
    if not 0 <= args.test_split < 1:
        print("error: --test-split must be in [0, 1)", file=sys.stderr)
        sys.exit(1)
    if args.test_split > 0 and args.validation_split == 0:
        print("error: --test-split requires --validation-split > 0", file=sys.stderr)
        sys.exit(1)
    if args.test_split + args.validation_split >= 1:
        print("error: --test-split + --validation-split must be < 1", file=sys.stderr)
        sys.exit(1)

    if args.coord_range <= 0:
        print("error: --coord-range must be positive", file=sys.stderr)
        sys.exit(1)

    if not 0 <= args.margin < 1:
        print("error: --margin must be in [0, 1)", file=sys.stderr)
        sys.exit(1)

    infile = sys.stdin if args.input == "-" else open(args.input)

    try:
        samples = load_samples(infile)
    finally:
        if args.input != "-":
            infile.close()

    if not samples:
        print("error: no samples found in input", file=sys.stderr)
        sys.exit(1)

    check_collisions(samples)

    if args.validation_split > 0:
        splits = stratified_split(samples, args.validation_split, args.test_split, args.seed)
    else:
        splits = {args.split_name: samples}

    rows = save_splits(
        splits,
        args.output,
        args.size,
        args.stroke_width,
        args.coord_range,
        args.margin,
        args.format,
    )

    split_counts = " + ".join(f"{len(samples)} {name}" for name, samples in splits.items())
    print(
        f"saved {split_counts} images and {len(rows)} manifest rows to {args.output}/",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
