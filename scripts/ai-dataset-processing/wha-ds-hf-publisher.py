#!/usr/bin/env python
"""Stage 3 of the WHA dataset pipeline: publish the outputs of
wha-ds-converter.py (vector JSONL) and/or wha-ds-imageifier.py (class-foldered
images) to the Hugging Face Hub as a versioned dataset with a generated
dataset card.

Auth follows standard huggingface_hub resolution: the HF_TOKEN environment
variable, or cached credentials from `hf auth login`.
"""
import argparse
import json
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path

# Placeholder — confirm with project maintainers before publishing a public release.
LICENSE = "cc-by-4.0"

PROJECT_URL = "https://github.com/cosykid/wha-spell-simulator"

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def scan_vector_file(path):
	"""Tally samples per sign in a converter JSONL file."""
	counts = Counter()
	with open(path) as f:
		for line_no, line in enumerate(f, 1):
			line = line.strip()
			if not line:
				continue
			try:
				counts[json.loads(line)["sign"]] += 1
			except (json.JSONDecodeError, KeyError, TypeError):
				sys.exit(f"error: {path}:{line_no} is not a valid sample record")
	if not counts:
		sys.exit(f"error: {path} contains no samples")
	return counts


def scan_image_dir(root):
	"""Detect the imageifier layout (train/+validation/ subdirs, or bare class
	dirs) and tally images per class. Returns {split: (split_root, Counter)}."""
	if (root / "train").is_dir():
		split_roots = {"train": root / "train"}
		if (root / "validation").is_dir():
			split_roots["validation"] = root / "validation"
	else:
		split_roots = {"train": root}
	result = {}
	for split, split_root in split_roots.items():
		counts = Counter()
		for cls_dir in sorted(p for p in split_root.iterdir() if p.is_dir()):
			total = sum(1 for f in cls_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS)
			if total:
				counts[cls_dir.name] = total
		if not counts:
			sys.exit(f"error: no class directories with images found in {split_root}")
		result[split] = (split_root, counts)
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


def render_card(repo_id, vector_counts, image_counts):
	front = [
		"---",
		"pretty_name: WHA Spell Simulator Glyphs",
		f"license: {LICENSE}",
		"task_categories:",
		"- image-classification",
	]
	total = max(
		sum(sum(c.values()) for c in vector_counts.values()),
		sum(sum(c.values()) for c in image_counts.values()),
	)
	front += ["size_categories:", f"- {size_category(total)}", "configs:"]
	if vector_counts:
		front += ["- config_name: vector", "  data_files:"]
		for split in vector_counts:
			front += [f"  - split: {split}", f"    path: vector/{split}.jsonl"]
	if image_counts:
		front += ["- config_name: image", "  data_files:"]
		for split in image_counts:
			front += [f"  - split: {split}", f"    path: image/{split}/**"]
	front.append("---")

	body = [
		"",
		"# WHA Spell Simulator Glyphs",
		"",
		"Crowdsourced handwriting samples of signs and sigils from the fan-made",
		f"[Witch Hat Atelier spell simulator]({PROJECT_URL}). Contributors drew each",
		"glyph freehand in the project's Sample Maker tool; every sample was",
		"human-reviewed and only **approved** samples are included. Strokes are",
		"simplified (polling-rate invariant) and normalised to the 0..1 range,",
		"preserving aspect ratio.",
		"",
	]
	if vector_counts:
		body += [
			"## `vector` config",
			"",
			"One JSON record per line:",
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
			counts_table(vector_counts),
			"",
		]
	if image_counts:
		body += [
			"## `image` config",
			"",
			"Rasterised strokes as JPGs, foldered by class (`imagefolder` layout).",
			"",
			"```python",
			"from datasets import load_dataset",
			f'images = load_dataset("{repo_id}", "image")',
			"```",
			"",
			counts_table(image_counts),
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
	return "\n".join(front + body)


def build_staging(staging, args):
	"""Copy inputs into the Hub layout. Returns (vector_counts, image_counts),
	each {split: Counter(sign -> count)}."""
	vector_counts = {}
	if args.vector_train:
		vector_dir = staging / "vector"
		vector_dir.mkdir(parents=True)
		vector_counts["train"] = scan_vector_file(Path(args.vector_train))
		shutil.copyfile(args.vector_train, vector_dir / "train.jsonl")
		if args.vector_validation:
			vector_counts["validation"] = scan_vector_file(Path(args.vector_validation))
			shutil.copyfile(args.vector_validation, vector_dir / "validation.jsonl")

	image_counts = {}
	if args.images:
		image_layout = scan_image_dir(Path(args.images))
		for split, (split_root, _) in image_layout.items():
			shutil.copytree(split_root, staging / "image" / split)
		image_counts = {split: counts for split, (_, counts) in image_layout.items()}

	return vector_counts, image_counts


def publish(staging, repo_id, tag):
	"""Create the dataset repo if needed, upload the staging dir as one
	commit, and (re)create the version tag."""
	from huggingface_hub import HfApi
	from huggingface_hub.errors import HfHubHTTPError

	api = HfApi()
	try:
		api.create_repo(repo_id, repo_type="dataset", exist_ok=True)
		message = f"Publish dataset {tag}" if tag else "Publish dataset"
		api.upload_folder(repo_id=repo_id, repo_type="dataset",
		                  folder_path=staging, commit_message=message)
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
						help="Assemble the staging directory locally, print it, and skip all Hub calls")
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
	staging = Path(tempfile.mkdtemp(prefix="wha-ds-hf-"))
	try:
		vector_counts, image_counts = build_staging(staging, args)
		card = render_card(args.repo_id, vector_counts, image_counts)
		(staging / "README.md").write_text(card)

		print_counts("vector", vector_counts)
		print_counts("image", image_counts)

		if args.dry_run:
			print(f"dry run: staged dataset left at {staging}", file=sys.stderr)
			return

		publish(staging, args.repo_id, args.tag)
		print(f"Dataset published: https://huggingface.co/datasets/{args.repo_id}")
		print("Load with:")
		print("  from datasets import load_dataset")
		if vector_counts:
			print(f'  vector = load_dataset("{args.repo_id}", "vector")')
		if image_counts:
			print(f'  images = load_dataset("{args.repo_id}", "image")')
	finally:
		if not args.dry_run:
			shutil.rmtree(staging, ignore_errors=True)


if __name__ == "__main__":
	main()
