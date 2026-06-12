#!/usr/bin/env python
"""Stage 3 of the WHA dataset pipeline: publish the outputs of
wha-ds-converter.py (vector JSONL) and/or wha-ds-imageifier.py (class-foldered
images) to the Hugging Face Hub as a versioned dataset with a generated
dataset card.

Both configs are converted to Parquet via the `datasets` library: the Hub
serves one builder per dataset repo, so mixed raw formats (JSONL + image
folders) cannot coexist as loadable configs.

Auth follows standard huggingface_hub resolution: the HF_TOKEN environment
variable, or cached credentials from `hf auth login`.
"""
import argparse
import json
import sys
import tempfile
from collections import Counter
from pathlib import Path

# Placeholder — confirm with project maintainers before publishing a public release.
LICENSE = "cc-by-4.0"

PROJECT_URL = "https://github.com/cosykid/wha-spell-simulator"

PRETTY_NAME = "WHA Spell Simulator Glyphs"


def scan_vector_file(path):
	"""Validate a converter JSONL file before handing it to `datasets`."""
	count = 0
	with open(path) as f:
		for line_no, line in enumerate(f, 1):
			line = line.strip()
			if not line:
				continue
			try:
				json.loads(line)["sign"]
			except (json.JSONDecodeError, KeyError, TypeError):
				sys.exit(f"error: {path}:{line_no} is not a valid sample record")
			count += 1
	if not count:
		sys.exit(f"error: {path} contains no samples")


def load_configs(args):
	"""Load the inputs into `DatasetDict`s keyed by config name."""
	from datasets import load_dataset

	configs = {}
	if args.vector_train:
		scan_vector_file(Path(args.vector_train))
		data_files = {"train": args.vector_train}
		if args.vector_validation:
			scan_vector_file(Path(args.vector_validation))
			data_files["validation"] = args.vector_validation
		configs["vector"] = load_dataset("json", data_files=data_files)
	if args.images:
		configs["image"] = load_dataset("imagefolder", data_dir=args.images)
	return configs


def config_counts(name, dataset_dict):
	"""{split: Counter(sign -> count)} for one config."""
	result = {}
	for split, ds in dataset_dict.items():
		if name == "image":
			labels = ds.features["label"].names
			result[split] = Counter(labels[i] for i in ds["label"])
		else:
			result[split] = Counter(ds["sign"])
	return result


def print_counts(config, counts_by_split):
	for split, counts in counts_by_split.items():
		total = sum(counts.values())
		print(f"{config}/{split}: {total} samples across {len(counts)} signs", file=sys.stderr)


def size_category(total):
	if total < 1_000:
		return "n<1K"
	if total < 10_000:
		return "1K<n<10K"
	if total < 100_000:
		return "10K<n<100K"
	return "100K<n<1M"


def counts_table(counts_by_split):
	"""Markdown table: one row per sign, one column per split."""
	splits = list(counts_by_split)
	classes = sorted({cls for counts in counts_by_split.values() for cls in counts})
	lines = ["| sign | " + " | ".join(splits) + " |",
	         "|---" * (len(splits) + 1) + "|"]
	for cls in classes:
		cells = " | ".join(str(counts_by_split[s].get(cls, 0)) for s in splits)
		lines.append(f"| {cls} | {cells} |")
	totals = " | ".join(str(sum(counts_by_split[s].values())) for s in splits)
	lines.append(f"| **total** | {totals} |")
	return "\n".join(lines)


def render_card_body(repo_id, counts):
	body = [
		f"# {PRETTY_NAME}",
		"",
		"Crowdsourced handwriting samples of signs and sigils from the fan-made",
		f"[Witch Hat Atelier spell simulator]({PROJECT_URL}). Contributors drew each",
		"glyph freehand in the project's Sample Maker tool; every sample was",
		"human-reviewed and only **approved** samples are included. Strokes are",
		"simplified (polling-rate invariant) and normalised to the 0..1 range,",
		"preserving aspect ratio.",
		"",
	]
	if "vector" in counts:
		body += [
			"## `vector` config",
			"",
			"One record per sample:",
			"",
			"- `id` — content hash of the raw sample",
			"- `sign` — glyph class label",
			"- `data` — list of strokes; each stroke is a list of `{t, x, y}` points",
			"  (`t` in ms from first pen-down, `x`/`y` normalised to 0..1)",
			"",
			"```python",
			"from datasets import load_dataset",
			f'vector = load_dataset("{repo_id}", "vector")',
			"```",
			"",
			counts_table(counts["vector"]),
			"",
		]
	if "image" in counts:
		body += [
			"## `image` config",
			"",
			"Rasterised strokes as images with a class `label`, embedded in Parquet.",
			"",
			"```python",
			"from datasets import load_dataset",
			f'images = load_dataset("{repo_id}", "image")',
			"```",
			"",
			counts_table(counts["image"]),
			"",
		]
	body += [
		"## Provenance & licensing",
		"",
		f"Collected via the [WHA spell simulator]({PROJECT_URL}) Sample Maker.",
		"Samples contain no personal information: only the content hash, class",
		"label, and stroke geometry survive the export pipeline.",
		"",
	]
	return "\n".join(body)


