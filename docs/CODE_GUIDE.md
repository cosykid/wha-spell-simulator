# Code Guide

> **The core rule:** code should be written to minimize the time it takes for
> _someone else_ to understand it. Every other rule in this document is a
> specific application of that one. When a guideline and the core rule seem to
> conflict, the core rule wins.

This guide uses real excerpts from this repository. The "good" examples are
patterns already in the codebase worth copying. The "avoid" examples are real
code we are actively refactoring away from. Quote a file path when you discuss a
pattern so the reader can go look.

---

## Rule 1: Keep files small (aim for < 200-300 lines)

A file you can read top-to-bottom in one sitting is a file you can hold in your
head. Past ~300 lines, a reader can no longer see the whole thing at once and
has to keep a mental map of "what else is in here." **When a file grows past
that, stop and look for a seam to split along.**

### Good: one concept per file

[`src/lib/ui/canvas/entities/strokeEntity.ts`](../src/lib/ui/canvas/entities/strokeEntity.ts)
is 71 lines and answers exactly one question: "how does an ink stroke draw and
scale itself?" Its neighbours (`paperEntity.ts`, `gridEntity.ts`,
`symbolEntity.ts`) each do the same for their own concept. You can open any one
of them and be done reading in under a minute.

```ts
// strokeEntity.ts: named constants up top, one exported concept, ~70 lines
const INK_LINE_WIDTH = 4.4;
const COMMITTED_ALPHA = 0.94;

export function makeStrokeEntity(stroke: Stroke, z = 0): StrokeEntity {
	/* ... */
}
export function isStrokeEntity(entity: { id: string }): entity is StrokeEntity {
	/* ... */
}
```

### Avoid: the god-file

These files have grown past the point where anyone can keep them in their head:

| File                                                                          | Lines | What it mixes                                                                                             |
| ----------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| [`src/routes/+page.svelte`](../src/routes/+page.svelte)                       | 1277  | pan, zoom, undo/redo, shape-drag, eraser, recompute pipeline, diagnostics, prefs, keyboard, full template |
| [`src/lib/parser/mlRecognizer.ts`](../src/lib/parser/mlRecognizer.ts)         | 1082  | 37 functions behind 6 exports                                                                             |
| [`src/lib/parser/symbolRecognizer.ts`](../src/lib/parser/symbolRecognizer.ts) | 1046  | 28 functions behind 3 exports                                                                             |

A useful tell: in `symbolRecognizer.ts`, **28 functions hide behind 3 exports.**
The other 25 are implementation detail that the file's reader has to wade
through to find the 3 that matter. That ratio is the signal to split. Group the
private helpers by what they serve (for example template scoring, region
heuristics, feature extraction) and move each group to its own file with its own
small public surface.

### How to split

- **Split by responsibility, not by line count.** Don't cut a 600-line file at
  line 300. Find the two _things_ it does and give each a file.
- **Extract pure helpers first.** Geometry, scoring, and formatting functions
  with no state are the easiest, safest things to lift out. See
  [`src/lib/utils/geometry.ts`](../src/lib/utils/geometry.ts), which is exactly
  the shared-helper file the recognizers should lean on more.
- **A long inline object/function is a file waiting to happen.** `buildDiagnostics()`
  in `+page.svelte` is a ~70-line function that assembles one nested object
  literal. That is a `buildDiagnostics(...)` helper in its own module, called in
  one line from the page.

---

## Rule 2: Provide a clear path to understanding

This is Rule 1's reason for existing. Splitting files only helps if the split
leaves a **natural guide for code exploration**: the entry point shows the
high-level shape, and the details live one click away, each behind a name that
tells you whether you need to open it.

> When you open a route's `+page.svelte`, you should see the page's _architecture_
> (a header, a control panel, a canvas, a dictionary sidebar) and the high-level
> logic that wires them together. To learn how the canvas handles a drag, you
> open the canvas file. The entry point is a table of contents, not the whole
> book.

### Good: the entry point describes itself

[`src/lib/ui/canvas/Canvas.svelte`](../src/lib/ui/canvas/Canvas.svelte) opens
with a `@component` doc block that states what it is, shows a runnable usage
example, and names its three collaborators (`scene`, `controller`, `onFrame`).
Its body is then tiny (it renders a scene and forwards input) because the real
work lives in named places the doc points you to:

