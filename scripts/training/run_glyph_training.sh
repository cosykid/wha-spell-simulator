#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROCESS_DIR="$ROOT_DIR/scripts/ai-dataset-processing"
TRAIN_DIR="$ROOT_DIR/scripts/training"

ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/.artifacts/glyph-training}"
VECTOR_ALL="${VECTOR_ALL:-$ARTIFACT_DIR/labelled_samples_vector-all.jsonl}"
RASTER_DIR="${RASTER_DIR:-$ARTIFACT_DIR/labelled_samples_raster}"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-$ARTIFACT_DIR/checkpoints}"

VALIDATION_SPLIT="${VALIDATION_SPLIT:-0.2}"
EPOCHS="${EPOCHS:-20}"
BATCH_SIZE="${BATCH_SIZE:-32}"
LR="${LR:-3e-4}"
WEIGHT_DECAY="${WEIGHT_DECAY:-1e-4}"
NUM_WORKERS="${NUM_WORKERS:-0}"
ROTATION_AUG="${ROTATION_AUG:-1}"
ROT_INVARIANT_DEG="${ROT_INVARIANT_DEG:-180}"
ROT_JITTER_DEG="${ROT_JITTER_DEG:-12}"
REVIEW_STATUS="${REVIEW_STATUS:-approved}"
LIMIT="${LIMIT:-}"
NO_PRETRAINED="${NO_PRETRAINED:-0}"
SKIP_EXPORT="${SKIP_EXPORT:-0}"
SKIP_RASTER="${SKIP_RASTER:-0}"
SKIP_TRAIN="${SKIP_TRAIN:-0}"
SKIP_ONNX="${SKIP_ONNX:-0}"
ONNX_OUTPUT="${ONNX_OUTPUT:-$ROOT_DIR/static/models/glyph-recognizer.onnx}"
CLASS_MAP_OUTPUT="${CLASS_MAP_OUTPUT:-$ROOT_DIR/static/models/glyph-class-to-idx.json}"

ensure_uv() {
	if command -v uv >/dev/null 2>&1; then
		command -v uv
		return
	fi

	local uv_venv="$ROOT_DIR/.venv-uv"
	local uv_bin="$uv_venv/bin/uv"
	if [[ ! -x "$uv_bin" ]]; then
		echo "uv not found; bootstrapping uv into $uv_venv" >&2
		python3 -m venv "$uv_venv"
		"$uv_venv/bin/python" -m pip install --upgrade pip uv >&2
	fi
	echo "$uv_bin"
}

ensure_training_env() {
	local train_venv="$TRAIN_DIR/.venv"
	local python_bin="$train_venv/bin/python"

	if [[ ! -x "$python_bin" ]]; then
		echo "Creating PyTorch training venv at $train_venv" >&2
		python3 -m venv "$train_venv"
	fi

	if ! "$python_bin" -c "import torch, torchvision, PIL, onnx, onnxscript, certifi" >/dev/null 2>&1; then
		echo "Installing PyTorch training dependencies" >&2
		"$python_bin" -m pip install --upgrade pip >&2
		"$python_bin" -m pip install -r "$TRAIN_DIR/requirements.txt" >&2
	fi

	echo "$python_bin"
}

configure_python_certs() {
	local python_bin="$1"
	local cert_file
	cert_file="$("$python_bin" -m certifi 2>/dev/null || true)"
	if [[ -n "$cert_file" && -f "$cert_file" ]]; then
		export SSL_CERT_FILE="${SSL_CERT_FILE:-$cert_file}"
		export REQUESTS_CA_BUNDLE="${REQUESTS_CA_BUNDLE:-$cert_file}"
	fi
}

mkdir -p "$ARTIFACT_DIR"

UV_BIN="$(ensure_uv)"

if [[ "$SKIP_EXPORT" != "1" ]]; then
	echo "Exporting approved samples from database -> $VECTOR_ALL"
	converter_args=(-o "$VECTOR_ALL" --review-status "$REVIEW_STATUS")
	if [[ -n "$LIMIT" ]]; then
		converter_args+=(--limit "$LIMIT")
	fi
	(
		cd "$PROCESS_DIR"
		"$UV_BIN" sync
		"$UV_BIN" run wha-ds-converter.py "${converter_args[@]}"
	)
else
	echo "Skipping DB export; using $VECTOR_ALL"
fi

if [[ "$SKIP_RASTER" != "1" ]]; then
	echo "Rendering PNG dataset + manifest -> $RASTER_DIR"
	(
		cd "$PROCESS_DIR"
		"$UV_BIN" run wha-ds-imageifier.py "$VECTOR_ALL" \
			-o "$RASTER_DIR" \
			--validation-split "$VALIDATION_SPLIT"
	)
else
	echo "Skipping raster build; using $RASTER_DIR"
fi

if [[ "$SKIP_TRAIN" != "1" ]]; then
	PYTHON_BIN="$(ensure_training_env)"
	configure_python_certs "$PYTHON_BIN"
	train_args=(
		"$RASTER_DIR"
		--epochs "$EPOCHS"
		--batch-size "$BATCH_SIZE"
		--lr "$LR"
		--weight-decay "$WEIGHT_DECAY"
		--num-workers "$NUM_WORKERS"
		--checkpoint-dir "$CHECKPOINT_DIR"
		--rot-invariant-deg "$ROT_INVARIANT_DEG"
		--rot-jitter-deg "$ROT_JITTER_DEG"
	)
	if [[ "$NO_PRETRAINED" == "1" ]]; then
		train_args+=(--no-pretrained)
	fi
	if [[ "$ROTATION_AUG" != "1" ]]; then
		train_args+=(--no-rotation-aug)
	fi

	echo "Training model -> $CHECKPOINT_DIR"
	(
		cd "$TRAIN_DIR"
		"$PYTHON_BIN" train_multitask.py "${train_args[@]}"
	)

	if [[ "$SKIP_ONNX" != "1" ]]; then
		echo "Exporting browser ONNX model -> $ONNX_OUTPUT"
		(
			cd "$TRAIN_DIR"
			"$PYTHON_BIN" export_onnx.py "$CHECKPOINT_DIR/best.pt" \
				--output "$ONNX_OUTPUT" \
				--class-map-output "$CLASS_MAP_OUTPUT"
		)
	fi
else
	echo "Skipping training"
fi

echo "Done."
echo "Dataset: $RASTER_DIR"
echo "Checkpoints: $CHECKPOINT_DIR"
echo "Browser model: $ONNX_OUTPUT"
