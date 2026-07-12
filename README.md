# Witch Hat Atelier Spell Simulator

A fan-made interactive glyph recognition and visual effects app inspired by _[Witch Hat Atelier](https://en.wikipedia.org/wiki/Witch_Hat_Atelier)_.

<div align="center">
  <img src="./assets/demo.gif" width="720"/>
  <p>Try here: <a href="https://wha-spell-simulator.vercel.app/">https://wha-spell-simulator.vercel.app/</a></p>
</div>

## Fan Project Notice

This is an unofficial fan-made project for learning, experimentation, and appreciation. It is not affiliated with, endorsed by, or sponsored by the official creators, publishers, licensors, or production partners of _Witch Hat Atelier_.

_Witch Hat Atelier_ and related names, artwork, symbols, and trademarks belong to their respective rights holders. The sigils, signs, spell terminology, and visual effects in this project are partial fan references and interactive interpretations, not official assets or canonical rules.

## What It Does

The app lets users draw or arrange spell circles on a canvas, then converts those diagrams into structured parser output, compiled effect parameters, and animated canvas effects.

- Lets you draw spell diagrams on a paper-like canvas.
- Lets you place ring, sigil, and sign shapes from a palette, then move, scale, elongate, rotate, and duplicate them instead of drawing each one by hand.
- Detects one enclosing ring and distinguishes prepared versus active spells.
- Recognizes glyphs with a hybrid browser pipeline: a template matcher provides geometric verification, while a 96px FP16 ONNX-exported multi-head ResNet18 model classifies symbols and estimates angle, scale, and position.
- Trains the ResNet18 recognizer from more than 8,000 hand-drawn labelled samples collected with the Sample Maker tool and stored in Postgres (accurate as of June 16, 2026).
- Recognizes signs that modify direction, levitation, convergence, force, spread, focus, range, duration, and stability.
- Produces parser diagnostics, `GlyphAST`, and `SpellIR` output for inspection, including tentative glyph labels while symbols are still being drawn.
- Renders animated element effects from the compiled spell behavior.
- Compiles signs into a typed force field (`SpellField`): columns beam and lean, pulls twist by their facing angle, regions gate where magic spawns, and levitation lifts. Spells with signs render as particles advected through the summed field, so behaviors like vortices from angled pulls emerge from the physics.
- Shows sample spell layouts in the Dictionary panel as drawing references.
- Includes reference tools for making, viewing, and testing stroke templates, plus a spell effect lab for visual and animation tuning.

## Placing Shapes

If a symbol is hard to draw by hand, you can stamp it from a palette and adjust it instead.

1. Open the **Shapes** tab, or enable **Arrange Shapes** in the left control panel. Picking a shape from the palette enables Arrange Shapes automatically.
2. Pick a **Ring**, **Sigil**, or **Sign**, then click the canvas to place it.
3. Click a placed shape to select it, then drag its handles to move, scale, elongate, or rotate it. Copy it with **Cmd/Ctrl+C** and paste with **Cmd/Ctrl+V** to get a duplicate that keeps its shape, size, elongation, and rotation. Press **Delete** to remove it.
4. Turn **Arrange Shapes** off to bake the shapes into the drawing as ink. Locked shapes can no longer be edited, but you can draw over them.

The placed ring is stamped open with a small gap, so the spell stays prepared rather than activating immediately. Draw across the gap by hand to seal the ring and awaken the spell.

## Current Limitations

- The app supports one enclosing spell ring at a time. Multiple rings are detected as unsupported.
- The current compiler expects one primary sigil. Multiple primary sigils are detected as unsupported.
- Recognition combines local stroke templates with a trained browser ML model, but it still works best with clean, deliberate drawings.
- The recognizer is not perfect. Some valid-looking drawings may fail to match, and some rough drawings may need to be redrawn more clearly.
- Candidate grouping works on whole strokes. Live and prepared drawings use fast layer-aware proximity grouping for responsiveness; complete rings can use recognition-guided tree cuts to separate symbols drawn close together. It does not split a single stroke into fragments when two symbols are drawn without lifting the pointer.
- The dictionaries only cover a small fan-made subset of sigils, signs, and observed spell ideas.
- The visual effects are interpretive canvas animations, not a faithful reproduction of manga or anime effects.
- Raster images can be used as visual references, but the app cannot recover true stroke order from an image.
- Closed but invalid diagrams may show diagnostics, but they do not fall back to another element.
- This is a browser prototype, not a production drawing engine or general symbol recognizer.

## Run Locally

Install dependencies:

```sh
npm install
```

Start the SvelteKit dev server:

```sh
npm start
```

Then open:

```txt
http://127.0.0.1:5173/
```

To build the production app:

```sh
npm run build
```

## Deploy To Vercel

This app is deployed at
[https://wha-spell-simulator.vercel.app/](https://wha-spell-simulator.vercel.app/)
and targets Vercel through `@sveltejs/adapter-vercel`. The prerendered canvas
shell is served as static output, while SvelteKit API routes are deployed as
Vercel serverless functions. That keeps the database credentials server-side and lets the
browser submit labelled samples through `/api/samples`.

Once the GitHub repo is connected to Vercel, pull requests get preview
deployments and merges to `main` deploy to production.

Set these Vercel project environment variables as needed:

```sh
DATABASE_URL_VPS=postgres://...
```

Vercel can use the default build command:

```sh
npm run build
```

## Reference Tools

Companion lab tools are built into the app as SvelteKit routes and share the
simulator's core modules. Start the dev server (`npm start`) and open the
`/tools` index, or link to it from the **Tools** button in the app header:

```txt
/tools                          Index of all reference tools
/tools/stroke-template-maker    Draw a symbol and export a strokeTemplate
/tools/stroke-template-viewer   Preview a pasted strokeTemplate and its metrics
/tools/sigil-sign-detector-lab  Score a drawn symbol against the dictionary
/tools/spell-effect-lab         Tune a synthetic SpellIR and preview effects
```

## Tests

Run the Node test suite:

```sh
npm test
```

## Optional Storage

Runtime recognition does not need a live database. The browser loads static
model files from `static/models/` when available:

- `glyph-recognizer.onnx`
- `glyph-recognizer.onnx.data`
- `glyph-class-to-idx.json`

The ONNX graph and external-data sidecar are produced by the PyTorch export
pipeline and served from `/models/`. If the ONNX runtime, graph, sidecar, or
class map cannot load, recognition falls back to in-repo dictionary templates.
Neon Postgres is used to persist the by-eye **labelled handwriting samples**
collected by the Sample Maker tool (see the Labelled Samples API below). Those
samples feed the PyTorch training pipeline that exports the browser recognizer.

As of June 16, 2026, the labelled dataset contains more than 8,000 hand-drawn
glyph samples.

There are a few features (e.g. data gathering) that require a database connection. If you want to test those, see the instructions below for setting up a local Postgres instance with Docker.

### Local Postgres with Docker

For this, you'll need to install [Docker](https://docs.docker.com/desktop/), then follow these steps from the project root:

1. Initialize your local env file from the template:

   ```sh
   cp .env.example .env
   ```

   The default `DATABASE_URL_VPS` already points at the container below.

2. Start the database:

   ```sh
   docker compose -f docker-compose.dev.yml up -d
   ```

3. Create the schema, then run the app:

   ```sh
   npm run db:migrate
   npm start
   ```

Tear it down with `docker compose -f docker-compose.dev.yml down` (add `-v` to
also wipe the stored data).

### Labelled Samples API

`/api/samples` persists the by-eye labelled handwriting samples produced by the
[Sample Maker](#tools) tool to the `labelled_samples` table. Strokes are stored
**raw** (no normalization), alongside the asserted `label` (sign, scale, angle)
and capture `meta`. The server assigns the `id` and `capturedAt`.

| Method | Path           | Purpose                                                                              |
| ------ | -------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/api/samples` | List recent samples. Optional filters: `signId`, `limit` (default/cap 200).          |
| `POST` | `/api/samples` | Store one `SampleSubmission` (`data`, `label`, `meta`). Returns `201` with the `id`. |

Submissions are validated with [zod](https://zod.dev); a malformed body is
rejected with `400`. **De-duplication is enforced in the database**: a STORED
generated column hashes the raw `data`, and a unique constraint makes a
byte-identical re-submission fail — the endpoint surfaces that as `409`.

```sh
curl -X POST \
  -H "content-type: application/json" \
  -d '{"data":[[{"x":0,"y":0,"t":0}]],"label":{"signId":"fire","directionality":"directional","scale_x":1,"scale_y":1,"angle":0},"meta":{"schemaVersion":1,"referenceSize":240,"canvasWidth":800,"canvasHeight":800,"devicePixelRatio":1,"pointerType":"pen"}}' \
  "https://wha-spell-simulator.vercel.app/api/samples"
```

## Documentation

- [Dictionary authoring](docs/dictionary-authoring.md)
- [Recognition pipeline](docs/recognition.md)
- [Parser and spell semantics rules](docs/play-rules.md)
- [Parsed glyph output contract](docs/glyph-ast.md)
- [Compiled spell output contract](docs/spell-ir.md)
- [Visual effect renderer notes](docs/effect-rendering.md)