```svelte
<!--
@component
A canvas surface that renders a `Scene` (a z-ordered list of self-drawing
entities) and forwards pointer input to an active tool.

<Canvas {scene} controller={tool} />
-->
```

The architecture is legible from three files you can read in five minutes total:

- [`entity.ts`](../src/lib/ui/canvas/entity.ts): _"an Entity is something that can
  be drawn. All drawing logic goes in its `render()` method."_ (39 lines)
- [`scene.svelte.ts`](../src/lib/ui/canvas/scene.svelte.ts): _"a Scene is a
  z-ordered list of Entities with a command-based undo/redo history."_ (94 lines)
- `tools/`: one file per interaction mode (`drawTool`, `selectTool`).

You can answer "how does undo work here?" without reading a single line of
rendering code, because the concepts are separated and each is named.

### Avoid: the entry point that buries the architecture

Open [`src/routes/+page.svelte`](../src/routes/+page.svelte) and the first ~800
lines are imperative machinery: `startPan`/`handlePanMove`/`endPan`,
`pushHistory`/`scaleSnapshot`/`restore`, `beginShapeDrag`/`handleShapeDragMove`,
eraser wiring, the recompute sequence guard. The page's actual structure (a
header, a control panel, a canvas, a dictionary sidebar) doesn't appear until
the template at line ~988, and even there it's interleaved with hundreds of
lines of hand-inlined SVG icon paths.

A reader who just wants to know "what is on this page and how do the parts fit
together" has to scroll past everything to find out. The fix is to make the file
read like its own outline:

- Lift each self-contained behaviour into a module or hook: **pan/zoom**,
  **undo/redo history**, **shape drag-and-drop**, **diagnostics assembly**,
  **toggle-preference persistence**. The page _coordinates_ them. It shouldn't
  _contain_ them.
- Extract repeated inline SVG icons (undo, redo, clear, arrange, eraser, pan)
  into small icon components. The template should show _what_ each button is,
  not 8 lines of `<path d="...">`.
- The goal: a `+page.svelte` whose script is mostly wiring and whose template
  reads as `<Header/> <ControlPanel/> <CanvasPanel/> <DictionarySidebar/>`.

> **Note: there are two canvas systems in this repo.** The main route still
> drives the canvas imperatively through `CanvasRenderer` + raw
> `glyphCanvas`/`effectCanvas`, while [`src/lib/ui/canvas/`](../src/lib/ui/canvas/)
> is the cleaner entity/scene/tool model the tools were built on. New canvas
> work should move toward the entity model, not extend the imperative one.

---

## Rule 3: Build pages as a hierarchy of components

Rules 1 and 2 are about splitting files. This is how you split a _UI_ file. A
page should be a shallow tree of components, not one flat slab of markup and
state. Every component you extract makes the parent shorter, gives a chunk of UI
a name, and creates another self-contained unit a reader can understand in
isolation. This is code-splitting, applied to the interface.

**Extract a component when:**

- **The UI repeats or is structural.** Layout chrome like a header, footer,
  sidebar, or toolbar. This page already does this well: its template is
  `<Header/>`, `<ControlPanel/>`, `<ShapePalette/>`, `<Diagnostics/>`,
  `<DictionaryReference/>`, each a named box instead of inline markup. That is
  the shape the _whole_ page should have.
- **A section of logic is self-contained.** A cluster of UI plus the handlers
  and state that only it uses. Give it a name and a file.

### The heuristic: follow the reactive state

