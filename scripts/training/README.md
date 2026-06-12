# WHA Glyph Training

This folder contains PyTorch-side training helpers for datasets exported by:

```bash
scripts/ai-dataset-processing/wha-ds-converter.py
scripts/ai-dataset-processing/wha-ds-imageifier.py
```

`wha_multitask.py` provides:

- `GlyphManifestDataset`: loads PNGs plus class/pose targets from `manifest.jsonl`.
- `GlyphResNet18MultiHead`: ResNet18 backbone with heads for class, angle, scale,
  and center.
- `glyph_multitask_loss`: combined classification + pose loss.

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
```

For a quick pipeline smoke test without training:

```bash
LIMIT=20 SKIP_TRAIN=1 npm run train:glyphs
```

## Manual Install

```bash
cd scripts/training
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
