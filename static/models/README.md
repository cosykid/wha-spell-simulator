Generated browser models live here.

`npm run train:glyphs` writes:

- `glyph-recognizer.onnx`
- `glyph-recognizer.onnx.data`
- `glyph-class-to-idx.json`

The deployed recognizer is a 96px FP16 ONNX graph with float32 inputs/outputs.
Most weights live in the `.onnx.data` external-data sidecar, so the graph and
sidecar must be deployed together. Those files are committed so deployments
serve the model from `/models/`. Retraining overwrites them; commit updated
versions deliberately.