The clearest signal lives in your `$state`/`$derived` variables. **Scan each one
and ask "where is this read?"** If a subset of variables is touched only inside
one chunk of the template (plus that chunk's handlers), that chunk wants to be a
component, and the state should move _into_ it, shrinking the parent's script
and template at once.

[`src/routes/+page.svelte`](../src/routes/+page.svelte) is the worked example.
Its ~30 top-level reactive variables are not all page-level concerns. Several
are local clusters hiding in the global scope:

| Cluster           | State that serves only it                                                           | Markup it drives                                                     |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Drag preview**  | `dragPreview`, `shapeDragPointerId`, `draggedShape` + `shapePreviewPoints()`        | the `{#if dragPreview}` overlay at the bottom                        |
| **Zoom controls** | `zoomLevel` + `handleZoomIn/Out`, `ZOOM_*` constants                                | the `<div class="zoom-controls">` buttons + the `scale()` transforms |
| **Pan**           | `panEnabled`, `panX/Y`, the four `panStart*` vars + `startPan/handlePanMove/endPan` | the `canvas-container` pointer handlers + pan toggle                 |

The drag-preview cluster is the textbook case: a piece of state, a helper that
only it calls, and a block of markup nobody else touches. That is a
`<ShapeDragOverlay>` component, and lifting it deletes four things from the page
at once. (Pan is a partial case: extracting it surfaces that `panEnabled` is
also read by `setTool` and the cursor effect. That's a feature. The extraction
shows you exactly where the real coupling is, instead of letting it hide.)

### Keep the tree shallow and the boundaries clean

- **Pass data down through typed `Props`, raise events up through callbacks.**
  This is the way the page already talks to `<ShapePalette>` (`onDragStart`,
  `onChange`, `onCommit`). A component's `Props` interface _is_ its contract.
  Keep it small.
- **Don't extract for its own sake.** A three-line block used once, with no
  state of its own, is not a component. It's a line of markup. Extract around a
  _cluster of state + behaviour_, not around arbitrary line counts.

---

## Rule 4: Styles live with the component

A component should own its CSS. When you extract a chunk of UI (Rule 3), its
styles come with it, in the component's own `<style>` block, which Svelte scopes
automatically so the rules can't leak. The payoff matches the core rule: the
styling for a piece of UI sits right next to its markup, deleting the component
deletes its CSS, and you can change it without scanning a giant shared file or
fearing you'll break another page.

**Global CSS is only for things that are truly global:** design tokens (colors,
font sizes, spacing), the reset, and base element styling. Everything that
targets one page's specific markup belongs in that page or component, not the
global sheet.

### Good: a clear split

The top of [`src/lib/styles/styles.css`](../src/lib/styles/styles.css) is exactly
what global CSS should hold: the `:root` design tokens and the reset, the things
every component legitimately shares:

```css
:root {
	--ink: #20302f;
	--paper: #e7dab4;
	--radius: 8px;
}
* {
	box-sizing: border-box;
}
```

[`src/lib/ui/canvas/Canvas.svelte`](../src/lib/ui/canvas/Canvas.svelte) then owns
its own layout in a scoped `<style>`, reaching into the global layer only through
those tokens:

```svelte
<style>
	.canvas-surface {
		aspect-ratio: var(--canvas-aspect, 1 / 1);
		background: var(--paper); /* shared token, local rule */
	}
</style>
```

`.canvas-surface` can't collide with anything. It exists only where it's used.

### Avoid: page styles in the global sheet

[`src/routes/+page.svelte`](../src/routes/+page.svelte) has **no `<style>` block
at all.** Every class it uses (`canvas-shell`, `zoom-controls`, `workspace`,
`canvas-hint`, and so on) is declared in the 1500-line global
[`styles.css`](../src/lib/styles/styles.css). The cost:

- To understand or tweak the canvas panel you read its markup in one file and
  hunt its styles in a 1500-line file 20 directories away.
- `zoom-controls` is global, so touching it _could_ affect anything. You have to
  prove it doesn't before you change it.
- When the page's UI is split into components (Rules 1-3), the CSS doesn't come
  along, so the global sheet just keeps growing.

The fix tracks the component split: as each section of `+page.svelte` becomes a
component, move its rules out of `styles.css` into that component's `<style>`,
and leave behind only the tokens and reset.

### Rules of thumb

- **Lean on Svelte's scoping.** A plain `<style>` block is already scoped to the
  component, so you rarely need `:global(...)`. Reach for `:global` only
  deliberately, and leave a comment saying why.
- **A class used in exactly one component's markup belongs in that component.**
  If you're adding a selector to `styles.css`, ask "is this genuinely shared, or
  am I just putting it where the old code did?"
- **Share through tokens, not shared classes.** Need a consistent color, gap, or
  radius? Use a `var(--token)`, not a global utility class copied across pages.

---

## Rule 5: Decouple concerns behind small contracts

The previous rules split code into smaller pieces. This one is about how the
pieces _talk_ so that splitting actually reduces complexity instead of just
scattering it. The goal is **separation of concerns**: each part owns one job and
collaborates through a small, named interface. You add a feature by plugging in a
new piece, not by editing the machinery that everything else depends on.

### Own the "what", and let the framework own the "how" and "when"

The canvas subsystem in [`src/lib/ui/canvas/`](../src/lib/ui/canvas/) is the model
to copy. A page says _what_ to draw. `Canvas.svelte` owns _how_ and _when_ the
frame is produced. Setting up an initial scene is two lines:

```ts
const scene = createScene([paperEntity(), gridEntity(REFERENCE_SIZE)]);
```

```svelte
<Canvas {scene} />
```

The page never writes an animation loop, never touches a 2D context. That is
**inversion of control**: the framework calls your code, not the other way
around. It is what lets a feature file stay short, because the file only contains
intent.

This works because the subsystem is built from three tiny contracts, each a
textbook pattern. The pattern names matter. They are free documentation. A reader
who recognizes "Command" knows how undo works before reading a line of it.

| Contract                                                   | Interface            | Pattern                                                         | What it buys you                                                    |
| ---------------------------------------------------------- | -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`Entity`](../src/lib/ui/canvas/entity.ts)                 | `render(ctx, t)`     | [Composite](https://refactoring.guru/design-patterns/composite) | add a visual by writing a `render()`, never edit a central renderer |
| [`Command`](../src/lib/ui/canvas/commands.ts)              | `do()` / `undo()`    | [Command](https://refactoring.guru/design-patterns/command)     | any action becomes undoable, uniformly                              |
| [`CanvasBehavior`](../src/lib/ui/canvas/canvasBehavior.ts) | `attach` / `render?` | [Strategy](https://refactoring.guru/design-patterns/strategy)   | swap interaction modes (draw / select) without `if`-soup            |

**Composite: each entity draws itself.** The scene just iterates and calls
`render()`. Adding a new kind of visual means writing a new entity, with zero
changes to the renderer:

```ts
// scene.svelte.ts: the renderer knows nothing about *what* it draws
render(ctx, timestamp) {
	for (const entity of entities) entity.render(ctx, timestamp);
}
```

**Command: actions know how to undo themselves.** Undo/redo lives in one place,
the scene's stacks. A feature only has to describe its action as a `do`/`undo`
pair and hand it over with `scene.do(...)`:

```ts
// commands.ts
export function addEntity(scene: Scene, entity: Entity): Command {
	return { label: 'add', do: () => scene.add(entity), undo: () => scene.remove(entity.id) };
}
// sample-maker: placing a symbol becomes undoable for free
scene.do(addEntity(scene, makeSymbolEntity(placement, 10, 7)));
```

**Strategy: an interaction mode is a swappable object.** A tool (`drawTool`,
`selectTool`) packages its own listeners and overlay rendering behind
`CanvasBehavior`. Switching modes is reassigning a variable, not branching
through the canvas internals:

```ts
const tool = $derived<CanvasBehavior>(mode === 'draw' ? draw : select);
```

```svelte
<Canvas {scene} controller={tool} />
```

### Why this beats the imperative alternative

The counter-example is, again, [`src/routes/+page.svelte`](../src/routes/+page.svelte).
It orchestrates undo/redo history, rendering, _and_ the animation loop in one
file, so every part is wired directly to every other. To add a feature you must
first understand the whole thing, and the odds of breaking something unrelated
climb with each line. With the contracts above, a new feature is a new `Entity`,
`Command`, or `CanvasBehavior`, written and understood on its own, leaving the
shared machinery untouched.

### Reach for a pattern when it earns its keep

These patterns pay off here because the requirements genuinely call for them:
many things to draw, real undo/redo, multiple interaction modes. **Don't apply a
pattern speculatively.** A `Command` interface for an action that will never be
undone, or a Strategy with exactly one strategy, adds indirection without buying
decoupling. That is just a longer path to understanding, which violates the core
rule. Introduce the abstraction when the second case actually arrives, and when
you do, name the pattern so the next reader gets it for free.

---

## Rule 6: Comment to guide the reader, sparingly

**Comments are an escape hatch.** The first goal is code that explains itself
through good names and small pieces (Rules 1 to 5). When that is not enough, a
comment fills the gap. So write comments, but earn each one, and keep it short.

Annotate code with simple, direct sentences that carry the reader through the
intent and the consequences of the code. The job of a comment is to cut the
effort needed to understand what a section does and why. Write the style to
match: plain sentences, no em dashes, no semicolons, nothing the reader has to
parse twice.

### Comments follow a hierarchy

Ease the reader in from the top. Each level says only what its level needs, and
pushes detail down to the next one. Do not explain pinch-zoom math in a file
header.

1. **File level** (`@file` / `@component`): one or two sentences on what the
   module is for. Aim to answer "what should I expect to find here, and what
   should I add here?"
2. **Function / method docstrings**: what it does and why you would call it. Stay
   high-level. Leave the mechanics to the body.
3. **Inline comments**: the local "why" next to the line it explains. This is
   where implementation detail and tricky reasoning live.

### File level: `@file` and `@component`

[`src/lib/structures/labelledSample.ts`](../src/lib/structures/labelledSample.ts)
opens with an `@file` that sets expectations and folds in the business rules a
newcomer needs (coordinates are canvas-relative, strokes are stored raw, the
schema is versioned):

```ts
/**
 * @file A labelled handwriting sample, used for training/testing recognition of a
 * single sign or sigil. Includes raw stroke data plus the human-asserted label.
 *
 * Strokes are stored RAW, with enough metadata to reconstruct the sample even if
 * conventions later change. The schema is versioned to allow breaking changes.
 */
```

For components, `@component` does the same and shows how to use it. See the
header of [`Canvas.svelte`](../src/lib/ui/canvas/Canvas.svelte): one sentence on
what it is, then a runnable snippet.

### Function level: docstrings, with `@example` for public API

Every non-trivial function gets a docstring that describes intent, not
implementation. [`createDrawTool`](../src/lib/ui/canvas/tools/drawTool.svelte.ts)
is the model: the docstring says what the tool does at a high level, and the
gnarly pinch-zoom focal-point math stays in inline comments down in the body
where it belongs.

```ts
/**
 * Captures freehand pointer input and commits each finished stroke to the scene
 * as a StrokeEntity, so it joins the shared undo history. The in-progress stroke
 * is drawn as a transient overlay.
 */
export function createDrawTool(scene: Scene): DrawTool {
	/* ... */
}
```

**Public API earns an `@example`.** Anything meant to be reused (reusable
components, exported helpers in `$lib`) shows a caller how to use it.
[`resizeCanvas`](../src/lib/ui/canvas/actions/resize.svelte.ts) does this well:

````ts
/**
 * Keep a canvas's size in sync with its shell container.
 *
 * @example
 * ```svelte
 * <canvas {@attach resizeCanvas({ shell, onResized: handleResize })} />
 * ```
 */
````

### Inline comments: the local "why" and business rules

The best inline comments capture a constraint you cannot recover from the code.
A standout lives in `+page.svelte` (a file we otherwise want to break up), where
one comment explains a non-obvious failure mode:

```ts
// `$state` proxies are not structured-cloneable, so posting the reactive value
// directly throws DataCloneError and silently drops every recognition. Snapshot
// once per load so the workers keep their cached dictionary.
let dictionarySnapshot: Dictionary | null = null;
```

Include business rules wherever they give needed context. A reader should not
have to guess why a `0.86` threshold exists or why strokes are kept raw.

### Keep comments self-contained, and point with `@link`/`@see`

A comment should stand on its own. A developer who lands on it cold should
understand it without hunting for another comment first. Do not write "see the
note above." When you need to point somewhere, use a real reference: `{@link
Scene}` (as [`commands.ts`](../src/lib/ui/canvas/commands.ts) does) or `@see`,
so the pointer is precise and survives the code moving around.

### Avoid

- **Restating the code.** `// increment i` adds nothing. Comment the why, not the
  what.
- **Implementation detail in a docstring.** If the docstring describes _how_, it
  will rot the first time the body changes. Keep how-detail inline.
- **Comments that lean on other comments.** Each should be legible alone.
- **Long, clause-heavy sentences.** Two short sentences beat one long one stuffed
  with commas.

---

## Rule 7: Name things in the language of the domain

Good names are the cheapest documentation there is. Rule 6 made comments a
fallback. Names are the first line of defense, because a reader who understands a
name does not need the comment at all.

- **Reveal intent.** A name should say what the thing is or what it does. If you
  need a comment to explain what a variable holds, rename the variable instead.
- **Speak one vocabulary.** This domain has a precise language: sigil, sign,
  ring, glyph, stroke, placement, recognition, candidate, plus the canvas terms
  entity, scene, command, behavior, and tool. Use the same word for the same
  concept everywhere. [`types.ts`](../src/lib/types.ts) is the shared dictionary
  for these nouns. When you reach for a synonym ("item", "shape", "thing") for a
  concept that already has a name, you force the reader to work out that the two
  are the same thing.
- **Match the altitude.** High-level code should read in domain words
  (`compileSpell`, `recognizeCandidates`). Low-level helpers can be mechanical
  (`clamp`, `distance`). Do not leak low-level names upward.

A short, honest name beats a long one that hedges. Keep it searchable and
consistent with the rest of the file.

---

## Rule 8: Keep state minimal, derive the rest

State is the hardest thing to reason about, so keep as little of it as you can
and let everything else follow from it automatically.

- **Simple state lives in the component.** A plain `$state` in the component is
  the right default for local UI state.
- **Complex or shared state moves to a `.svelte.ts` module.** Once a piece of
  state starts referencing other state, or more than one component needs it,
  encapsulate the logic behind a small API in its own `.svelte.ts` file. The repo
  already does this well: [`scene.svelte.ts`](../src/lib/ui/canvas/scene.svelte.ts)
  (entities plus undo history),
  [`arrayWithHistory.svelte.ts`](../src/lib/structures/arrayWithHistory.svelte.ts),
  and [`persistedState.svelte.ts`](../src/lib/persistedState.svelte.ts). For state
  shared down a tree, reach for the Context API instead of prop-drilling (see
  `getScene`/`setScene` built on `createContext` in `scene.svelte.ts`).
- **A pure function of state is a `$derived`, never a synced `$state`.** If a
  value is computed from other reactive values, declare it with `$derived` (or
  `$derived.by` for multi-line logic). Do not keep a separate `$state` and
  reassign it whenever the inputs change.
- **Use `$effect` very sparingly.** An effect is for genuine side-effects:
  drawing to a canvas, async or network work, third-party libraries, imperative
  DOM updates. It is not for keeping one piece of state in sync with another. The
  official Svelte guidance is blunt: "avoid using it to synchronise state." Before
  writing an effect, check whether a `$derived` does the job.
- **"I need to reassign it" is not a reason to avoid `$derived`.** As of Svelte
  5.25 a derived can be overridden by direct assignment. That is exactly how you
  build optimistic UI: derive from the source of truth, bump the value locally
  for instant feedback, then let the next dependency change reconcile it.

Good: `const tool = $derived(mode === 'draw' ? draw : select)` in the
[Canvas usage](../src/lib/ui/canvas/Canvas.svelte#L20).

Avoid: a value kept in sync by hand. The tell is calling the same
compute-and-assign after every mutation. In
[`+page.svelte`](../src/routes/+page.svelte), `summary` is a `$state` reassigned
through `computeSummary(...)` in five different handlers. The deeper smell is that
its inputs (the pipeline, the stroke store) are imperative variables rather than
`$state`, which is what forces the manual resync. When you catch yourself
re-running a function to keep a variable current, that variable wants to be a
`$derived` and its inputs want to be `$state`.

---

## Rule 9: Push complex logic into pure functions, and test the seams

The most testable code and the most understandable code are the same code: pure
functions. A pure function takes inputs and returns outputs with no DOM, no
runes, no IO. You can read it in isolation, and you can unit-test it without a
browser.

- **Push complex logic out of components into pure modules.** The hard parts of
  this app already live this way: recognition
  ([`symbolRecognizer.ts`](../src/lib/parser/symbolRecognizer.ts),
  [`ringDetector.ts`](../src/lib/parser/ringDetector.ts)), compilation
  ([`spellBuilder.ts`](../src/lib/compiler/spellBuilder.ts),
  [`semanticRules.ts`](../src/lib/compiler/semanticRules.ts)), and geometry
  ([`geometry.ts`](../src/lib/utils/geometry.ts)) are pure transforms. That is
  why [`tests/`](../tests/) can cover them directly with the unit runner
  (`npm run test:unit`), as in `spellBuilder.test.ts`, `ringDetector.test.ts`,
  and `strokeErase.test.ts`.
- **If logic is hard to test, that is a design signal.** Logic you cannot
  unit-test because it is tangled with the DOM is logic in the wrong place.
  Extract the pure core, test that, and leave a thin imperative shell around it.
- **Test the UI through test IDs and Playwright.** Components carry `data-testid`
  hooks (`canvas-shell`, `undo-button`, `glyph-canvas`, and so on), and the E2E
  specs in [`tests-e2e/`](../tests-e2e/) drive the real app through them
  (`eraser.e2e.ts`, `fire-shoot.e2e.ts`). Unit tests prove the logic is correct.
  E2E tests prove the wired-up UI actually works.
- **New complex behaviour ships with a unit test for its pure core**, plus a
  `data-testid` and E2E coverage when it adds UI worth asserting on.

---

## Supporting conventions

These are smaller habits, all already present somewhere in the codebase, that
serve the core rule. Copy them.

### Name your constants

Numbers get names at the top of the file: `INK_LINE_WIDTH`, `COMMITTED_ALPHA`
(`strokeEntity.ts`), `RECOGNITION_AMBIGUITY_GAP`, `SIMPLE_SIGN_STROKE_LIMIT`
(`symbolRecognizer.ts`). A named constant tells the next reader what a magic
number _means_. An inline `0.94` makes them guess.

### One source of truth

When logic is shared, say so and share it. `renderStrokeInk()` in
`strokeEntity.ts` carries the note _"shared by the main renderer, the stroke
entity, and the draw-tool preview so there is one source of truth for ink."_
Duplicated logic is a future bug where one copy gets fixed and the others don't.

### Use the path aliases

Import via `$lib`, `$config`, and `$canvas` (configured in `svelte.config.js`),
not long `../../../` chains. A short, stable import path is one less thing for
the reader to decode and one less thing to break when a file moves.

---

## A checklist for new and changed code

Before you open a PR, skim your diff against these:

- [ ] No file you touched crossed ~300 lines without a reason you'd defend.
- [ ] A newcomer could open the entry point (route, component, or module) and
      describe its structure without scrolling through implementation detail.
- [ ] No cluster of `$state`/`$derived` is used only by one chunk of the
      template. If one is, that chunk is a component.
- [ ] Component/page styles live in a scoped `<style>`, not the global sheet.
      `styles.css` got only tokens or a genuinely shared rule.
- [ ] A new feature was added by implementing a small contract (`Entity`,
      `Command`, `CanvasBehavior`, and so on), not by editing shared machinery.
      Any new abstraction earns its keep with a real second case.
- [ ] Every comment earns its place: explains a _why_, reads on its own, stays
      concise (no restating code, no em dashes or clause-heavy sentences). New
      modules/components have an `@file`/`@component`, and reusable API has an
      `@example`.
- [ ] Names reveal intent and reuse the domain vocabulary. No new synonym for a
      concept that already has a name.
- [ ] State is minimal. A pure function of state is a `$derived`, not a synced
      `$state`. `$effect` is only for real side-effects. Complex or shared state
      lives in a `.svelte.ts` module or context.
- [ ] Complex logic sits in a pure, unit-tested function. New UI worth asserting
      has a `data-testid` and Playwright coverage.
- [ ] Every magic number is named, or obvious from one line away.
- [ ] Comments explain _why_, and non-obvious decisions are written down.
- [ ] Shared logic lives in one place. You didn't copy-paste a helper.
- [ ] Imports use `$lib` / `$config` / `$canvas`, not deep relative paths.
