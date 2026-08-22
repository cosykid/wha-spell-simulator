# src/lib/compiler

Turns a parsed `GlyphAST` into `SpellIR`, the compiled spell that the renderer, diagnostics, and summary
panel all read. This is where a drawing stops being geometry and starts having meaning.

## Files

- [`spellBuilder.ts`](spellBuilder.ts): `compileSpell` (the entry point) and `carrySpellActivation`.
  Owns the gate checks, the scalar parameters, and the signature.
- [`semanticRules.ts`](semanticRules.ts): how recognized signs combine. `signInfluence`,
  `aggregateManifestations`, `aggregateSemanticDeltas`, `combineSignDirection`.
- [`spellDirection.ts`](spellDirection.ts): the paper-local 3D `direction` vector, `z` out of the paper.
- [`spellQuality.ts`](spellQuality.ts): `calculateSpellQuality` and `calculateSpellStability`.
- [`reading/`](reading/): `readSeal` gates recognition noise into a `SealReading`. Downstream spell
  code never sees a raw `Recognition`.
- [`plan/`](plan/): `resolvePlan` turns that reading into a `SpellPlan`. **The only place canon
  rulings live** — see below.

Per-sign meaning is not authored here. It lives in the `semantic` block of each dictionary entry
([`../dictionary/signs/`](../dictionary/signs/)). `semanticRules.ts` only decides how those authored
numbers are weighted and merged.

## How it works

`compileSpell({ glyphAST, config })` runs a fixed sequence.

1. Gate checks. Missing ring, multiple rings, multiple sigils, no primary sigil, confidence below
   `config.compiler.minimumPrimarySigilConfidence`, an ambiguity gap under
   `PRIMARY_SIGIL_AMBIGUITY_GAP`, or an element outside `SUPPORTED_ELEMENTS` each return
   `invalidSpell(status, ...)` with a warning key from [`../parser/glyphWarnings.ts`](../parser/glyphWarnings.ts).
2. Aggregation. Signs are weighted by `signInfluence` and folded into `manifestations`, `SemanticDeltas`
   and a surface direction. The same signs also go through `readSeal` and `resolvePlan`, which hang
   `reading` and `plan` on the IR. The plan is what the cast performs.
3. Scalars. `focus`, `spread`, `force`, `range`, `duration`, `gravity`, `strength`, and `effectScale` come
   from `SPELL_PARAMETER_TUNING` plus the primary sigil's own semantic plus the sign deltas.
4. Signature. A digest of everything the cast animates from.

Field-by-field reference: [`docs/spell-ir.md`](../../../docs/spell-ir.md). Parser side:
[`docs/glyph-ast.md`](../../../docs/glyph-ast.md).

## The Plan layer (`plan/`)

`resolvePlan(reading)` is the only place canon rulings take effect. Its shape is R-13 plus PDF defect
L in [`docs/animation-spec.md`](../../../docs/animation-spec.md): gather every family's budget, then
resolve. Each family owns a different verb and its own budget, so nothing overrides anything.

- [`columns.ts`](plan/columns.ts) — R-05's `(S, P, C, Gamma)` fold, `aimVector`, `dispersionScalar`.
  Levitation and pull reuse `foldAggregate`: same algebra, separate budgets.
- [`region.ts`](plan/region.ts) — R-09 as a ranked rule table, over the classes
  [`chevrons.ts`](plan/chevrons.ts) reads (count, radial position, quantized facing). Rows match on
  classes, never on a threshold over fused geometry.
- [`hold.ts`](plan/hold.ts) the spring · [`intake.ts`](plan/intake.ts) the ambient coupling ·
  [`focus.ts`](plan/focus.ts) the lens.
- [`snap.ts`](plan/snap.ts) — the canon-snap seam, shipping empty. Its header documents the
  fingerprint scheme.
- [`planText.ts`](plan/planText.ts) — the golden and lab-panel text form.
- [`planDigest.ts`](plan/planDigest.ts) — the same plan as one line, for `SpellIR.signature`.

Rules for working in here:

- **A ruling is a table row, not a branch.** Sigil class, manifestation family and the region rows are
  data. If a change wants an `if`, it probably wants a row.
- **Every manifestation resolves to something.** An unruled sign still pays its ink into the budget and
  emits an `unmodeled-<manifestation>` note. Never throw, never drop (PDF defect I).
- **Never silently answer an open canon question.** The spec's open list is empty as of R-20, so a
  case it does not cover is a new question, not a licence to guess. Take the least-committal default,
  tag it with a `PlanNote`, and leave a comment saying what is undecided — then get it ruled and add
  the `R-xx` section, rather than letting the default harden into canon by being tested.
- **Law tests cite ruling ids.** [`tests/spellPlan.test.ts`](../../../tests/spellPlan.test.ts) names the
  ruling each test pins, and [`tests/golden/plans/`](../../../tests/golden/plans/) holds one text
  snapshot per lab preset. A ruling change edits both, visibly.

## Invariants and gotchas

**Activation is ring closure and nothing else.** `active` is `Boolean(glyphAST.ring.complete)` and
`prepared` is `!active`. Do not introduce a second source of truth for "the spell is firing". Invalid
spells are neither active nor prepared, so the three flags describe three states.

