# API Reference

- [Introduction](#introduction)
- [Base URL](#base-url)
- [Endpoints](#endpoints)
    - [POST /api/spell](#post-apispell)
    - [POST /api/spell/analyze](#post-apispellanalyze)
    - [POST /api/spell/quality](#post-apispellquality)
    - [POST /api/spell/direction](#post-apispelldirection)
    - [POST /api/spell/effect-lab](#post-apispelleffect-lab)
    - [POST /api/spell/effect-lab/from-ir](#post-apispelleffect-labfrom-ir)
    - [GET /api/spell/dictionary](#get-apispelldictionary)
- [Common Types](#common-types)
    - [Stroke Formats](#stroke-formats)
    - [SpellIR](#spellir)
    - [GlyphAST](#glyphast)
    - [SpellDirection](#spelldirection)
- [Error Responses](#error-responses)
- [Testing Notes](#testing-notes)

## Introduction

This document describes the HTTP API exposed by the spell simulator server. All endpoints accept and return JSON. The API is used by the Minecraft plugin to submit player drawings and receive compiled spell data.

The main pipeline runs in three stages:

1. Raw strokes are normalized and cleaned.
2. The parser classifies strokes into a `GlyphAST` — ring, sigil candidates, signs, and unknowns.
3. The compiler emits a `SpellIR` from the AST. The `SpellIR` is the authoritative spell description the plugin acts on.

Each endpoint exposes a different slice of this pipeline. Most plugin integrations only need `POST /api/spell`.

## Base URL

```
http://<host>:<port>
```

The dev server runs on `http://localhost:5173` by default. In production, replace with your deployed host.

---

## Endpoints

### POST /api/spell

Runs the full pipeline. Submit strokes, receive a compiled `SpellIR` and the intermediate `GlyphAST`.

This is the main endpoint for plugin use.

**Request body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `strokes` | `Stroke[]` or `Point[][]` | yes | — | The drawn strokes. See [Stroke Formats](#stroke-formats). |
| `canvasWidth` | `number` | no | `1200` | Canvas width in pixels. Used when strokes are in normalized `0..1` format. |
| `sourceAspectRatio` | `number` | no | `1` | Width divided by height of the source canvas. |
| `previousRing` | `Ring \| null` | no | `null` | A ring object from a previous response. Pass this to continue building a prepared spell across multiple drawing steps. |

**Response:**

```json
{
  "spellIR": { ... },
  "glyphAST": { ... }
}
```

**Example:**

```bash
curl -s -X POST http://localhost:5173/api/spell \
  -H "Content-Type: application/json" \
  -d '{
    "strokes": [[{"x":0.1,"y":0.5},{"x":0.9,"y":0.5}]],
    "canvasWidth": 1200,
    "sourceAspectRatio": 1
  }' | jq .
```

---

### POST /api/spell/analyze

Scores a free-floating drawing against the dictionary without requiring an enclosing ring. Mirrors the Sigil/Sign Detector Lab.

Useful for debugging recognition or pre-screening a drawing before submitting it inside a full seal.

**Request body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `strokes` | `Stroke[]` or `Point[][]` | yes | — | The drawn strokes. |
| `canvasWidth` | `number` | no | `1200` | Canvas width in pixels. |
| `sourceAspectRatio` | `number` | no | `1` | Width divided by height. |
| `canvasHeight` | `number` | no | derived | Explicit canvas height. Overrides the value derived from `canvasWidth` and `sourceAspectRatio`. |
| `mode` | `'all'` \| `'sigils'` \| `'signs'` | no | `'all'` | Which dictionary entries to score against. |

**Response:**

```json
{
  "candidate": { ... },
  "recognition": { ... },
  "matches": [ ... ],
  "cleanedStrokes": [ ... ]
}
```

`matches` contains up to 10 entries sorted by confidence descending.

**Example:**

```bash
curl -s -X POST http://localhost:5173/api/spell/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "strokes": [[{"x":0.3,"y":0.2},{"x":0.7,"y":0.8}]],
    "mode": "sigils"
  }' | jq .
```

---

### POST /api/spell/quality

Re-calculates `quality` and `stability` from a `GlyphAST` you already have.

Useful when you want to re-score after manually editing an AST, or when building tooling that inspects drawing quality without rerunning the full pipeline.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `glyphAST` | `GlyphAST` | yes | A `GlyphAST` object from a previous `/api/spell` response. |

**Response:**

```json
{
  "quality": 0.74,
  "stability": 0.61
}
```

Both values are in the `0..1` range.

**Example:**

```bash
curl -s -X POST http://localhost:5173/api/spell/quality \
  -H "Content-Type: application/json" \
  -d '{
    "glyphAST": {
      "ring": { "found": true, "complete": true, "neatness": 0.8 },
      "globalMetrics": { "neatness": 0.75, "radialSymmetry": 0.6, "instability": 0.2 }
    }
  }' | jq .
```

---

### POST /api/spell/direction

Converts human-readable tilt angles or a 2-D surface vector into a full `SpellDirection` object.

**Request body — pick one mode:**

**Mode A — tilt angles:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `xTiltDeg` | `number` | no | `0` | Lean left/right in degrees. Clamped to `±82`. |
| `yTiltDeg` | `number` | no | `0` | Lean forward/backward in degrees. Clamped to `±82`. |

**Mode B — surface vector:**

| Field | Type | Required | Description |
|---|---|---|---|
| `surfaceX` | `number` | yes | Horizontal component of the 2-D surface direction. |
| `surfaceY` | `number` | yes | Vertical component of the 2-D surface direction. |
| `force` | `number` | yes | Spell force `0..1`. Determines how far the direction tilts from straight up. |

The server picks Mode B when either `surfaceX` or `surfaceY` is present in the body.

**Response:**

```json
{
  "direction": {
    "x": 0.42,
    "y": -0.31,
    "z": 0.85,
    "xTiltDeg": 26,
    "yTiltDeg": -20,
    "tiltFromZDeg": 31
  },
  "mode": "tilt"
}
```

**Examples:**

```bash
# Mode A — tilt angles
curl -s -X POST http://localhost:5173/api/spell/direction \
  -H "Content-Type: application/json" \
  -d '{"xTiltDeg": 30, "yTiltDeg": -45}' | jq .

# Mode B — surface vector
curl -s -X POST http://localhost:5173/api/spell/direction \
  -H "Content-Type: application/json" \
  -d '{"surfaceX": 0.7, "surfaceY": -0.3, "force": 0.6}' | jq .
```

---

### POST /api/spell/effect-lab

Builds a synthetic `SpellIR` from Effect Lab slider values. Useful for effect-renderer integration tests and previewing spell visuals without drawing.

**Request body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `values` | `Record<string, number>` | no | all defaults | Slider values to override. Missing keys fall back to lab defaults. |
| `element` | `string` | no | `'water'` | Element id. One of `fire`, `water`, `wind`, `earth`, `light`. |
| `activatedAt` | `number \| null` | no | `null` | Timestamp in milliseconds. Set to trigger active-spell rendering. |

**Available `values` keys:**

| Key | Default | Range | Description |
|---|---|---|---|
| `effectScale` | `1.6` | `1..2.35` | Scales the portal and particle body. |
| `force` | `0.62` | `0..1` | Speed, pressure, and overall push. |
| `spread` | `0.48` | `0..1` | Width of the emission area. |
| `focus` | `0.65` | `0..1` | Tightness of particle paths. |
| `gravity` | `1` | `0..1` | Falling vs. suspended motion. |
| `convergenceStrength` | `0` | `0..1` | Compression into a narrow stream. |
| `convergenceRadius` | `0.08` | `0.03..0.35` | Width of the compressed stream. |
| `convergenceRigidity` | `0.9` | `0..1` | How strongly particles stay on path. |
| `convergenceX` | `0` | `-1..1` | Centerline horizontal offset. |
| `convergenceY` | `0` | `-1..1` | Centerline depth offset. |
| `duration` | `5` | `0.5..8.5` | Active spell lifetime in seconds. |
| `stability` | `0.72` | `0..1` | Reduces jitter and flicker. |
| `xTiltDeg` | `0` | `-82..82` | Left/right lean. |
| `yTiltDeg` | `-42` | `-82..82` | Forward/backward lean. |
| `ringRadius` | `0.34` | `0.2..0.46` | Size of the test ring. |

**Response:**

```json
{
  "spellIR": { ... },
  "values": { ... }
}
```

`values` contains the merged defaults and your overrides, so you can inspect the full state.

**Example:**

```bash
curl -s -X POST http://localhost:5173/api/spell/effect-lab \
  -H "Content-Type: application/json" \
  -d '{
    "element": "fire",
    "values": { "force": 0.8, "spread": 0.4, "xTiltDeg": 20, "yTiltDeg": -30 }
  }' | jq .
```

---

### POST /api/spell/effect-lab/from-ir

Reverse of `/api/spell/effect-lab`. Extracts slider values from an existing `SpellIR` so you can load a real compiled spell into the Effect Lab for tweaking.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `spellIR` | `SpellIR` | yes | A `SpellIR` object from any previous response. |

**Response:**

```json
{
  "values": { ... },
  "element": "fire"
}
```

`element` may be `undefined` if the source `SpellIR` had no element set.

**Example:**

```bash
curl -s -X POST http://localhost:5173/api/spell/effect-lab/from-ir \
  -H "Content-Type: application/json" \
  -d '{"spellIR": { "element": "fire", "force": 0.8, "spread": 0.4, "stability": 0.7, ... }}' | jq .
```

---

### GET /api/spell/dictionary

Returns filtered entries from the sigil and sign dictionary.

**Query parameters:**

| Parameter | Values | Default | Description |
|---|---|---|---|
| `kind` | `sigils` \| `signs` \| `samples` \| `all` | `all` | Which entry types to return. |
| `id` | `string` | — | Return a single entry by exact id match. Case-insensitive. |
| `element` | `string` | — | Filter sigils by element. Case-insensitive. |
| `q` | `string` | — | Substring search on `id` and `name`. Case-insensitive. |

**Response:**

```json
{
  "sigils": [ ... ],
  "signs": [ ... ],
  "sampleSpells": [ ... ],
  "total": 12
}
```

**Examples:**

```bash
# All fire sigils
curl -s "http://localhost:5173/api/spell/dictionary?kind=sigils&element=fire" | jq .

# Search for anything with "column" in the name or id
curl -s "http://localhost:5173/api/spell/dictionary?q=column" | jq .

# Fetch a single entry by id
curl -s "http://localhost:5173/api/spell/dictionary?id=levitation" | jq .
```

---

## Common Types

### Stroke Formats

Endpoints that accept `strokes` support two formats:

**Normalized format** — a nested array of `{x, y}` points where all coordinates are in the `0..1` range:

```json
[
  [{"x": 0.1, "y": 0.2}, {"x": 0.5, "y": 0.8}],
  [{"x": 0.6, "y": 0.3}, {"x": 0.9, "y": 0.7}]
]
```

Coordinates are scaled to canvas pixels using `canvasWidth` and `sourceAspectRatio`.

**Structured format** — a `Stroke[]` array with explicit ids and pixel-space coordinates:

```json
[
  {
    "id": "s1",
    "points": [{"x": 120, "y": 240}, {"x": 600, "y": 960}]
  }
]
```

The server detects which format you sent by checking whether the first element of `strokes` is itself an array. Use normalized format when sending coordinates from a canvas that may have a different resolution than the server default.

### SpellIR

The compiled spell description. All plugin behavior should derive from this object.

| Field | Type | Description |
|---|---|---|
| `type` | `'SpellIR'` | Constant type tag. |
| `active` | `boolean` | `true` when the ring is closed and the spell is ready to fire. |
| `prepared` | `boolean` | `true` when a ring is open and a valid sigil is inside. |
| `valid` | `boolean` | `false` when compilation failed. Check `warnings` for the reason. |
| `status` | `string` | Human-readable status message. |
| `activatedAt` | `number \| null` | Millisecond timestamp of ring closure. `null` when not yet active. |
| `element` | `string \| null` | Primary element. One of `fire`, `water`, `wind`, `earth`, `light`. `null` on invalid spells. |
| `elementConfidence` | `number` | Recognizer confidence for the primary sigil. `0..1`. |
| `primarySizeNorm` | `number` | Normalized size of the primary sigil relative to the ring. |
| `effectScale` | `number` | Computed visual scale for the spell effect. |
| `primaryManifestation` | `string` | The dominant sign behavior. `'none'` on invalid spells. |
| `manifestations` | `Record<string, Manifestation>` | All active manifestations and their parameters. |
| `direction` | `SpellDirection` | 3-D spell direction vector. |
| `directionCoherence` | `number` | How strongly the signs agree on a direction. `0..1`. |
| `gravity` | `number` | `1` = full gravity, `0` = full levitation. |
| `force` | `number` | Speed and push intensity. `0..1`. |
| `spread` | `number` | Emission area width. `0..1`. |
| `focus` | `number` | Particle path tightness. `0..1`. |
| `range` | `number` | Spell reach. `0..1`. |
| `duration` | `number` | Active spell lifetime in seconds. |
| `stability` | `number` | Resistance to jitter and flicker. `0..1`. |
| `quality` | `number` | Overall drawing quality. `0..1`. |
| `neatness` | `number` | Drawing cleanliness. `0..1`. |
| `warnings` | `string[]` | Parser and compiler warning codes. See warning codes below. |
| `signature` | `string` | Deterministic string that changes when the spell output changes. Use for change detection. |

**Warning codes:**

| Code | Meaning |
|---|---|
| `ring_incomplete` | The ring has not been closed. |
| `missing_primary_sigil` | No sigil was recognized inside the ring. |
| `primary_sigil_confidence_low` | The best sigil match fell below the confidence threshold. |
| `primary_sigil_ambiguous` | Two sigils scored too close to each other to pick one. |
| `primary_element_missing` | The recognized sigil has no element defined. |
| `primary_element_unsupported` | The element is not in the supported set. |
| `symbol_contaminated` | A candidate overlaps the primary sigil in a way that degrades recognition. |
| `symbol_ambiguous` | A candidate scored roughly equally against multiple dictionary entries. |
| `symbol_messy` | A recognized symbol had low neatness. |
| `symbol_near_layer_boundary` | A symbol sits on the border between ring layers. |
| `center_unknown_contamination` | An unrecognized stroke sits near the sigil in the center zone. |
| `unsupported_multiple_rings` | More than one ring was detected. |
| `unsupported_multiple_sigils` | More than one sigil was recognized. |

### GlyphAST

The intermediate representation from the parser. Contains everything the compiler saw before producing the `SpellIR`.

| Field | Type | Description |
|---|---|---|
| `type` | `'GlyphAST'` | Constant type tag. |
| `version` | `string` | AST schema version. |
| `ring` | `Ring` | Detected ring geometry and metrics. |
| `candidates` | `Candidate[]` | All symbol candidates before recognition. |
| `primarySigil` | `Recognition \| null` | The recognized primary sigil. `null` if none found. |
| `signs` | `Recognition[]` | All recognized signs. |
| `unknowns` | `Unknown[]` | Candidates that could not be reliably recognized. |
| `globalMetrics` | `GlobalMetrics` | Drawing-wide metrics: neatness, radial symmetry, instability. |
| `warnings` | `string[]` | Same warning codes as `SpellIR.warnings`. |

### SpellDirection

A normalized 3-D direction vector for the spell effect.

| Field | Type | Description |
|---|---|---|
| `x` | `number` | Left/right component. Negative is left. |
| `y` | `number` | Up/down component. Negative is up. |
| `z` | `number` | Forward component. `1` is straight forward. |
| `xTiltDeg` | `number` | Left/right tilt in degrees. |
| `yTiltDeg` | `number` | Forward/backward tilt in degrees. |
| `tiltFromZDeg` | `number` | Total tilt away from the forward axis. |

---

## Error Responses

All endpoints return a JSON error body on failure.

**400 Bad Request** — missing or invalid input:

```json
{ "error": "strokes array required" }
```

**500 Internal Server Error** — unexpected server error:

```json
{ "error": "TypeError: Cannot read properties of undefined" }
```

If you receive a `{"message":"Internal Error"}` response from SvelteKit instead of a JSON error body, the handler threw before reaching the try/catch. Check the dev server terminal for the full stack trace.

---

## Testing Notes

After setting up the route files, test each endpoint in order:

1. Start the dev server with `npm run dev`.
2. Run the curl commands from this document.
3. Pipe responses through `jq .` to confirm valid JSON.
4. Check the dev server terminal for any `[500]` lines with stack traces.

If `POST /api/spell` returns `{"message":"Internal Error"}`:

- Check the terminal for `Invalid export` errors — named exports other than HTTP verbs are not allowed in SvelteKit `+server.ts` files.
- Verify that `_handlers.ts` imports resolve. The `$lib/tools/` path assumes `spellEffectLab.ts` and `sigilDetector.ts` live at `src/lib/tools/`. Adjust if your project uses a different folder name.

If recognition always returns low confidence:

- Check that `canvasWidth` and `sourceAspectRatio` match the actual canvas the strokes were drawn on.
- Try the normalized `0..1` stroke format to avoid coordinate mismatch.
- Use `POST /api/spell/analyze` to score a single symbol in isolation and inspect the `matches` array.