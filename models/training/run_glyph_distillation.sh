#!/usr/bin/env bash
#
# Distill the ResNet18 glyph teacher into the small browser model and deploy it.
#
# Run `run_glyph_training.sh` first: it cuts the frozen split and trains the
# teacher this script distills. The stages here are:
#
#   1. render an augmented image pool from the frozen split's vectors, and score
#      every render once with the teacher
#   2. train the student against those soft targets plus the hard labels
#   3. fit the output temperature on the validation split
#   4. export FP16 ONNX into static/models/
#   5. score the new graph against the currently deployed one on the test split
#
# The test split is only read by stage 5.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRAIN_DIR="$ROOT_DIR/models/training"

FROZEN_DIR="${FROZEN_DIR:-$ROOT_DIR/.artifacts/glyph-frozen}"
TEACHER="${TEACHER:-$FROZEN_DIR/teacher-baseline/best.pt}"
POOL_DIR="${POOL_DIR:-$FROZEN_DIR/pool}"

PER_CLASS="${PER_CLASS:-10000}"
POOL_SEED="${POOL_SEED:-1}"
SIZE="${SIZE:-small}"
# Keyed by size so comparing two architectures does not overwrite the first one.
STUDENT_DIR="${STUDENT_DIR:-$FROZEN_DIR/student-$SIZE}"
EPOCHS="${EPOCHS:-30}"
BATCH_SIZE="${BATCH_SIZE:-256}"
LR="${LR:-3e-3}"
TEMPERATURE="${TEMPERATURE:-4.0}"
ALPHA="${ALPHA:-0.7}"
WORKERS="${WORKERS:-8}"

SKIP_POOL="${SKIP_POOL:-0}"
SKIP_TRAIN="${SKIP_TRAIN:-0}"
DEPLOY="${DEPLOY:-1}"
ONNX_OUTPUT="${ONNX_OUTPUT:-$ROOT_DIR/static/models/glyph-recognizer.onnx}"
CLASS_MAP_OUTPUT="${CLASS_MAP_OUTPUT:-$ROOT_DIR/static/models/glyph-class-to-idx.json}"
DEPLOYED_BEFORE="$FROZEN_DIR/deployed-before.onnx"

PYTHON_BIN="$TRAIN_DIR/.venv/bin/python"
cd "$TRAIN_DIR"

if [[ "$SKIP_POOL" != "1" ]]; then
	echo "Rendering the distillation pool -> $POOL_DIR"
	"$PYTHON_BIN" distill_data.py \
		--out "$POOL_DIR" \
		--teacher "$TEACHER" \
		--frozen "$FROZEN_DIR" \
		--per-class "$PER_CLASS" \
		--seed "$POOL_SEED" \
		--workers "$WORKERS"
else
	echo "Skipping pool build; using $POOL_DIR"
fi

if [[ "$SKIP_TRAIN" != "1" ]]; then
	echo "Distilling the '$SIZE' student -> $STUDENT_DIR"
	"$PYTHON_BIN" distill_student.py \
		--pool "$POOL_DIR" \
		--out "$STUDENT_DIR" \
		--frozen "$FROZEN_DIR" \
		--size "$SIZE" \
		--epochs "$EPOCHS" \
		--batch-size "$BATCH_SIZE" \
		--lr "$LR" \
		--temperature "$TEMPERATURE" \
		--alpha "$ALPHA"
fi

echo "Fitting the output temperature"
"$PYTHON_BIN" calibrate_student.py \
	--checkpoint "$STUDENT_DIR/best.pt" \
	--out "$STUDENT_DIR/calibrated.pt" \
	--frozen "$FROZEN_DIR"

# Keep a copy of what is deployed today so stage 5 can compare against it after
# the new graph has overwritten it.
if [[ "$DEPLOY" == "1" && -f "$ONNX_OUTPUT" ]]; then
	cp "$ONNX_OUTPUT" "$DEPLOYED_BEFORE"
	cp "$ONNX_OUTPUT.data" "$DEPLOYED_BEFORE.data"
fi

echo "Exporting FP16 ONNX -> $ONNX_OUTPUT"
"$PYTHON_BIN" export_onnx.py "$STUDENT_DIR/calibrated.pt" \
	--output "$ONNX_OUTPUT" \
	--class-map-output "$CLASS_MAP_OUTPUT"

if [[ -f "$DEPLOYED_BEFORE" ]]; then
	echo "Scoring both graphs on the frozen test split"
	"$PYTHON_BIN" run_glyph_eval.py \
		"deployed-before=$DEPLOYED_BEFORE" \
		"student=$ONNX_OUTPUT" \
		--frozen "$FROZEN_DIR" \
		--split test
fi

echo "Done."
echo "Pool:       $POOL_DIR"
echo "Student:    $STUDENT_DIR"
echo "Deployed:   $ONNX_OUTPUT"
