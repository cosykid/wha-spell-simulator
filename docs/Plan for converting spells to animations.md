This information is accurate as of 31/05/2026
Big shoutout to **@Einlar** for actively contributing to project planning so far.

**Disclaimer:** we may skip step 1 and 2 of the plan entirely, as we may replace drawing with drag & drop symbols and sigils. In an extreme case, we may scrap this plan entirely if we deem that it is too difficult to replicate the spell logic from the anime/manga... but hopefully this doesn't happen.

Anyways, here is the rough plan for the spell drawing → animation pipeline

# 1. Drawing

Capture strokes as vectors.

# 2. Recognition

Detect rings, sigils, signs, connectors, and other symbols.
Currently deciding on whether to use pre-built libraries for this or use AI.

```ts
type RecognisedSymbol = {
	id: string;
	type: 'ring' | 'sigil' | 'symbol' | 'unknown';
	strokeIds: string[];
	confidence: number;
};
```

Don't interpret the spell yet. It should only say what each drawn element appears to be.

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
