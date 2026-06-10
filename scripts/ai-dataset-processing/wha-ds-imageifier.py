#!/usr/bin/env python
import argparse
import json
import os
import random
import sys
from collections import defaultdict

from PIL import Image, ImageDraw
from tqdm import tqdm


def sanitise_id(sample_id):
    safe = sample_id.replace("/", "_").replace("\\", "_")
    if safe != sample_id:
        print(f"warning: sanitised sample_id '{sample_id}' → '{safe}'", file=sys.stderr)
    return safe


def dirname_for_sign(sign):
    return sign.replace("/", "_").replace("\\", "_")


def check_collisions(samples):
    seen = {}
    for sign, _, _ in samples:
        mapped = dirname_for_sign(sign)
        if mapped in seen and seen[mapped] != sign:
            print(
                f"error: signs '{seen[mapped]}' and '{sign}' both map to '{mapped}'",
                file=sys.stderr,
            )
            sys.exit(1)
        seen[mapped] = sign


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Render WHA stroke JSONL into labelled image directories compatible with "
            "tf.keras.utils.image_dataset_from_directory."
        )
    )
    parser.add_argument("input", nargs="?", default="-", help="JSONL file (default: stdin)")
    parser.add_argument("-o", "--output", required=True, help="Output root directory")
    parser.add_argument("--size", type=int, default=224, help="Image size in pixels (default: 224)")
    parser.add_argument("--stroke-width", type=int, default=2, help="Stroke line width (default: 2)")
    parser.add_argument("--validation-split", type=float, default=0,
                        help="Fraction per class for validation set (default: 0 = no split)")
    parser.add_argument("--coord-range", type=float, default=1.0,
                        help="Coordinate range of input data (default: 1.0 for [0,1] normalized data)")
    parser.add_argument("--margin", type=float, default=0.2,
                        help="Blank margin fraction around strokes (default: 0.2)")
    return parser.parse_args()


def load_samples(infile):
    samples = []
    for line in infile:
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        samples.append((d["sign"], d["id"], d["data"]))
    return samples


def stratified_split(samples, val_frac):
    by_class = defaultdict(list)
    for s in samples:
        by_class[s[0]].append(s)

    train = []
    val = []
    for cls, cls_samples in by_class.items():
        random.shuffle(cls_samples)
        n = len(cls_samples)
        if n == 1:
            train.extend(cls_samples)
            continue
        split = int(n * (1 - val_frac))
        if split == 0 or split == n:
            split = n - 1
        train.extend(cls_samples[:split])
        val.extend(cls_samples[split:])

    random.shuffle(train)
    random.shuffle(val)
    return train, val


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

    return img.resize((size, size), Image.LANCZOS)


def save_samples(samples, root_dir, size, stroke_width, coord_range, margin, desc):
    created = set()
    seen_ids = defaultdict(set)
    for sign, sample_id, strokes in tqdm(samples, desc=desc):
        safe_id = sanitise_id(sample_id)
        cls_dir = os.path.join(root_dir, dirname_for_sign(sign))
        if cls_dir not in created:
            os.makedirs(cls_dir, exist_ok=True)
            created.add(cls_dir)

        if safe_id in seen_ids[sign]:
            print(f"warning: duplicate {sign}/{safe_id}, skipping", file=sys.stderr)
            continue
        seen_ids[sign].add(safe_id)

        img = render_strokes(strokes, size, stroke_width, coord_range, margin)
        img.save(os.path.join(cls_dir, f"{safe_id}.jpg"), optimize=True, quality=80)


def main():
    args = parse_args()

    if not 0 <= args.validation_split < 1:
        print("error: --validation-split must be in [0, 1)", file=sys.stderr)
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
        train, val = stratified_split(samples, args.validation_split)
        root_train = os.path.join(args.output, "train")
        root_val = os.path.join(args.output, "validation")
        os.makedirs(root_train, exist_ok=True)
        os.makedirs(root_val, exist_ok=True)
        save_samples(train, root_train, args.size, args.stroke_width, args.coord_range, args.margin, "train")
        save_samples(val, root_val, args.size, args.stroke_width, args.coord_range, args.margin, "validation")
        print(f"saved {len(train)} train + {len(val)} validation images to {args.output}/", file=sys.stderr)
    else:
        os.makedirs(args.output, exist_ok=True)
        save_samples(samples, args.output, args.size, args.stroke_width, args.coord_range, args.margin, "images")
        print(f"saved {len(samples)} images to {args.output}/", file=sys.stderr)


if __name__ == "__main__":
    main()
