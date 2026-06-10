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

The pipeline has 2 stages:
1. **`wha-ds-converter.py`:** Convert a raw (uncompressed) `csv` containing *vector* data into a `.jsonl` [JSON Lines](https://jsonlines.org/) file
	- Normalises data to be invariant to mouse/touchscreen/etc polling rate
	- Normalises data to be between 0..1, *preserving aspect ratio*
2. **`wha-ds-imagifier.py`:** Converts the output of the above into `.jpg` images, in a format [`tf.keras.processing.image_dataset_from_directory`](https://www.tensorflow.org/api_docs/python/tf/keras/preprocessing/image_dataset_from_directory) takes
	- Adds 20% margin by default to ensure random rotations don't cut things off

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
