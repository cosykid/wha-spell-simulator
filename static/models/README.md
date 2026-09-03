Generated browser models live here.

`npm run train:glyphs` writes:

- `glyph-recognizer.onnx`
- `glyph-recognizer.onnx.data`
- `glyph-class-to-idx.json`

The deployed recognizer is `GlyphStudent`, a 439K-parameter CNN distilled from a
ResNet18 teacher (`models/training/README.md` covers both stages). It is a 96px
FP16 ONNX graph with float32 inputs and outputs, and it reads one 1x96x96
grayscale plane per candidate at a dynamic batch size.

Most weights live in the `.onnx.data` external-data sidecar because
`loadRuntime` passes `externalData` explicitly, so the graph and the sidecar must
deploy together and keep these exact filenames. `glyph-class-to-idx.json` fixes
the 26-class output ordering, so all three files must change as a set.

The three files total 0.77 MB brotli-compressed. They are committed so
deployments serve the model from `/models/`, and `vite.config.ts` hashes them
into `__MODEL_ASSET_VERSION__` for cache busting. Retraining overwrites them, so
commit updated versions deliberately, and re-run `models/training/run_glyph_eval.py`
against the frozen test split before you do.
