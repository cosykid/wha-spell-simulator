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


if __name__ == "__main__":
	main()
