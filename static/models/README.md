Generated browser models live here.

`npm run train:glyphs` writes:

- `glyph-recognizer.onnx`
- `glyph-recognizer.onnx.data`, when PyTorch exports external weights
- `glyph-class-to-idx.json`

Those files are committed so deployments serve the model from `/models/`.
Retraining overwrites them; commit updated versions deliberately.
