# WHA Dataset Processing

Python tools for exporting Sample Maker data from the `labelled_samples` database
table into ML-ready training artifacts.

The pipeline keeps the user's hand-drawn strokes as the model input and uses the
submitted reference overlay as extra target data:

- `sign`: the class label.
- `pose.center_x`, `pose.center_y`: where the overlay center lands after stroke
  normalization.
- `pose.scale_x`, `pose.scale_y`: overlay size after stroke normalization.
- `pose.angle`, `pose.angle_sin`, `pose.angle_cos`: overlay rotation. The sine
  and cosine fields are included because they are friendlier neural-network
  targets than raw radians.

The reference overlay is **not** baked into the training image. It is metadata the
model can learn to predict.

## System Requirements

- Python 3.14+ (might work with earlier versions, but untested)
- [`uv`](https://docs.astral.sh/uv/) for package management
- `DATABASE_URL` or `NEON_DATABASE_URL` pointing at the app database

Install dependencies:

```bash
uv sync
```

## One-Command Export + Training

From the repo root:

```bash
npm run train:glyphs
```

That orchestrates this exporter, the PNG/manifest renderer, and the PyTorch
training script. Artifacts are written to `.artifacts/glyph-training/`.

## Pipeline

### 1. Export Pose-Aware Vector JSONL

`wha-ds-converter.py` reads approved rows directly from Postgres/Neon, simplifies
the raw strokes, normalizes them into a `0..1` coordinate frame, and transforms
the submitted overlay label into the same normalized frame.

```bash
uv run wha-ds-converter.py -o labelled_samples_vector-all.jsonl
```

With a stratified train/validation split:

```bash
uv run wha-ds-converter.py \
  -o labelled_samples_vector-train.jsonl \
  --out-validation labelled_samples_vector-validation.jsonl \
  --validation-split 0.2
```

Useful options:

```bash
uv run wha-ds-converter.py --help
```

The output records look like:

```json
{
	"id": "<data_hash>",
	"sample_id": "sample:fire:...",
	"sign": "fire",
	"data": [[{ "t": 0, "x": 0.1, "y": 0.2 }]],
	"pose": {
		"center_x": 0.5,
		"center_y": 0.5,
		"scale_x": 0.8,
		"scale_y": 0.8,
		"angle": 0,
		"angle_sin": 0,
		"angle_cos": 1
	}
}
```

### 2. Render Raster Dataset + Manifest

`wha-ds-imageifier.py` renders the normalized hand-drawn strokes to lossless PNG
by default and writes manifests for PyTorch-style training.

```bash
uv run wha-ds-imageifier.py labelled_samples_vector-all.jsonl \
  -o labelled_samples_raster \
  --validation-split 0.2
```

Output:

```text
labelled_samples_raster/
  class_to_idx.json
  manifest.csv
  manifest.jsonl
  train/
    fire/
      <hash>.png
  validation/
    fire/
      <hash>.png
```

The manifest carries both the class target and the rendered-image pose targets:

```json
{
	"image_path": "train/fire/<hash>.png",
	"sign": "fire",
	"class_index": 3,
	"center_x": 0.5,
	"center_y": 0.5,
	"scale_x": 0.64,
	"scale_y": 0.64,
	"angle_sin": 0,
	"angle_cos": 1
}
```

The rendered pose values include the image margin, so they line up with the PNGs
the model actually sees.

#### Why PNG Instead Of JPG?

These samples are sparse black-and-white line drawings. PNG keeps the strokes
lossless, avoids JPEG artifacts around thin lines, and is usually still small for
this kind of image. `wha-ds-imageifier.py --format jpg` remains available if you
need JPEGs for a specific experiment.

### 3. Publish To Hugging Face

`wha-ds-hf-publisher.py` publishes the vector JSONL and/or raster image dataset
to the [Hugging Face Hub](https://huggingface.co/datasets) as a versioned
dataset.

Requires a Hugging Face account: set the `HF_TOKEN` environment variable, or log in once with `hf auth login`.

```bash
uv run wha-ds-hf-publisher.py \
  --repo-id your-user/your-dataset \
  --vector-train train.jsonl \
  --vector-validation validation.jsonl \
  --images output_directory/ \
  --tag v1
```

- At least one of `--vector-train` / `--images` is required; each becomes a named config on the Hub (`vector` / `image`).
- `--tag` creates a git tag on the Hub repo, so consumers can pin a release with `load_dataset(..., revision="v1")`.
- Add `--dry-run` to process everything locally (counts + a dataset card preview) without uploading.
- CI runs this automatically on every scheduled DB backup when the `HF_TOKEN` repo secret is set — see `scripts/db-backup.sh`.
- The dataset card declares a [`cc0-1.0`](https://creativecommons.org/publicdomain/zero/1.0/) (public domain) license.
