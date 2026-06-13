#!/usr/bin/env python
import argparse
import json
import math
import os
import random
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean, stdev

import psycopg
from psycopg.rows import dict_row
from tqdm import tqdm

TARGET_SIZE = 1.0
MIN_AREA = 5
REFERENCE_SIZE_FALLBACK = 240


def load_dotenv():
    """Load a tiny .env subset without adding another runtime dependency."""
    candidates = [Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env"]
    for path in candidates:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def json_value(value):
    if isinstance(value, str):
        return json.loads(value)
    return value


def iso_value(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def stroke_bounds(strokes):
    points = [pt for stroke in strokes for pt in stroke]
    if not points:
        return None

    min_x = min(pt["x"] for pt in points)
    min_y = min(pt["y"] for pt in points)
    max_x = max(pt["x"] for pt in points)
    max_y = max(pt["y"] for pt in points)
    width = max_x - min_x
    height = max_y - min_y
    scale = max(width, height)

    return {
        "min_x": min_x,
        "min_y": min_y,
        "max_x": max_x,
        "max_y": max_y,
        "width": width,
        "height": height,
        "scale": scale,
    }


def normalise_strokes(strokes, bounds):
    scale = bounds["scale"]
    normed = []
    for stroke in strokes:
        new_stroke = []
        for pt in stroke:
            nx = (pt["x"] - bounds["min_x"]) / scale * TARGET_SIZE if scale else 0.0
            ny = (pt["y"] - bounds["min_y"]) / scale * TARGET_SIZE if scale else 0.0
            new_stroke.append({"t": pt["t"], "x": nx, "y": ny})
        normed.append(new_stroke)
    return normed


def pose_from_overlay(label, meta, bounds):
    scale = bounds["scale"]
    if not scale:
        return None

    reference_size = float(meta.get("referenceSize") or REFERENCE_SIZE_FALLBACK)
    center_x = (float(label["translate_x"]) - bounds["min_x"]) / scale
    center_y = (float(label["translate_y"]) - bounds["min_y"]) / scale
    angle = float(label["angle"])

    return {
        "center_x": center_x,
        "center_y": center_y,
        "scale_x": float(label["scale_x"]) * reference_size / scale,
        "scale_y": float(label["scale_y"]) * reference_size / scale,
        "angle": angle,
        "angle_sin": math.sin(angle),
        "angle_cos": math.cos(angle),
    }


def simplify_stroke(points, min_area):
    if len(points) < 3:
        return points

    points = list(points)

    while True:
        smallest_area = float("inf")
        smallest_i = 1

        for i in range(1, len(points) - 1):
            area = triangle_area(points[i - 1], points[i], points[i + 1])
            if area < smallest_area:
                smallest_area = area
                smallest_i = i

        if smallest_area >= min_area or len(points) <= 3:
            break

        points.pop(smallest_i)

    return points


def triangle_area(a, b, c):
    return abs(
        (
            a["x"] * (b["y"] - c["y"])
            + b["x"] * (c["y"] - a["y"])
            + c["x"] * (a["y"] - b["y"])
        )
        / 2
    )


def simplify_strokes(strokes, min_area):
    return [simplify_stroke(s, min_area) for s in strokes]


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Export WHA labelled_samples directly from Postgres/Neon into pose-aware "
            "stroke JSONL for ML training."
        )
    )
    parser.add_argument("-o", "--output", required=True, help="Output JSONL file")
    parser.add_argument(
        "--out-validation",
        default=None,
        help="Validation JSONL file. Enables a stratified train/validation split.",
    )
    parser.add_argument(
        "--validation-split",
        type=float,
        default=0.2,
        help="Fraction per sign to reserve for validation when --out-validation is set.",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for stratified splitting.")
    parser.add_argument(
        "--database-url",
        default=None,
        help="Postgres connection string. Defaults to DATABASE_URL or NEON_DATABASE_URL.",
    )
    parser.add_argument(
        "--review-status",
        choices=["approved", "rejected", "pending", "all"],
        default="approved",
        help="Which reviewed samples to export. Defaults to approved.",
    )
    parser.add_argument(
        "--sign-id",
        action="append",
        default=[],
        help="Limit export to a sign id. Repeat for multiple signs.",
    )
    parser.add_argument("--limit", type=int, default=None, help="Optional maximum row count.")
    parser.add_argument(
        "--min-area",
        type=float,
        default=MIN_AREA,
        help="Visvalingam triangle-area threshold for stroke simplification.",
    )
    return parser.parse_args()


def database_url(explicit):
    load_dotenv()
    url = explicit or os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
    if not url:
        raise SystemExit("Set DATABASE_URL/NEON_DATABASE_URL or pass --database-url.")
    return url


def fetch_rows(args):
    clauses = []
    params = {}

    if args.review_status == "pending":
        clauses.append("review_status is null")
    elif args.review_status != "all":
        clauses.append("review_status = %(review_status)s")
        params["review_status"] = args.review_status

    if args.sign_id:
        clauses.append("sign_id = any(%(sign_ids)s)")
        params["sign_ids"] = args.sign_id

    where = f"where {' and '.join(clauses)}" if clauses else ""
    limit = "limit %(limit)s" if args.limit is not None else ""
    if args.limit is not None:
        params["limit"] = args.limit

    query = f"""
        select id, data_hash, sign_id, data, label, meta, captured_at, review_status
        from labelled_samples
        {where}
        order by sign_id asc, captured_at asc, id asc
        {limit}
    """

    with psycopg.connect(database_url(args.database_url), row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()


def convert_row(row, min_area):
    data = json_value(row["data"])
    label = json_value(row["label"])
    meta = json_value(row["meta"])

    count_before = sum(len(s) for s in data)
    simplified = simplify_strokes(data, min_area)
    count_after = sum(len(s) for s in simplified)
    bounds = stroke_bounds(simplified)
    if bounds is None:
        return None, count_before, count_after

    normalised = normalise_strokes(simplified, bounds)
    pose = pose_from_overlay(label, meta, bounds)

    return (
        {
            "id": row["data_hash"],
            "sample_id": row["id"],
            "sign": row["sign_id"],
            "data": normalised,
            "pose": pose,
            "normalisation": bounds,
            "source": {
                "captured_at": iso_value(row["captured_at"]),
                "review_status": row["review_status"],
                "canvas_width": meta.get("canvasWidth"),
                "canvas_height": meta.get("canvasHeight"),
                "device_pixel_ratio": meta.get("devicePixelRatio"),
                "reference_size": meta.get("referenceSize") or REFERENCE_SIZE_FALLBACK,
            },
        },
        count_before,
        count_after,
    )


def stratified_split(records, val_frac, seed):
    by_class = defaultdict(list)
    for record in records:
        by_class[record["sign"]].append(record)

    rng = random.Random(seed)
    train = []
    val = []
    for _, cls_records in sorted(by_class.items()):
        cls_records = list(cls_records)
        rng.shuffle(cls_records)
        n = len(cls_records)
        if n == 1:
            train.extend(cls_records)
            continue
        val_count = max(1, round(n * val_frac))
        val_count = min(val_count, n - 1)
        val.extend(cls_records[:val_count])
        train.extend(cls_records[val_count:])

    rng.shuffle(train)
    rng.shuffle(val)
    return train, val


def write_jsonl(path, records):
    with open(path, "w") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    args = parse_args()

    if args.out_validation and not 0 < args.validation_split < 1:
        raise SystemExit("--validation-split must be between 0 and 1 when --out-validation is set.")

    rows = fetch_rows(args)
    records = []
    points_before = []
    points_after = []
    skipped_empty = 0

    for row in tqdm(rows, desc="Exporting"):
        record, count_before, count_after = convert_row(row, args.min_area)
        points_before.append(count_before)
        points_after.append(count_after)
        if record is None:
            skipped_empty += 1
            continue
        records.append(record)

    if args.out_validation:
        train, val = stratified_split(records, args.validation_split, args.seed)
        write_jsonl(args.output, train)
        write_jsonl(args.out_validation, val)
    else:
        write_jsonl(args.output, records)
        train = records
        val = []

    diffs = [b - a for b, a in zip(points_before, points_after)]
    pcts = [(b - a) / b * 100 for b, a in zip(points_before, points_after) if b]

    def stat(values, default=0.0):
        return mean(values) if values else default

    def sd(values):
        return stdev(values) if len(values) > 1 else 0.0

    print(
        f"handled {len(rows)} rows, exported {len(records)}, skipped {skipped_empty} empty",
        file=sys.stderr,
    )
    if args.out_validation:
        print(f"split {len(train)} train + {len(val)} validation", file=sys.stderr)
    print(
        f"avg points per sample: {stat(points_before):.1f}pts ±{sd(points_before):.1f}pts "
        f"→ {stat(points_after):.1f}pts ±{sd(points_after):.1f}pts",
        file=sys.stderr,
    )
    print(
        f"avg removed: {stat(diffs):.1f}pts ±{sd(diffs):.1f}pts "
        f"({stat(pcts):.1f}% ±{sd(pcts):.1f}%)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
