> **Superseded (2026-08-22).** Stages 1 and 2 shipped in a different shape, and
> stages 3 and 4 were never built as described. The current plan is
> [`animation-redesign.md`](animation-redesign.md) with
> [`animation-spec.md`](animation-spec.md). Kept for history.

This information is accurate as of 18/06/2026
Big shoutout to **@Einlar** for actively contributing to project planning so far.

**Disclaimer:** we may skip step 1 and 2 of the plan entirely, as we may replace drawing with drag & drop symbols and sigils. In an extreme case, we may scrap this plan entirely if we deem that it is too difficult to replicate the spell logic from the anime/manga... but hopefully this doesn't happen.

Anyways, here is the rough plan for the spell drawing → animation pipeline

# 1. Drawing

The drawing system captures spell diagrams as ordered vector strokes on an HTML canvas. A stroke is one continuous pointer gesture: the user presses down, moves across the canvas, and releases. While the pointer is down, the app shows a live preview. When the pointer is released, the preview is checked and saved as a permanent stroke.

Each freehand point stores:

- `x` and `y`: the point's position on the canvas.
- `t`: the timestamp for the point.

The recognizer mainly relies on point positions, timestamps, and stroke order.

The app does not keep every raw pointer event. It only adds a new point when the pointer has moved far enough from the previous point. This keeps tiny movements from adding noise. When the pointer is released, the stroke is only accepted if it has at least two points and is long enough to count as intentional drawing.

Committed strokes are stored as objects with:

- `id`: a generated stroke id, such as `s1`, `s2`, or `s3`.
- `points`: the ordered list of captured points.
- `startedAt` and `endedAt`: timestamps from the first and last point.
- `pointerType`: when available, whether the stroke came from mouse, touch, pen, or an unknown pointer type.

Each saved freehand stroke becomes its own canvas scene entity. This lets the app render the ink, undo and redo individual strokes, resize strokes with the canvas, and send the same stroke data into the recognition pipeline.

The app can also create strokes from arranged shapes. When the user places a ring, sigil, or sign from the Shapes palette, the shape starts as an editable object with position, scale, elongation, and rotation controls. When Arrange Shapes is turned off, those shapes are baked into normal ink strokes by converting their template points into canvas coordinates. After baking, the parser treats those generated strokes the same way it treats freehand strokes.

Drawing input is intentionally stroke-based. Candidate grouping and recognition work on whole strokes. The current parser does not split one continuous stroke into separate symbol fragments. If two symbols are drawn without lifting the pointer, they may be treated as one candidate.

# 2. Recognition

Recognition turns the captured strokes into parser facts. It detects the main spell ring, groups the non-ring strokes into possible symbols, and tries to identify each group as a sigil, sign, or unknown mark.

This stage still does not decide what the spell does. It only describes what the drawing appears to contain. Spell meaning is handled later by the parser and compiler.

The current recognition flow is:

1. Clean the raw strokes and remove tiny/noisy input.
2. Detect the enclosing ring and record its center, radius, completeness, neatness, and source `strokeIds`.
3. Remove ring strokes from symbol recognition.
4. Group the remaining strokes into `SymbolCandidate` objects.
5. Score each candidate against sigil and sign recognition examples.
6. Return recognized symbols, unknown marks, diagnostics, and a `GlyphAST`.

A simplified recognition result looks like this:

```ts
type Recognition = {
	candidateId: string;
	strokeIds: string[];
	kind: 'sigil' | 'sign' | 'unknown';
	id: string | null;
	recognized: boolean;
	confidence: number;
	recognitionStatus: 'valid' | 'valid_messy' | 'ambiguous' | 'contaminated' | 'unknown';
	layer: 'center' | 'middle' | 'outer' | 'outside' | 'ringBoundary' | 'any';
	angleDeg: number;
	sizeNorm: number;
	lengthNorm: number;
	neatness: number;
};
```

The recognizer uses a hybrid approach:

- `$P`-style point-cloud matching compares the candidate's normalized point cloud against known examples. This is fast and works well with stroke-based input.
- Chamfer matching compares the user's ink against template ink using distance maps. This makes the matcher more tolerant of wobble, small shifts, and uneven drawing.
- Structural checks compare stroke count, stroke-length profile, aspect ratio, curve character, layer fit, size, and neatness.
- The browser ML recognizer can reinforce, accept, or override the template result when the static ONNX model is available.

The hardest part is still decomposition: deciding which strokes belong together before recognition starts. The app handles this by grouping whole strokes by affinity. For complete rings, it runs a recognition-guided partition search to separate close or touching symbols and keep detached marks with their glyph. The current parser does not split a single continuous stroke into multiple symbol fragments.

Runtime recognition does not query the database. Template examples come from the in-repo dictionary by default, and the browser ML model is loaded from static model files. The labelled handwriting samples collected from users are used offline to train the model.

# 3. Graphing

Converts recognised parts into nodes and edges.
Individual symbols/sigils are nodes, edges capture the relationships between them.

Example:

```ts
type SpellNode =
	| { type: 'ring'; id: string; center: Vec2; radius: number; closedness: number }
	| {
			type: 'sigil';
			id: string;
			kind: 'fire' | 'water' | 'earth' | 'wind' | 'light';
			confidence: number;
	  }
	| { type: 'sign'; id: string; kind: string; confidence: number; orientation: number };

type SpellEdge =
	| { type: 'contains'; from: string; to: string; confidence: number }
	| { type: 'centeredIn'; from: string; to: string; confidence: number }
	| { type: 'surrounds'; from: string; to: string; confidence: number }
	| { type: 'pointsToward'; from: string; to: string; confidence: number }
	| { type: 'linkedTo'; from: string; to: string; confidence: number };
```

The graph does not decide what the spell does. It only records spatial facts. Using a graph allows us to represent the 2-dimensional structure of the drawing using objects.

# 4. Parsing

While the graph contains spatial facts, parser turns those facts into spell meaning.
The parser applies rules such as:

```text
closed ring + centred sigil = active spell circle
incomplete ring + centred sigil = incomplete spell
direction sign pointing outward = outward manifestation
direction sign pointing inward = inward manifestation
ring inside ring = nested spell circle
```

which either rejects the spell because it's incomplete, or it converts it into `EffectIR`.

The parser will give us something like:

```ts
const ast = {
	type: 'nested-glyph',
	inner: {
		element: 'fire',
		manifestation: 'outward'
	},
	outer: {
		element: 'wind',
		manifestation: 'clockwise'
	},
	relationship: 'channels'
};
```

so that now we have linearly processable information. This will need to be converted to either something like three.js (3D web graphics) or piped into a game engine. This will be discussed later.
