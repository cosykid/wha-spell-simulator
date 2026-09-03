# WHA Glyph Training

PyTorch-side training for the browser glyph recognizer. Datasets come from:

```bash
models/ai-dataset-processing/wha-ds-converter.py    # database -> stroke JSONL
models/ai-dataset-processing/wha-ds-imageifier.py   # stroke JSONL -> PNG + manifest
```

The deployed model is a small purpose-built CNN distilled from a ResNet18
teacher. Training therefore runs in two stages, one script each:

| Stage                   | Script                      | Produces                                          |
| ----------------------- | --------------------------- | ------------------------------------------------- |
| frozen split + teacher  | `run_glyph_training.sh`     | `.artifacts/glyph-frozen/`, a ResNet18 checkpoint |
| pool + student + deploy | `run_glyph_distillation.sh` | `static/models/glyph-recognizer.onnx`             |

`npm run train:glyphs` runs both. `SKIP_DISTILL=1` stops after the teacher.

## Module map

- `wha_multitask.py` - `GlyphManifestDataset`, `GlyphResNet18MultiHead` (the
  teacher), `glyph_multitask_loss`.
- `glyph_student.py` - `GlyphStudent`, the deployed architecture, plus the
  temperature fold.
- `rotation_policy.py` - reads each glyph's `recognitionRotationInvariant` /
  `allowedRotationsDeg` from the dictionary and decides how far that class may
  rotate during augmentation. See [Rotation Augmentation](#rotation-augmentation).
- `app_render.py` - rasterizes strokes the way the browser does at inference
  time. See [The two rasterizers](#the-two-rasterizers).
- `vector_augment.py` - redraws a labelled sample many different ways.
- `distill_data.py` - builds the augmented pool and the teacher's targets for it.
- `distill_pool.py` - reads the pool and deals it out in batches.
- `distill_student.py` - the distillation training loop.
- `calibrate_student.py` - fits the student's output temperature.
- `glyph_eval.py` / `run_glyph_eval.py` - the metrics a model must clear to ship.
- `export_onnx.py` - checkpoint to deployed FP16 ONNX.

## The frozen split

`run_glyph_training.sh` cuts one stratified train/validation/test split and
writes it as three JSONL files under `.artifacts/glyph-frozen/`. Those files
_are_ the split: every model in a comparison is scored on identical rows, and a
model trained before the split existed cannot be compared honestly against one
trained after it.

```text
.artifacts/glyph-frozen/
  train.jsonl validation.jsonl test.jsonl   the frozen split, seed 42
  raster/                                    PNGs + one manifest for all three
  teacher-baseline/                          ResNet18 checkpoints
  pool/                                      augmented renders + teacher targets
  student-<size>/                            distilled student checkpoints
```

`test.jsonl` is read by exactly one thing, `run_glyph_eval.py`. Training and
temperature fitting both select on `validation.jsonl`.

## The two rasterizers

A glyph reaches the model through one of two very different paths, and the
difference is large enough to change accuracy:

| Path                             | Pen                       | Ink width at 96px |
| -------------------------------- | ------------------------- | ----------------- |
| `wha-ds-imageifier.py`           | 2px at 224, resized to 96 | ~0.86px           |
| `src/lib/parser/ml/rendering.ts` | 2px at 96                 | 2.0px             |

So a model trained only on dataset rasters is served ink about 2.3x wider than
anything it saw. Measured on the frozen test split, that costs the ResNet18
teacher roughly 8 points of top-1 and takes one class (`wind-directs-air`,
which then reads as `aeroform`) to near zero.

`vector_augment.py` closes the gap by drawing every training render at an ink
width sampled across both, through both rasterizers. `app_render.py` exists so
evaluation can measure the browser's path, not just the dataset's.

## Distillation

The student has ~26x fewer parameters than the teacher, so it is trained against
the teacher's soft outputs rather than one-hot labels alone:

```text
loss = (1 - alpha) * CE(student, label)
     + alpha * T^2 * KL(student/T || teacher/T)     masked where the teacher is right
     + pose fit against the teacher on every render
     + pose fit against the labelled pose on untouched renders
```

Two details matter:

- **The KL term is masked** wherever the teacher's own argmax disagrees with the
  hard label. The teacher is fragile on wide ink, and an unmasked KL would teach
  the student mistakes the label already contradicts.
- **Only the untouched render keeps its pose label.** Augmentation moves the ink
  and the label does not move with it, so `pose_valid` marks variant 0 of each
  sample and the rest of the pose signal is distilled.

The pool is dealt out per class, not per sample, so the ~1.7x class imbalance in
the corpus does not reach training. Its rows are shuffled on disk because
training reads it in long contiguous runs: the pool is much larger than the page
cache, and row-at-a-time random reads starve the GPU.

## Calibration is part of the acceptance bar

The runtime only lets ML override the template recognizer when a prediction
clears paired confidence and margin thresholds (`config.recognition.ml` in
`src/lib/config.ts`). Distillation at temperature teaches flatness, so a student
can reproduce the teacher's argmax perfectly and still stop clearing 0.84 or
0.94, quietly losing its ability to override anything.

`run_glyph_eval.py` therefore reports, per model:

- top-1 on the dataset rasters _and_ on the browser's own eight-rotation vote,
- the rate at which predictions clear each acceptance gate,
- per-class accuracy, because one collapsed class hides in a 26-class average,
- argmax agreement with the model being replaced,
- pose angle, scale, and center error.

`calibrate_student.py` fits one temperature on the validation split by
minimizing the negative log likelihood of the browser's averaged-softmax
probabilities, then folds it into the final linear layer. Folding costs the
exported graph no extra node. The objective is a proper scoring rule, so it
cannot be tuned toward the gates.

## Rotation Augmentation

Scale and translation are invariant by construction: every candidate is cropped
to its bounding box and normalized into a fixed margined square, both when
rasterizing training data and when rendering for browser inference. Rotation is
not, so augmentation rotates samples, gated per class by the dictionary metadata
the runtime recognizer already uses:

- `recognitionRotationInvariant: true` -> rotate uniformly in
  `±--rot-invariant-deg` (default 180, the full circle). Every glyph with a
  dictionary entry is flagged this way.
- `allowedRotationsDeg: [...]` -> snap to those orientations, plus a little jitter.
- an orientation-locked glyph (flag `false`) -> only a small `±--rot-jitter-deg`
  wobble (default 12), within the recognizer's sign tolerance.

Six classes in the class map have no dictionary JSON (`cool`, `empower`,
`entwine`, `focus`, `gather`, `orb`), so they fall to the orientation-locked
default while every dictionary glyph is rotation-invariant. `acceptMlResult`
rejects those ids as `unknown_class` anyway, so the app never acts on them.

Signs are a hybrid: the model recognizes them at any rotation, but the template
fallback in `signRotation.ts` stays orientation-aware (a straight `column` is
shape-ambiguous under free rotation). See `docs/recognition.md` -> Rotation
Semantics.

The teacher's pose targets transform with the image. PIL's `rotate(θ)` turns the
image counter-clockwise, but the label `angle` is clockwise-positive in the
y-down canvas (`buildSample` -> `DOMMatrix.rotateSelf`), so a CCW image rotation
_subtracts_ `θ` from `angle`, orbits `center` the same CCW way the pixels move,
and leaves `scale_x` / `scale_y` unchanged (they live in the overlay's own
frame). Run the math/policy checks with:

```bash
python3 models/training/test_rotation_policy.py
```

After the epochs, `train_multitask.py` prints a per-class angle-error table over
the un-augmented validation split:

- `bias`: mean signed circular error, in degrees.
- `abs`: mean absolute circular error, in degrees.
- `R`: error resultant length, from 0 to 1.
- `n`: validation sample count.

A class is flagged as `miscalibrated` only when `abs(bias) > 20` and `R >= 0.6`.
The `R` gate matters because rotationally symmetric glyphs can have high absolute
angle error with errors spread around the circle; their signed bias is not
meaningful and the pose head is diagnostic-only. A true augmentation or pose-sign
bug shows up as both a high bias and a tight error distribution.

## ONNX Export

`export_onnx.py` reads the architecture from the checkpoint (`widths` marks a
student) and `image_size` from its args, falling back to 96. It exports a
temporary FP32 graph, converts it to FP16 with
`onnxconverter_common.float16.convert_float_to_float16(keep_io_types=True)`, and
deploys:

```text
static/models/glyph-recognizer.onnx
static/models/glyph-recognizer.onnx.data
static/models/glyph-class-to-idx.json
```

`keep_io_types=True` keeps model inputs and outputs float32, so the browser
runtime still feeds the same `Float32Array` tensors. The weights live in the
external-data sidecar because `loadRuntime` passes `externalData` explicitly;
the two files must deploy together.

Export validates two things before finishing:

- Dynamic batch works, by running a 3-image CPU `onnxruntime` inference in one call.
- FP16 class argmax matches the torch model on real validation rasters. Below the
  parity threshold it falls back to deploying FP32 under the same filenames.

The student uses only operators the previous ResNet18 already proved on both
execution providers (dense `Conv`, `BatchNormalization`, `Relu`, `MaxPool`,
`GlobalAveragePool`, `Gemm`), so a swap carries no new kernel risk. The one
rewrite that remains is `Clip` to `Max`/`Min`, which Firefox's WebGPU shader
compiler rejects in FP16 (`clip_to_minmax.py`).

## Useful overrides

```bash
EPOCHS=5 npm run train:glyphs
SKIP_DISTILL=1 npm run train:glyphs               # stop after the teacher
SKIP_EXPORT=1 SKIP_RASTER=1 npm run train:glyphs  # reuse the frozen split
RESUME=1 npm run train:glyphs                     # continue an interrupted teacher run
LIMIT=200 EPOCHS=2 npm run train:glyphs

# distillation only, against an existing frozen split and teacher
SKIP_POOL=1 SIZE=tiny EPOCHS=40 bash models/training/run_glyph_distillation.sh
```

## Manual Install

```bash
cd models/training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Browser Recognition

The app's async recognizer runs in hybrid mode:

1. Template recognition runs first.
2. If the three files under `static/models/` are present, ONNX inference runs for
   each candidate set, at eight rotations whose softmaxes are averaged.
3. ML can reinforce matching template results, override them at higher
   confidence, or accept unknown template results when the template verifier
   still sees glyph-like evidence.
4. A super-confident ML prediction can bypass the loose template verifier while
   still respecting dictionary layer constraints.
5. If the model files are missing or inference fails, the app silently falls back
   to template-only recognition.

The browser runtime requests WebGPU first and falls back to WASM. Dynamic-batch
exports let it calibrate canonical pose angles in one inference and pack multiple
candidate tensors into one `session.run(...)`; if batching fails, it retries with
single-candidate inference for the rest of that session.
