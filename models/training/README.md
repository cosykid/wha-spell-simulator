# WHA Glyph Training

This folder contains PyTorch-side training helpers for datasets exported by:

```bash
models/ai-dataset-processing/wha-ds-converter.py
models/ai-dataset-processing/wha-ds-imageifier.py
```

`wha_multitask.py` provides:

- `GlyphManifestDataset`: loads PNGs plus class/pose targets from `manifest.jsonl`,
  with optional per-class rotation augmentation on the train split.
- `GlyphResNet18MultiHead`: ResNet18 backbone with heads for class, angle, scale,
  and center.
- `glyph_multitask_loss`: combined classification + pose loss.

`rotation_policy.py` reads each glyph's `recognitionRotationInvariant` /
`allowedRotationsDeg` from the dictionary and decides how far that class may rotate
during training. See [Rotation Augmentation](#rotation-augmentation).

As of June 16, 2026, the labelled handwriting dataset contains more than 8,000
hand-drawn glyph samples collected with the Sample Maker tool.

## One Command

From the repo root:

```bash
npm run train:glyphs
```

That command:

1. Exports approved `labelled_samples` rows from the database.
2. Renders PNGs and writes `manifest.jsonl`, `manifest.csv`, and `class_to_idx.json`.
3. Creates/updates the PyTorch training venv.
4. Trains the multi-head ResNet18 model.
5. Exports the best checkpoint to ONNX for the browser hybrid recognizer.

Generated files go under:

```text
.artifacts/glyph-training/
  labelled_samples_vector-all.jsonl
  labelled_samples_raster/
  checkpoints/
```

Browser inference files go under SvelteKit's static asset directory:

```text
static/models/
  glyph-recognizer.onnx
  glyph-recognizer.onnx.data
  glyph-class-to-idx.json
```

The current browser model is trained and rendered at 96x96. The raster source
PNGs may be larger; `GlyphManifestDataset` resizes them at load time using
`default_image_transform(image_size)`, and `--image-size` is saved into the
checkpoint so export can use the same shape.

Useful overrides:

```bash
EPOCHS=5 npm run train:glyphs
LIMIT=200 EPOCHS=2 npm run train:glyphs
NO_PRETRAINED=1 npm run train:glyphs
SKIP_ONNX=1 npm run train:glyphs
SKIP_EXPORT=1 SKIP_RASTER=1 EPOCHS=10 npm run train:glyphs
ROTATION_AUG=0 npm run train:glyphs              # disable rotation augmentation
ROT_INVARIANT_DEG=180 ROT_JITTER_DEG=12 npm run train:glyphs
```

For a quick pipeline smoke test without training:

```bash
LIMIT=20 SKIP_TRAIN=1 npm run train:glyphs
```

## Manual Install

```bash
cd models/training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Manual Train

```bash
python train_multitask.py \
  ../../.artifacts/glyph-training/labelled_samples_raster \
  --epochs 20 \
  --image-size 96 \
  --batch-size 32 \
  --checkpoint-dir ../../.artifacts/glyph-training/checkpoints
```

The model predicts angle as `[sin(angle), cos(angle)]`, which avoids the wraparound
problem where `-179 deg` and `179 deg` are visually close but numerically far apart.

Checkpoints are written to:

```text
.artifacts/glyph-training/checkpoints/latest.pt
.artifacts/glyph-training/checkpoints/best.pt
```

## Rotation Augmentation

Scale and translation are already invariant by construction: every candidate is
cropped to its bounding box and normalized to a fixed margined square, both when
rasterizing training data and when rendering for browser inference. Rotation is
not — the class head only tolerates rotation to the degree the samples happen to
contain. To fix that, the train split rotates samples on the fly, gated per class
by the dictionary metadata the runtime recognizer already uses:

- `recognitionRotationInvariant: true` → rotate uniformly in `±--rot-invariant-deg`
  (default 180, i.e. the full circle). Every current sigil and sign is explicitly
  flagged this way, so the model learns each glyph at any rotation after retraining.
- `allowedRotationsDeg: [...]` → snap to those orientations, plus a little jitter.
- an orientation-locked glyph (flag `false`) → only a small `±--rot-jitter-deg`
  wobble (default 12), within the recognizer's sign tolerance, so it never changes
  a glyph's meaning.

Signs are a hybrid: the model is trained to recognize them at any rotation, but the
template fallback in `signRotation.ts` stays orientation-aware (a straight `column`
is shape-ambiguous under free rotation). See `docs/recognition.md` → Rotation
Semantics.

The pose targets transform with the image so the angle/scale/center heads stay
consistent. PIL's `rotate(θ)` turns the image counter-clockwise, but the label
`angle` is clockwise-positive in the y-down canvas (`buildSample` →
`DOMMatrix.rotateSelf`), so a CCW image rotation _subtracts_ `θ` from `angle`,
orbits `center` the same CCW way the pixels move, and leaves `scale_x` / `scale_y`
unchanged (they live in the overlay's own frame). Because gating reads the
dictionary, changing `recognitionRotationInvariant` or `allowedRotationsDeg`
automatically changes augmentation on the next run — no training-code change.

After the epochs, `train_multitask.py` prints a per-class angle-error table over
the un-augmented validation split:

- `bias`: mean signed circular error, in degrees.
- `abs`: mean absolute circular error, in degrees.
- `R`: error resultant length, from 0 to 1.
- `n`: validation sample count.

A class is flagged as `miscalibrated` only when `abs(bias) > 20` and `R >= 0.6`.
The `R` gate matters because rotationally symmetric glyphs can have high
absolute angle error with errors spread around the circle; their signed bias is
not meaningful and the pose head is diagnostic-only. A true augmentation or
pose-sign bug shows up as both high bias and a tight error distribution.

CLI flags: `--no-rotation-aug`, `--rot-invariant-deg`, `--rot-jitter-deg`,
`--rot-allowed-jitter-deg`, `--dictionary-dir`. Run the math/policy checks with:

```bash
python3 models/training/test_rotation_policy.py
```

## ONNX Export

`export_onnx.py` reads `image_size` from the checkpoint args, falling back to 96.
It exports a temporary FP32 ONNX graph, converts it to FP16 with
`onnxconverter_common.float16.convert_float_to_float16(keep_io_types=True)`, and
deploys the result as:

```text
static/models/glyph-recognizer.onnx
static/models/glyph-recognizer.onnx.data
static/models/glyph-class-to-idx.json
```

`keep_io_types=True` keeps model inputs and outputs as float32, so the browser
runtime still feeds the same `Float32Array` tensors. The FP16 weights live in the
external-data sidecar.

Export validates two things before finishing:

- Dynamic batch works by running a 3-image CPU `onnxruntime` inference in one
  call.
- FP16 class argmax matches the torch model on real validation rasters. If
  agreement drops below the configured parity threshold, the script falls back
  to deploying FP32 with the same filenames.

## Browser Recognition

The app's async recognizer runs in hybrid mode:

1. Template recognition runs first.
2. If `static/models/glyph-recognizer.onnx` and
   `static/models/glyph-recognizer.onnx.data` plus
   `static/models/glyph-class-to-idx.json` exist, ONNX inference runs for each
   candidate set.
3. ML can reinforce matching template results, override template results at
   higher confidence, or accept unknown template results when the template
   verifier still sees glyph-like evidence.
4. A super-confident ML prediction can bypass the loose template verifier, while
   still respecting dictionary layer constraints. This keeps the learned model
   in charge when it has a very clear class prediction, but avoids accepting
   ordinary closed-set guesses for random drawings.
5. If the model files are missing or inference fails, the app silently falls back
   to template-only recognition.

The browser runtime requests WebGPU first and falls back to WASM. Dynamic-batch
exports let it calibrate canonical pose angles in one inference and pack multiple
candidate tensors into one `session.run(...)`; if batching fails, it retries with
single-candidate inference for the rest of that session.
