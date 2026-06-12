# WHA Dataset Processing

> Set of Python tools for processing data from the [Sample Maker](https://wha-spell-simulator.vercel.app/tools/sample-maker) into something usable for A training.

## System Requirements

- Python 3.14+ (might work with earlier but untested)
- [`uv`](https://docs.astral.sh/uv/) (package management; `uv` > `pip`)
- Some command-line knowledge

## Getting started

First, install dependencies:

```bash
uv sync
```

The pipeline has 3 stages:

1. **`wha-ds-converter.py`:** Convert a raw (uncompressed) `csv` containing _vector_ data into a `.jsonl` [JSON Lines](https://jsonlines.org/) file
   - Normalises data to be invariant to mouse/touchscreen/etc polling rate
   - Normalises data to be between 0..1, _preserving aspect ratio_
2. **`wha-ds-imagifier.py`:** Converts the output of the above into `.jpg` images, in a format [`tf.keras.processing.image_dataset_from_directory`](https://www.tensorflow.org/api_docs/python/tf/keras/preprocessing/image_dataset_from_directory) takes
   - Adds 20% margin by default to ensure random rotations don't cut things off
3. **`wha-ds-hf-publisher.py`:** Publishes the outputs of either/both stages above to the [Hugging Face Hub](https://huggingface.co/datasets) as a versioned dataset
   - Generates a dataset card with per-sign counts and `load_dataset` snippets
   - Exposes 2 configs: `vector` (strokes) and `image` (rasters), both converted to Parquet — the Hub serves one builder per dataset repo, so the raw formats can't be uploaded as-is

### Using `wha-ds-converter.py`

In it's basic form, do this:

```bash
uv run wha-ds-converter.py input_file.csv -o output_file.jsonl
```

To see full help (including doing a training/validation split), do this:

```bash
uv run wha-ds-converter.py --help
```

### Using `wha-ds-imageifier.py`

In it's basic form, do this:

```bash
uv run wha-ds-imageifier.py input_file.jsonl -o output_directory/
```

To see full help, (including doing a training/validation split), do this:

```bash
uv run wha-ds-converter.py --help
```

Example directory structure outputs:

**Without training/validation split:**

```
output_directory/
  class_a/
    <hash>.jpg
  class_b/
    <hash>.jpg
  ...
```

**With training/validation split:**

```
output_directory/
  train/
    class_a/
      <hash>.jpg
    class_b/
      <hash>.jpg
    ...
  validation/
    class_a/
      <hash>.jpg
    class_b/
      <hash>.jpg
    ...
```

### Using `wha-ds-hf-publisher.py`

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