def publish(repo_id, configs, body, total, tag):
	"""Push each config as Parquet, refresh the dataset card body and
	descriptive metadata, then (re)create the version tag."""
	from huggingface_hub import DatasetCard, HfApi
	from huggingface_hub.errors import HfHubHTTPError

	api = HfApi()
	try:
		for name, dataset_dict in configs.items():
			message = f"Publish {name} config {tag}" if tag else f"Publish {name} config"
			dataset_dict.push_to_hub(repo_id, config_name=name, commit_message=message)

		# push_to_hub maintains the YAML `configs`/`dataset_info`; keep those
		# and overwrite only the prose plus descriptive metadata.
		card = DatasetCard.load(repo_id)
		card.text = body
		card.data.pretty_name = PRETTY_NAME
		card.data.license = LICENSE
		card.data.task_categories = ["image-classification"]
		card.data.size_categories = [size_category(total)]
		card.push_to_hub(repo_id, commit_message="Update dataset card")

		if tag:
			try:
				api.create_tag(repo_id, tag=tag, repo_type="dataset")
			except HfHubHTTPError as error:
				if error.response is not None and error.response.status_code == 409:
					print(f"warning: tag {tag} already exists - moving it", file=sys.stderr)
					api.delete_tag(repo_id, tag=tag, repo_type="dataset")
					api.create_tag(repo_id, tag=tag, repo_type="dataset")
				else:
					raise
	except HfHubHTTPError as error:
		status = error.response.status_code if error.response is not None else None
		if status == 401:
			sys.exit("error: authentication failed - set HF_TOKEN or run `hf auth login`")
		raise


def parse_args():
	parser = argparse.ArgumentParser(
		description="Publish WHA dataset pipeline outputs to the Hugging Face Hub."
	)
	parser.add_argument("--repo-id", required=True,
	                    help="Hub dataset repo to publish to, e.g. someuser/wha-glyphs")
	parser.add_argument("--vector-train",
	                    help="Converter JSONL output (training split)")
	parser.add_argument("--vector-validation",
	                    help="Converter JSONL output (validation split)")
	parser.add_argument("--images",
	                    help="Imageifier output root directory")
	parser.add_argument("--tag",
	                    help="Version tag to create on the Hub repo after upload, e.g. v1")
	parser.add_argument("--dry-run", action="store_true",
	                    help="Process inputs locally, print counts and a card preview, and skip all Hub calls")
	args = parser.parse_args()

	if not args.vector_train and not args.images:
		parser.error("at least one of --vector-train / --images is required")
	if args.vector_validation and not args.vector_train:
		parser.error("--vector-validation requires --vector-train")
	for name in ("vector_train", "vector_validation"):
		value = getattr(args, name)
		if value and not Path(value).is_file():
			parser.error(f"--{name.replace('_', '-')}: file not found: {value}")
	if args.images and not Path(args.images).is_dir():
		parser.error(f"--images: directory not found: {args.images}")
	return args


def main():
	args = parse_args()
	configs = load_configs(args)
	counts = {name: config_counts(name, dataset_dict) for name, dataset_dict in configs.items()}
	for name, counts_by_split in counts.items():
		print_counts(name, counts_by_split)

	total = max(
		sum(sum(c.values()) for c in counts_by_split.values())
		for counts_by_split in counts.values()
	)
	body = render_card_body(args.repo_id, counts)

	if args.dry_run:
		preview = Path(tempfile.mkdtemp(prefix="wha-ds-hf-")) / "README-body.md"
		preview.write_text(body)
		print(f"dry run: card body preview at {preview}; skipping all Hub calls", file=sys.stderr)
		return

	publish(args.repo_id, configs, body, total, tag=args.tag)
	print(f"Dataset published: https://huggingface.co/datasets/{args.repo_id}")
	print("Load with:")
	print("  from datasets import load_dataset")
	if "vector" in configs:
		print(f'  vector = load_dataset("{args.repo_id}", "vector")')
	if "image" in configs:
		print(f'  images = load_dataset("{args.repo_id}", "image")')


if __name__ == "__main__":
	main()
