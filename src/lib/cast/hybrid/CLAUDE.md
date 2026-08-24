# src/lib/cast/hybrid

The substrate: the one machine every cell paints with. A dense GPU parcel mass
carrying pigment, drawn brush marks torn off its own silhouette, one heat ramp,
and one accumulation buffer they all land in.

It exists because the parametric form vocabulary it replaced read as CG, sparse,
stiff and glowy. Read
[`../../../../docs/animation-hybrid.md`](../../../../docs/animation-hybrid.md)
before changing anything here; every rule below is one of that document's.

Seal space everywhere (spec R-03): origin at the ring center, one unit = the ring
radius, x right, y screen-down, z out of the paper.

## The shape of it

```
cells/  ->  Channel  ->  FlowShape + MarkArc
                              |
              +---------------+----------------+
              |                                |
        parcel field (GPU)              mark pool (CPU)
              |                                |
              +------ one accumulation --------+
```

A cell writes a `FlowShape` and a `MarkArc` and calls `channel.perform`. It never
touches a mesh, a material or a texture. **An archetype is that struct filled in
differently plus a spawn program**, which is why seven of them can look like one
hand drew them and cost one budget between them.

## File map

- [`substrate.ts`](substrate.ts) — `Substrate` and `Channel`: the seam cells
  write through. Pure CPU, so a whole cast performs in plain Node.
- [`flowShape.ts`](flowShape.ts) — what the field knows about one channel, and
  the seven mouths a parcel can be born from · [`flow.ts`](flow.ts) the field on
  the CPU, plus the two questions only the brush asks (`silhouetteRadius`,
  `massDensity`) · [`noise.ts`](noise.ts) the hash, the value noise and the curl
  all three of them fold out of.
- [`flow.glsl.ts`](flow.glsl.ts) — the same field as GLSL ·
  [`spawn.glsl.ts`](spawn.glsl.ts) the seven mouths ·
  [`sim.glsl.ts`](sim.glsl.ts) the two fragment passes.
- [`params.ts`](params.ts) — how a shape travels to the GPU: one row of a small
  float texture per channel · [`pool.ts`](pool.ts) how the one pool is divided.
- [`tear.ts`](tear.ts) — where on the mass a mark is born ·
  [`mark.ts`](mark.ts) what it is made of · [`markPool.ts`](markPool.ts) the
  population that rides the field · [`brushSlot.ts`](brushSlot.ts) which stamp it
  reaches for.
- [`palette.ts`](palette.ts) — the heat ramp both populations read ·
  [`pigments.ts`](pigments.ts) a `LookRow` read as pigment and as material
  multipliers.
- [`parcelField.ts`](parcelField.ts) the ping-pong simulation ·
  [`parcelDraw.ts`](parcelDraw.ts) + [`parcel.glsl.ts`](parcel.glsl.ts) the
  visible mass · [`parcelStamp.ts`](parcelStamp.ts) its torn atlas.
- [`brushLayer.ts`](brushLayer.ts) a painter-order layer of stamps ·
  [`brushAtlas.ts`](brushAtlas.ts) + [`brushBristles.ts`](brushBristles.ts) the
  four stamps, painted once at load.
- [`postFx.ts`](postFx.ts) + [`post.glsl.ts`](post.glsl.ts) the accumulation, the
  bloom and the composite · [`substrateStage.ts`](substrateStage.ts) the GPU half
  assembled · [`tuning.ts`](tuning.ts) every dial there is.

## Invariants and gotchas

**One field, written twice.** [`flow.ts`](flow.ts) and
[`flow.glsl.ts`](flow.glsl.ts) are the same arithmetic in two languages, reading
the same [`tuning.ts`](tuning.ts) constants. That is what lets a brush mark
travel the streamline a parcel beside it travels. **Change one and change the
other**, and say so in the commit.

