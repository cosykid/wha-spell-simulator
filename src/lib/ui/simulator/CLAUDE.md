# src/lib/ui/simulator

Everything behind the main `/` route: drawing state, recognition, the canvas
runtime, and the mode/keyboard/layout glue. The route file is a thin shell
because it all lives here.

## Assembly

[`simulator-session.svelte.ts`](simulator-session.svelte.ts) is the route-facing
facade. It constructs the subsystem objects as fields and exposes the few
cross-subsystem commands the stage needs.
[`simulator-runtime.svelte.ts`](simulator-runtime.svelte.ts) owns everything that
needs mounted DOM: input controllers, the glyph `Scene`, the arrange-mode
`CanvasBehavior`, resize observers, the global keydown handler, and the
effect-canvas frame callback. `session.mount()` returns its teardown for
`onMount`.

Which object owns which state is tabulated in rule 3 of
[docs/CODE_GUIDE.md](../../../../docs/CODE_GUIDE.md) (drag preview,
zoom/pan/mode, drawing model, recognition, canvas runtime). Read it before adding
state. Rule 5 covers the canvas contracts.

Files whose names do not give them away:

- [`drawing-state.svelte.ts`](drawing-state.svelte.ts): strokes, placements, selection, snapshot history, and the baked-stroke and placement-entity caches.
- [`first-spell-guide.svelte.ts`](first-spell-guide.svelte.ts): the first-spell guide's phase, walk step, and commands. The step is derived from recognition, never a stored cursor. Pure step logic in [`first-spell-script.ts`](first-spell-script.ts), ghost geometry in [`first-spell-geometry.ts`](first-spell-geometry.ts); the ghost draws through `firstSpellGhostEntity` in `glyph-scene.svelte.ts` (z -60, under the ink) via [`../../renderer/ghostInk.ts`](../../renderer/ghostInk.ts). The welcome and celebration cards are `src/lib/components/simulator/FirstSpellGuide.svelte`. The auto-offer fires once per device (`firstSpellGuideSeen` in [`preferences.ts`](preferences.ts)); e2e contexts look like first visits, so `SpellCanvasPage.goto` pre-seeds that flag.
- [`drawing-actions.ts`](drawing-actions.ts): the user-facing commands (undo, clear, paste, commit, `loadPreset`, the spent page's `freshPage` and `reopenRing`).
- [`recognition-pipeline.svelte.ts`](recognition-pipeline.svelte.ts): async classification, spell compilation, summary, diagnostics.
- [`glyph-scene.svelte.ts`](glyph-scene.svelte.ts): the nine entity layers of the glyph canvas.
- [`mode.ts`](mode.ts): pure mode transitions: `toolForMode`, `togglePanMode`, `locksFreehandInput`.
- [`ring-seal.ts`](ring-seal.ts): pure. Which freehand stroke closed the ring, so a spent page can hand that stroke back.
- [`layout.ts`](layout.ts): `visibleCanvasShortAxis`, the logical paper size for a canvas that covers the viewport's long edge.
- [`types.ts`](types.ts): UI-facing types only (tabs, drawer ids, selection snapshot), never parser or compiler models.

## How it works

Pointer input reaches `SimulatorInputControllers` (`DrawingCapture` and
`EraserController`) and lands in `drawing.store`. A committed stroke pushes
history, refreshes the stroke snapshot, and schedules a recompute after a short
debounce.

`recognition.recompute()` bakes placements into strokes via `mergedStrokes()` and
calls `classifyDrawingOffThread`. That call resolves with the fast **template**
result and delivers later **ML** refinements through its callback. Both paths
land in `#applyClassifiedDrawing`, which compiles a fresh `SpellIR` and
recomputes the summary.

Rendering splits across two stacked canvases. The glyph `Scene` is built once and
never mutated: each entity pulls live state through closures every frame. It
carries the ink, the charge beat's seal ignition, the activated-ink glow, and the
seal guides (`sealGuidesEntity`, gated on `ui.showGuides`). The effect canvas is
not in the scene. It is driven by `Canvas`'s `onFrame` hook into
`renderCanvasFrame`, which lazily builds a
[`CastStage`](../../cast/CLAUDE.md) over `ui.effectCanvas`.

## Invariants and gotchas

- **An active valid spell is a cast, and that is the whole dispatch.** `renderCanvasFrame` hands the IR to the one engine the user's `effectStyle` selected, unconditionally: the style picks the engine and the spell never does, so there is no ownership boolean, no fallback engine, and no "did it draw anything" return value. R-11 makes "manifests nothing" a look, so the empty path the old renderer needed does not exist. [`../../renderer/`](../../renderer/CLAUDE.md) holds the glyph overlay and nothing else.
- **The effect canvas belongs to whichever engine took it, and only that engine may touch it.** A canvas that ever handed out a `2d` context can never host a WebGL one, and the failure is silent and permanent, so nothing else may call `getContext` on it — the `ctx` `renderCanvasFrame` receives is the glyph canvas's. A style change therefore **destroys the element and mounts a fresh one** (`{#key ui.effectStyle}` in `SimulatorCanvasPanel.svelte`), which trips the runtime's identity check on the next frame; the element carries `data-effect-style` so a test never has to probe for a context. The runtime disposes the engine when the canvas is swapped, the style changes, or the glyph canvas detaches, because a browser only allows a handful of live WebGL contexts.
- **A freshly keyed effect canvas arrives at its attribute size.** The resize observer only fires when the shell's box moves, so `renderCanvasFrame` matches the new canvas to the glyph canvas when it builds the engine, and `canvasSizing.ts` re-reads the effect canvas through a getter rather than capturing it at mount.
- **The effect canvas draws only casts.** Ring, prepared and invalid feedback are the glyph scene's, through `drawSealGuides`. They draw on flat, non-active states only, so the portal tilt never reaches them.
- **Keep `carrySpellActivation`** ([`../../compiler/spellBuilder.ts`](../../compiler/spellBuilder.ts)). `#applyClassifiedDrawing` wraps every `compileSpell` in it. The template pass activates the spell and the ML pass recompiles it moments later, so a fresh `activatedAt` would restart the cast clock mid-performance and replay the charge beat. Any refactor that drops the wrap breaks casting in a way no unit test here catches.
- **A drawing that jumps somewhere else drops the carried activation.** The wrap above keeps the stamp whenever both compiles read as active, which is all it can see. Undo, redo and `loadPreset` replace the drawing under a spell that is still active in state, and recognition is async, so the state in between is often never applied at all: without `recognition.dropCarriedActivation()` the compile that follows inherits a clock that has already run out, the status reads "Active spell", and nothing performs. A canvas resize is deliberately not one of these — it scales the same drawing, and its cast is the same cast. Pinned by [`../../../../tests-e2e/recast.e2e.ts`](../../../../tests-e2e/recast.e2e.ts), which is a pixel assertion because every status assertion passes either way.
- **Recognition is sequence-guarded.** Each `recompute` takes `++#recomputeSeq`, `#applyClassifiedDrawing` drops results from an older sequence, and `cancelActiveRecognition()` bumps the counter to invalidate work already in flight. A superseded worker request rejects with `DrawingClassifierSupersededError`. Swallow it via `isDrawingClassifierSuperseded`, never surface it as a failure.
- **Sealing the ring locks freehand input.** `summary.canvasLocked` (in [`../spellSummary.ts`](../spellSummary.ts)) turns true once the ring is complete, or when the structure is unsupported. An active seal is a cast in progress, not an editing surface. Erase or undo is the way back, and **no path anywhere unlocks a closed ring**. A spent cast (`recognition.castSpent`, a timer armed off `summary.castEndsAt`) leaves dead paper, so it earns two more exits, both edits to the drawing rather than unlocks: `actions.freshPage` clears the page (a primary tap in draw mode does the same), and `actions.reopenRing` takes the sealing stroke back, leaving the rest of the diagram as a prepared draft to change and seal again. [`ring-seal.ts`](ring-seal.ts) names that stroke from the detector's own `ring.strokeIds`. Undo restores either. The tearing tap never inks, because the paper is still tilted at that instant and `canvasPointFromEvent` maps through a flat rect. `recognition.resetSpellState()` is what makes a wipe or a reopen land in the same tick: it drops the compiled spell so lock, tilt, and status fall with the ink instead of waiting out a classify pass.
- **Two writers set the capture lock**: the runtime `$effect` via `locksFreehandInput(canvasMode, canvasLocked)`, and the pipeline via `summary.inputLocked` through `setInputLocked`. Change one and change the other.
- The mode, lock and cursor derivation lives in a runtime `$effect` on purpose. Setting it only inside `setCanvasMode` missed mode changes that bypass that method, such as a persisted `arrange` preference applied by `loadPreferences`, which left arrange mode looking active with its pointer handlers off. The effect also reads `zoomLevel` so the eraser cursor rescales with zoom, and a `transitionend` listener on the shell re-runs the cursor derivation once an eased canvas transform lands, because the eraser ring is measured off the on-screen box.
- **Recognition only ever sees `Stroke[]`.** Placements are `PlacementEntity` for live rendering, and `bakePlacementToStrokes` produces the temporary strokes recognition consumes (cached by a transform key). Never hand a placement to the parser.
- **Rings paint under sigils and signs** ([`placement-order.ts`](placement-order.ts)), and `placement-behavior.svelte.ts` hit-tests the reversed order so a symbol inside a ring wins the click. Keep the two in step.
- A canvas resize must rescale four things: the stroke store (inside `setupCanvasSizing`), live placements, every history snapshot (`history.scale`), and the recognized ring (`recognition.scaleGeometry`). Miss one of the first three and undo teleports the drawing. Miss the ring and the guide, seal and diagnostic layers keep drawing at the old canvas size until the recompute lands, which is seconds on a full seal. Pinned by [`../../../../tests-e2e/canvas-resize.e2e.ts`](../../../../tests-e2e/canvas-resize.e2e.ts).
- **`ui.glyphCanvas` is bound DOM and reads null while detached.** Its declared type says otherwise (`$state<HTMLCanvasElement>(null!)`), so nothing warns you. `recompute()` re-arms rather than reading a null canvas: a resize schedules recognition straight into that window, and the pass cannot be dropped either, because recognition owns the geometry those layers draw from.
- Construct `SimulatorSession` during component initialization. The runtime and `SimulatorUiState` create `$effect`s in their constructors.
- Glyph-canvas detach is deferred by a microtask (`#scheduleGlyphCanvasDetach`) so a reattach in the same tick does not tear down the input controllers.

## Extending

- **A new visual layer**: add an `Entity` in `glyph-scene.svelte.ts` that reads live state through the options getters. Do not mutate the scene at runtime.
- **A new interaction mode**: a `CanvasBehavior` beside `placement-behavior.svelte.ts`, a `CanvasMode` in `mode.ts`, and activation wired into the runtime `$effect`.
- **A new user command**: a method on `SimulatorDrawingActions`: mutate `drawing`, call `pushHistory()`, then `recognition.recompute()`.
- **A new shortcut**: `keyboard.ts`. Its options interface is the contract.

## Related

- [`../canvas/CLAUDE.md`](../canvas/CLAUDE.md): the `Entity`/`Command`/`CanvasBehavior` engine this route sits on.
- Library hand-off: the library page stashes a preset and navigates home, then the route calls `takePendingCast()` once `ui.inputReady` and feeds it to `actions.loadPreset`. See [`../spells/castHandoff.ts`](../spells/castHandoff.ts). Presets store an open ring, so a loaded spell reads as prepared until the user seals it.
- Components in `src/lib/components/simulator/`. End-to-end page object in `tests-e2e/pages/SpellCanvasPage.ts`.
