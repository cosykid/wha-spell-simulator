#!/usr/bin/env bash
#
# Cut the frozen train/validation/test split from the labelled-sample database and
# train the ResNet18 teacher on it.
#
# The teacher is no longer what ships. It is the reference the browser model is
# judged against and the source of the soft targets that model distills from, so
# this script trains it and then hands off to `run_glyph_distillation.sh`, which
# is what produces and deploys the browser graph. `SKIP_DISTILL=1` stops here.
#
# The split is frozen on purpose: the three JSONL files ARE the record of it, so
# every model in a comparison is scored on identical rows. Re-running stage 1
# with the same seed on the same database reproduces it; new rows in the database
# do not.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROCESS_DIR="$ROOT_DIR/models/ai-dataset-processing"
TRAIN_DIR="$ROOT_DIR/models/training"

FROZEN_DIR="${FROZEN_DIR:-$ROOT_DIR/.artifacts/glyph-frozen}"
RASTER_DIR="${RASTER_DIR:-$FROZEN_DIR/raster}"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-$FROZEN_DIR/teacher-baseline}"

VALIDATION_SPLIT="${VALIDATION_SPLIT:-0.10}"
TEST_SPLIT="${TEST_SPLIT:-0.15}"
SPLIT_SEED="${SPLIT_SEED:-42}"
EPOCHS="${EPOCHS:-20}"
BATCH_SIZE="${BATCH_SIZE:-32}"
LR="${LR:-3e-4}"
WEIGHT_DECAY="${WEIGHT_DECAY:-1e-4}"
NUM_WORKERS="${NUM_WORKERS:-2}"
ROTATION_AUG="${ROTATION_AUG:-1}"
ROT_INVARIANT_DEG="${ROT_INVARIANT_DEG:-180}"
ROT_JITTER_DEG="${ROT_JITTER_DEG:-12}"
REVIEW_STATUS="${REVIEW_STATUS:-approved}"
LIMIT="${LIMIT:-}"
NO_PRETRAINED="${NO_PRETRAINED:-0}"
RESUME="${RESUME:-0}"
SKIP_EXPORT="${SKIP_EXPORT:-0}"
SKIP_RASTER="${SKIP_RASTER:-0}"
SKIP_TRAIN="${SKIP_TRAIN:-0}"
SKIP_DISTILL="${SKIP_DISTILL:-0}"

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

# Neon's connection string asks libpq to verify against `system`, which does not
# resolve to a usable trust store on macOS. Point it at certifi's bundle instead,
# in the environment, so the exporter needs no change.
database_url_with_ca() {
	"$PROCESS_DIR/.venv/bin/python" - <<-'PY'
		from pathlib import Path
		from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
		import os, certifi

		url = os.environ.get("DATABASE_URL_VPS", "")
		if not url:
		    for line in Path(".env").read_text().splitlines():
		        line = line.strip()
		        if line.startswith("DATABASE_URL_VPS="):
		            url = line.split("=", 1)[1].strip().strip('"').strip("'")
		            break
		if url:
		    parts = urlsplit(url)
		    query = dict(parse_qsl(parts.query, keep_blank_values=True))
		    if query.get("sslrootcert") in (None, "system"):
		        query["sslrootcert"] = certifi.where()
		    url = urlunsplit(parts._replace(query=urlencode(query)))
		print(url)
	PY
}

mkdir -p "$FROZEN_DIR"

UV_BIN="$(ensure_uv)"

if [[ "$SKIP_EXPORT" != "1" ]]; then
	echo "Exporting a frozen train/validation/test split from the database -> $FROZEN_DIR"
	converter_args=(
		-o "$FROZEN_DIR/train.jsonl"
		--out-validation "$FROZEN_DIR/validation.jsonl"
		--out-test "$FROZEN_DIR/test.jsonl"
		--validation-split "$VALIDATION_SPLIT"
		--test-split "$TEST_SPLIT"
		--seed "$SPLIT_SEED"
		--review-status "$REVIEW_STATUS"
	)
	if [[ -n "$LIMIT" ]]; then
		converter_args+=(--limit "$LIMIT")
	fi
	(
		cd "$ROOT_DIR"
		DATABASE_URL_VPS="$(database_url_with_ca)" \
			"$UV_BIN" run --project "$PROCESS_DIR" \
			"$PROCESS_DIR/wha-ds-converter.py" "${converter_args[@]}"
	)
else
	echo "Skipping database export; using $FROZEN_DIR/{train,validation,test}.jsonl"
fi

if [[ "$SKIP_RASTER" != "1" ]]; then
	echo "Rendering PNG datasets + manifest -> $RASTER_DIR"
	rm -rf "$RASTER_DIR"
	mkdir -p "$RASTER_DIR"
	for split in train validation test; do
		(
			cd "$PROCESS_DIR"
			"$UV_BIN" run wha-ds-imageifier.py "$FROZEN_DIR/$split.jsonl" \
				-o "$FROZEN_DIR/raster-$split" \
				--split-name "$split" \
				--validation-split 0
		)
		mv "$FROZEN_DIR/raster-$split/$split" "$RASTER_DIR/$split"
		cat "$FROZEN_DIR/raster-$split/manifest.jsonl" >>"$RASTER_DIR/manifest.jsonl"
		cp "$FROZEN_DIR/raster-$split/class_to_idx.json" "$RASTER_DIR/class_to_idx.json"
		rm -rf "$FROZEN_DIR/raster-$split"
	done
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
	if [[ "$RESUME" == "1" ]]; then
		train_args+=(--resume)
	fi

	echo "Training the teacher -> $CHECKPOINT_DIR"
	(
		cd "$TRAIN_DIR"
		"$PYTHON_BIN" train_multitask.py "${train_args[@]}"
	)
else
	echo "Skipping training"
fi

echo "Frozen split: $FROZEN_DIR/{train,validation,test}.jsonl"
echo "Rasters:      $RASTER_DIR"
echo "Teacher:      $CHECKPOINT_DIR/best.pt"

if [[ "$SKIP_DISTILL" != "1" ]]; then
	echo
	FROZEN_DIR="$FROZEN_DIR" TEACHER="$CHECKPOINT_DIR/best.pt" \
		bash "$TRAIN_DIR/run_glyph_distillation.sh"
else
	echo
	echo "Skipping distillation. Run models/training/run_glyph_distillation.sh to deploy."
fi
