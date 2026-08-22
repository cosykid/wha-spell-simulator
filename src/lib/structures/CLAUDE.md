# src/lib/structures

Data shapes that cross a boundary: browser to database, page to page, session to session. Nothing here
draws, recognizes, or talks to the network.

## Files

- [`spellPreset.ts`](spellPreset.ts): the saved-spell format. Preset v1, its zod schema,
  `serializeSpellPreset` / `deserializeSpellPreset`, and `cutRingGap`. The only file here with logic.
- [`savedSpell.ts`](savedSpell.ts): types only. `SavedSpell`, `LibrarySpell`, `LibrarySort`,
  `LibraryPage`. Deliberately outside `$lib/server` because the drawer, the library page, and the remote
  functions all import them.
- [`labelledSample.ts`](labelledSample.ts): types only. One handwriting sample for glyph training.
  Strokes are stored raw, with `meta` capturing the canvas size and DPR needed to reinterpret them later.
- [`arrayWithHistory.svelte.ts`](arrayWithHistory.svelte.ts): `makeReactiveArrayWithHistory`, a `$state`
  array with push / undo / redo. Backs the simulator's stroke and placement stores.

## How the preset format works

A preset is `{ v: 1, strokes, placements }`. Coordinates are canvas-size independent, so a spell saved on
one screen restores on another.

- `serializeSpellPreset(drawing, canvasSize, ring)` divides every stroke point and every placement
  `cx`/`cy`/`scaleX`/`scaleY` by `canvasSize`.
- `deserializeSpellPreset(data, canvasSize)` multiplies them back and mints fresh ids (`s1…`, `p1…`).
- Placement `baseStrokes` already live in their own 0..1 template box, so they pass through untouched in
  both directions. Normalizing them again would shrink every stamp.
- Point `t` values are copied verbatim, not rescaled.

Because the scale factors normalize too, `deserializeSpellPreset(data, 1)` yields a 0..1 drawing, which is
how [`../ui/spells/presetThumbnail.ts`](../ui/spells/presetThumbnail.ts) builds preview polylines.

## Invariants and gotchas

**A preset is always stored unsealed.** When the drawing is serialized with a closed ring,
`serializeSpellPreset` routes the strokes through `cutRingGap` first, which removes the points inside a
45 degree sector centered at -90 degrees and splits the ring into one stroke per surviving run. A recalled
spell therefore arrives prepared and the caster must seal it by hand. Do not add a "save sealed" path.
Loading one would fire the spell the instant it appeared on the canvas.

**`PRESET_RING_GAP_DEG` duplicates `RING_GAP_DEG` in
[`../input/shapeLibrary.ts`](../input/shapeLibrary.ts).** That constant is module-private, so the
duplication is deliberate, but the two values must be changed together or a recalled ring and a stamped
ring will have different gap widths. Only the width matches today. The stamped ring template's gap sits at
0 degrees (a dropped ring has `rotationDeg: 0`), while `cutRingGap` always cuts at the top.

**`cutRingGap` is a heuristic, not ring detection.** A stroke counts as ring only when every one of its
points stays inside 0.8x..1.2x the ring radius and it spans at least 90 degrees. A very wobbly hand-drawn
ring that strays outside that band is left sealed, and a short arc stamped on the band (a sign) is
correctly spared. If a saved spell comes back already active, suspect this band check first.

**`SpellPresetDataSchema` is the trust boundary.** It is parsed server-side in
[`../spells/spells.remote.ts`](../spells/spells.remote.ts) and again in
[`../ui/spells/castHandoff.ts`](../ui/spells/castHandoff.ts) when reading the hand-off out of
sessionStorage. Caps: 400 strokes, 2000 points per stroke, 64 placements, 32 base strokes per placement,
coordinates within -1..2, axis scales non-zero and within +/-4, and at least one stroke or placement.
Raising a cap raises the size of a payload anyone can post.

**Bump `SPELL_PRESET_VERSION` for any shape change.** `deserializeSpellPreset` throws on a version it does
not recognize, and the schema pins `v` to a literal, so old rows fail closed rather than half-loading.

**`arrayWithHistory` is a stack, not a command history.** `undo()` pops the last item and `redo()` pushes
it back. Any new push clears the redo stack. `pushCount()` only grows until `clear()`, which is what makes
it safe for minting collision-free ids. Being a `.svelte.ts` runes module, it cannot be imported by the
`node:test` unit suite.

**`labelledSample.ts` carries no version field**, despite what its file docstring says. `schema_version`
was dropped in `migrations/003_drop_schema_version.sql`.

## Extending

- **New preset field**: add it to the zod schema with a cap, write it in `serializeSpellPreset`, read it in
  `deserializeSpellPreset`, bump `SPELL_PRESET_VERSION`, and cover the round trip in
  [`tests/spellPreset.test.ts`](../../../tests/spellPreset.test.ts).
- **New stored-spell field**: extend `SavedSpell` here, then the `spells` table in
  [`../server/storage/db.ts`](../server/storage/db.ts), `rowToSpell` in
  [`../server/storage/spellStore.ts`](../server/storage/spellStore.ts), and add an idempotent migration.
- Keep this directory free of `$lib/server` imports. Anything here may be bundled into the client.

## Related

- Storage and remote functions: [`../server/CLAUDE.md`](../server/CLAUDE.md).
- Tests: [`tests/spellPreset.test.ts`](../../../tests/spellPreset.test.ts).