**A mark exists only where mass supports it.** Its alpha is multiplied by
`massDensity` under it, which falls to zero with the channel's own emission.
Smoke is the one exception, and it is deliberate. Nothing else may be exempt:
that gate is the whole difference between accents and confetti.

**The sink is a ring attractor, never a point sink.** Matter gathers at `pool`
and is pushed gently back out of the exact centre. A point sink piles the ambient
medium into a stain over the seal, and did.

**The turbulence impulse lands on one step in three at three times the gain.**
Two curl octaves are the substrate's whole cost. Keep the stride a uniform: a
per-parcel stagger diverges across a warp and saves nothing.

**The pool is divided once, when the cast is built.** A share that moved with the
live population would make one cell's state a function of another's, and a cell
may feel only its own track (`../cells/CLAUDE.md`).

**Quality buys form roughness and never magnitude.** The parcel budget is a fixed
constant. A pool that shrank with drawing quality would make a sloppy seal a
quieter one, which the cell contract forbids.

**A row is a stop list, never a shader fork.** Eight look rows share one program,
because the ramp travels as a 1D texture. `fire` is the authored reference and
everything else derives from the six tints its row already carries.

**`Math.random` and clock reads are banned here**, exactly as they are below
`stage/`. The mark population draws from a seeded `Rng`; the parcel field's only
entropy is a salt the stage advances by whole steps.

**The CPU half must stay free of three.js.** `substrate.ts`, `flowShape.ts`,
`flow.ts`, `noise.ts`, `tear.ts`, `mark.ts`, `markPool.ts`, `palette.ts`,
`pigments.ts`, `pool.ts`, `params.ts` and `brushSlot.ts` import none of it, which is what lets the golden tier perform a
whole cast in plain Node. Anything that needs a `Texture` belongs in the GPU
half.

**`PAINT_EVERY` and `PAINT_BURST` are the smear contract.** Deposits are counted
in steps, not frames, so the smear follows the cast's clock; and one call may
deposit at most `PAINT_BURST` times however far behind it is, because a call that
painted every step it simulated would be slower than the frame it was late for
and later still next time.

**The substrate belongs to the stage, not to a cast.** Nothing it holds depends
on a score, so it compiles and bakes once, on the first frame the stage ever
draws (`warm`), and a cast only calls `attach`. On a software device that compile
is most of a second, and it used to land on the strike.

**A parcel costs vertex work, not pixels.** The draw program reads one texel per
parcel — the row map, whose spare lanes carry the channel's heat, veil and grain.
Keep it at one: four fetches per vertex nearly doubled the cost of a paint.

## Extending

- **A new archetype:** fill in a `FlowShape` differently and add one branch to
  [`spawn.glsl.ts`](spawn.glsl.ts). If it needs a term the field does not have,
  add the term to **both** halves of the field and a slot to
  [`params.ts`](params.ts) — never a second kernel.
- **A new material dial:** add it to `MaterialInk` in
  [`pigments.ts`](pigments.ts) and multiply an existing `tuning.ts` number with
  it. A row may not invent a shape.
- **A new mark kind:** a row in `RECIPE` in [`mark.ts`](mark.ts), a branch in
  `birth`, and a share on `MarkArc` so a cell can decline it. It still meets the
  coverage gate.
- **Never from here:** the score, another channel, or the look table (data,
  behind an ESLint wall).

## Related

- [`../cells/CLAUDE.md`](../cells/CLAUDE.md) — the choreographers that write into
  it · [`../stage/CLAUDE.md`](../stage/CLAUDE.md) — what advances and paints it.
- [`../../../../docs/animation-hybrid.md`](../../../../docs/animation-hybrid.md)
  — the ruling this directory executes ·
  [`../../../../docs/animation-spec.md`](../../../../docs/animation-spec.md) —
  every R-nn cited here.
- [`../../../../tests/castHybrid.test.ts`](../../../../tests/castHybrid.test.ts)
  — the laws above, as assertions.
