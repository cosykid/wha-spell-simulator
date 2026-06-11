#!/usr/bin/env python
import json
import sys
import argparse
from statistics import mean, stdev

import pandas as pd
from tqdm import tqdm

TARGET_SIZE = 1.0
MIN_AREA = 5
MIN_POINTS = 3

# ███████  ██    ██  ███    ██   ██████  ████████  ██   ██████   ███    ██  ███████ 
# ██       ██    ██  ████   ██  ██          ██     ██  ██    ██  ████   ██  ██      
# █████    ██    ██  ██ ██  ██  ██          ██     ██  ██    ██  ██ ██  ██  ███████ 
# ██       ██    ██  ██  ██ ██  ██          ██     ██  ██    ██  ██  ██ ██       ██ 
# ██        ██████   ██   ████   ██████     ██     ██   ██████   ██   ████  ███████ 


def normalise_strokes(strokes):
    if not strokes or not strokes[0]:
        return strokes

    min_x = max_x = strokes[0][0]["x"]
    min_y = max_y = strokes[0][0]["y"]

    for stroke in strokes:
        for pt in stroke:
            x = pt["x"]
            y = pt["y"]
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y

    scale = max(max_x - min_x, max_y - min_y)

    normed = []
    for stroke in strokes:
        new_stroke = []
        for pt in stroke:
            nx = (pt["x"] - min_x) / scale * TARGET_SIZE if scale else 0.0
            ny = (pt["y"] - min_y) / scale * TARGET_SIZE if scale else 0.0
            new_stroke.append({"t": pt["t"], "x": nx, "y": ny})
        normed.append(new_stroke)

    return normed

# ██    ██  ██  ███████  ██    ██   █████   ██      
# ██    ██  ██  ██       ██    ██  ██   ██  ██      
# ██    ██  ██  ███████  ██    ██  ███████  ██      
#  ██  ██   ██       ██   ██  ██   ██   ██  ██      
#   ████    ██  ███████    ████    ██   ██  ███████ 
# ported from JS by OpenCode:BigPickle AI ref <https://starbeamrainbowlabs.com/labs/line-simplification/simplify_line.js>, demo <https://starbeamrainbowlabs.com/labs/line-simplification/demo.html>
# see also <https://starbeamrainbowlabs.com/blog/article.php?article=posts/259-Line-Simplification.html> for an explanation of how it works

# this is a line simplification algorithm the aim is that a (vector) line drawn can be made invariant of the precision of the tool used to draw that line by normalising the triangle area on the line in a sliding that window fashion

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


def simplify_strokes(strokes, min_area, min_points):
    return [simplify_stroke(s, min_area) for s in strokes]

##########################################################


def main():
	###
	## I: arg parsing etc
	###
    parser = argparse.ArgumentParser(
        description="Extract the `data` column from a WHA labelled_samples CSV as JSONL."
    )
    parser.add_argument("input", nargs="?", default="-", help="CSV file (default: stdin)")
    parser.add_argument("-o", "--output", default="-", help="Output file (default: stdout)")
    parser.add_argument("--out-validation", default=None, help="Validation output file (enables train/val split)")
    parser.add_argument("--validation-split", type=float, default=0.2,
                        help="Fraction of approved samples to reserve for validation (default: 0.2)")
    args = parser.parse_args()

    if args.out_validation:
        if args.output == "-":
            parser.error("Cannot use stdout for training output when --out-validation is set")
        if not 0 < args.validation_split < 1:
            parser.error("--validation-split must be between 0 and 1 (exclusive)")
    else:
        args.validation_split = 0

    infile = sys.stdin if args.input == "-" else args.input
    outfile = sys.stdout if args.output == "-" else open(args.output, "w")
	
	###
	## II: process data
	###
    try:
        df = pd.read_csv(infile)
        total = len(df)
        approved_df = df[df["review_status"] == "approved"].reset_index(drop=True)
        skipped = total - len(approved_df)
        done = 0

        if args.out_validation:
            val_file = open(args.out_validation, "w")
            split_point = int(len(approved_df) * (1 - args.validation_split))
        else:
            val_file = None

        points_before = []
        points_after = []
        for i, (_, row) in enumerate(tqdm(approved_df.iterrows(), total=len(approved_df), desc="Processing")):
			###
			## 1: extract relevant data
			###
			
            row_id = row["data_hash"]
            sign_id = row["sign_id"]
            data = json.loads(row["data"])
            # meta = json.loads(row["meta"])
			
			###
			## 2: Normalisation pipeline
			###
			
			# a: simplify lines (somewhat)
			# - this accounts for polling rate of drawing device. it's okay because device pixel ratio is invariant of  data here since <canvas /> size is /always/ 800
            count_before = sum(len(s) for s in data)
            data = simplify_strokes(data, MIN_AREA, MIN_POINTS)
            count_after = sum(len(s) for s in data)
            points_before.append(count_before)
            points_after.append(count_after)
			
			# b: normalise glyph to be 0..1
			# - note this may stretch/squash the glyph
            data = normalise_strokes(data)
			
			###
			## 3: Write out
			###
            handle = val_file if val_file is not None and i >= split_point else outfile
            handle.write(json.dumps({
                "id": row_id,
				"sign": sign_id,
                "data": data,
            }, ensure_ascii=False) + "\n")
            done += 1
    finally:
        if args.output != "-":
            outfile.close()
        if args.out_validation:
            val_file.close()
	
	###
	## III: calculate stats and print em out
	###
    diffs = [b - a for b, a in zip(points_before, points_after)]
    pcts  = [(b - a) / b * 100 for b, a in zip(points_before, points_after)]
    avg_before = mean(points_before)
    avg_after  = mean(points_after)
    avg_diff   = mean(diffs)
    avg_pct    = mean(pcts)
    sd_before = stdev(points_before) if len(points_before) > 1 else 0.0
    sd_after  = stdev(points_after)  if len(points_after)  > 1 else 0.0
    sd_diff   = stdev(diffs)         if len(diffs)          > 1 else 0.0
    sd_pct    = stdev(pcts)          if len(pcts)           > 1 else 0.0

    print(f"handled {total} samples, {done} kept and {skipped} skipped", file=sys.stderr)
    print(f"avg points per sample:  {avg_before:.1f}pts ±{sd_before:.1f}pts  →  {avg_after:.1f}pts ±{sd_after:.1f}pts", file=sys.stderr)
    print(f"avg removed:            {avg_diff:.1f}pts ±{sd_diff:.1f}pts  ({avg_pct:.1f}% ±{sd_pct:.1f}%)", file=sys.stderr)


if __name__ == "__main__":
    main()
