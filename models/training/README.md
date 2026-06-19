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
  glyph-class-to-idx.json
```

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
the un-augmented validation split, flagging any class whose mean signed error
exceeds 20°. A large per-class bias is the signature of a pose miscalibration
(e.g. a wrong augmentation sign), so a retrain surfaces it immediately.

CLI flags: `--no-rotation-aug`, `--rot-invariant-deg`, `--rot-jitter-deg`,
`--rot-allowed-jitter-deg`, `--dictionary-dir`. Run the math/policy checks with:

```bash
python3 models/training/test_rotation_policy.py
```

## Browser Recognition

The app's async recognizer runs in hybrid mode:

1. Template recognition runs first.
2. If `static/models/glyph-recognizer.onnx` and
   `static/models/glyph-class-to-idx.json` exist, ONNX inference runs for each
   candidate.
3. ML can reinforce matching template results, override template results at
   higher confidence, or accept unknown template results when the template
   verifier still sees glyph-like evidence.
4. A super-confident ML prediction can bypass the loose template verifier, while
   still respecting dictionary layer constraints. This keeps the learned model
   in charge when it has a very clear class prediction, but avoids accepting
   ordinary closed-set guesses for random drawings.
5. If the model files are missing or inference fails, the app silently falls back
   to template-only recognition.
