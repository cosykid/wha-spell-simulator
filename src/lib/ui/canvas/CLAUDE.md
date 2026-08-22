# src/lib/ui/canvas

A small 2D canvas engine: a z-ordered scene of self-drawing entities plus
swappable pointer behaviors. Imported through the `$canvas` alias.

## The three contracts

| Contract         | Pattern   | Shape                                       | Defined in                             |
| ---------------- | --------- | ------------------------------------------- | -------------------------------------- |
| `Entity`         | Composite | `{ id, z, render(ctx, timestamp), scale? }` | [entity.ts](entity.ts)                 |
| `Command`        | Command   | `{ do(), undo(), label? }`                  | [commands.ts](commands.ts)             |
| `CanvasBehavior` | Strategy  | `{ attach, render?, onResize? }`            | [canvasBehavior.ts](canvasBehavior.ts) |

`TransformableEntity` adds `placement` and `hitTest` so the select tool can move,
scale and rotate it. `isTransformable` is the guard. Rule 5 of
[docs/CODE_GUIDE.md](../../../../docs/CODE_GUIDE.md) explains why these exist.

## File map

- [Canvas.svelte](Canvas.svelte): the surface component. Owns the single rAF loop.
- [scene.svelte.ts](scene.svelte.ts): `createScene`, the entity list, the undo/redo history, and the `getScene`/`setScene` context pair.
- [tools/drawTool.svelte.ts](tools/drawTool.svelte.ts): freehand capture. Commits each stroke as a `StrokeEntity` and owns two-finger CSS pan/zoom on the wrapper element.
- [tools/selectTool.svelte.ts](tools/selectTool.svelte.ts): move, scale, elongate and rotate handles for transformable entities.
- [entities/](entities): one factory per visual: paper (flat or textured), grid, crosshair, stroke, placement, symbol, template, reference overlay.
- [guideRenderer.ts](guideRenderer.ts), [selectionRenderer.ts](selectionRenderer.ts): bare draw functions, not entities. Callers wrap them in their own entity.
- [actions/resize.svelte.ts](actions/resize.svelte.ts): the attachment behind `Canvas`'s `resize` prop.

## How it works

`<Canvas {scene} controller={tool} />` runs one `requestAnimationFrame` loop:
`scene.render()`, then `controller.render?()`, then `onFrame?()`. The loop reads
scene, controller and onFrame inside the callback, so swapping the active tool
never restarts it.

`onFrame` is the sanctioned escape hatch for drawing that does not fit the entity
model. It is how the simulator drives its second, scene-less effect canvas from
this loop.

`scene.add(entity)` inserts without history. `scene.do(command)` runs the command
and pushes it onto the undo stack. Entities are pulled every frame, so an entity
that closes over getters (see `referenceOverlayEntity`) stays current without
ever being re-created.

## Invariants and gotchas

- Only `scene.do` participates in undo/redo. `add` and `remove` are escape hatches for items that should never be undoable, like the background.
- **The simulator does not use this history at all.** It keeps its own snapshot history in [`../simulator/history.ts`](../simulator/history.ts) and `drawing-state.svelte.ts`. The `Command` history belongs to the `/tools` routes. Never assume one shared undo system.
- `createScene(initial)` does **not** sort. Initial entities render in array order, so list them in paint order. Only `add()` sorts by `z`, and mutating `entity.z` afterwards never reorders. Set the final `z` at construction.
- `clear()` restores exactly the initial array the scene was created with, dropping everything added since.
- Hit-test in reverse render order, `[...scene.getEntities()].reverse().find(...)`, so the topmost entity wins the click. Both `selectTool` and the simulator's placement behavior do this.
- Entities share one context. Wrap every `ctx` state change in `save()`/`restore()` or it leaks into the entity drawn next.
- The `resize` prop is off in every current caller, so `Entity.scale` and `resizeCanvas` never fire today. The simulator resizes its backing store through [`../canvasSizing.ts`](../canvasSizing.ts) and rescales strokes, placements and history snapshots itself.
- `getScene`/`setScene` are exported but have no consumer. Pass the scene as a prop unless you genuinely need it deep in a tree.

## Extending

- **A new visual**: write an `Entity` factory under `entities/`, choose a `z`, and add it to the caller's `createScene([...])` or `scene.add`.
- **A new interaction mode**: write a `CanvasBehavior` whose `attach` wires pointer listeners and returns the teardown, then swap it into `controller`.
- **A new undoable edit**: write a `Command` in `commands.ts` and run it through `scene.do`.

## Related

- [docs/CODE_GUIDE.md](../../../../docs/CODE_GUIDE.md) rules 2 and 5: entry-point structure and these patterns.
- [../simulator/CLAUDE.md](../simulator/CLAUDE.md): the largest consumer, and the one with its own rules.
- Tool routes that use the scene history: `src/routes/tools/{sample-maker,stroke-template-maker,stroke-template-viewer,sigil-sign-detector-lab}`.