**Wrap every recompile in `carrySpellActivation(previous, next)`.** Recognition emits a fast template
result and then one or more ML refinements for the same drawing, and each pass recompiles. `activatedAt`
is the cast clock's origin, so a fresh one restarts the performance from the charge beat and the spell
would begin only after the last refinement instead of when the ring was sealed.
[`../ui/simulator/recognition-pipeline.svelte.ts`](../ui/simulator/recognition-pipeline.svelte.ts) is the
sole production caller and should stay that way.

**`SpellIR.signature` is a reset key, not a debug string.**
[`../cast/render/castRenderer.ts`](../cast/CLAUDE.md) compares it every frame and recompiles the score
from scratch when it changes. It folds in the sigil id, element, `manifestationSignature`, the plan
digest, `active`, and rounded scalars. Changing what goes into it changes when a running cast restarts,
so treat any edit as a renderer behavior change.

**Every plan dial the cast animates from must reach `planDigest`.** It is the plan's whole component of
the signature, so a dial that misses it is a change that never shows on screen until something else
moves. The digest folds in every field of `SpellPlan`, and
[`tests/planDigest.test.ts`](../../../tests/planDigest.test.ts) holds one nudge per field in a record
typed on `keyof SpellPlan`, so a new plan field stops that table compiling until its nudge is written.

**Signature components round to hundredths**, the digest included. A smaller change will not reseed the
cast. Fold a value in at coarser rounding if it should be a hot knob, or leave it out if it should tune
in place.

**Every field set in `compileSpell` must also be set in `invalidSpell`.** They are the only two
constructors of `SpellIR` and consumers read fields unguarded. `invalidSpell` uses `emptySealReading()`
and `inertPlan()`, so the three states stay coherent.

**`reading` is deliberately absent from `signature`.** It is a debug surface, and everything in it that
changes behavior arrives in the plan, which is in the digest. Adding it would reset a running cast on a
facing-source change that moved nothing.

**`compileSpell` takes an optional `previous` SpellIR.** Only the reading uses it, for facing
hysteresis across the template and ML passes over the same ink. It is passed at the one production
callsite, beside `carrySpellActivation`; omit it and every facing quantizes fresh.

**`status` is user-facing.** It reaches the simulator status line, but
[`../ui/spellSummary.ts`](../ui/spellSummary.ts) can substitute its own text keyed on warnings, so pair
any new rejection with a `GLYPH_WARNINGS` entry.

**Sign-free spells still compile.** `aggregateManifestations([])` returns `aura` at strength 1 and
`resolvePlan` returns a plan with no budget. R-11 makes that a look, so the cast still paints
something; there is no empty path and no second renderer to fall into.

**Keep tuning in the named constant tables** (`SPELL_PARAMETER_TUNING`, `SIGN_SHAPE_TUNING`,
`SIGN_INFLUENCE_TUNING`, `CONVERGENCE_TUNING`, `QUALITY_TUNING`, `STABILITY_TUNING`). Do not inline magic
numbers at the use site.

## Extending

- **New sign meaning**: author the `semantic` block in the dictionary entry. The scalar channels (`force`,
  `focus`, `spread`, `range`, `lifetimeBias`) and `manifestation` / `directionMode` flow through with no
  compiler edit. See [`docs/dictionary-authoring.md`](../../../docs/dictionary-authoring.md).
- **Manifestation needing more than `{ strength }`**: extend `aggregateManifestations` the way
  `convergence` does through `convergenceProfile`, and give it a branch in `manifestationSignature`.
- **Manifestation that should move parcels**: give it a family row in
  [`plan/resolvePlan.ts`](plan/resolvePlan.ts) and a rule module beside the others. Nothing about
  motion belongs in this file.
- **New `SpellPlan` field**: declare it in [`../types/spell-plan.ts`](../types/spell-plan.ts), print it
  in `planText`, fold it into `planDigest`, and write its nudge in `tests/planDigest.test.ts`.
- **New `SpellIR` field**: declare it in [`../types/spell-ir.ts`](../types/spell-ir.ts), fill it in both
  `compileSpell` and `invalidSpell`, fold it into `signature` if the cast animates from it, and
  document it in `docs/spell-ir.md`.
- **New or changed canon ruling**: it belongs in `plan/`, never here and never in the renderer. A
  ruling change is a law test edit plus a plan golden rewrite, both visible in review.

## Related

- [`../cast/CLAUDE.md`](../cast/CLAUDE.md): what performs the plan this file emits.
- [`docs/spell-ir.md`](../../../docs/spell-ir.md): the field-by-field contract, `reading` and `plan`
  included.
- Tests: [`tests/spellBuilder.test.ts`](../../../tests/spellBuilder.test.ts),
  [`tests/spellPlan.test.ts`](../../../tests/spellPlan.test.ts),
  [`tests/sealReading.test.ts`](../../../tests/sealReading.test.ts),
  [`tests/planDigest.test.ts`](../../../tests/planDigest.test.ts),
  [`tests/spellActivation.test.ts`](../../../tests/spellActivation.test.ts).
