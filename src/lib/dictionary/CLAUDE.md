# src/lib/dictionary

The glyph corpus. One JSON file per sigil and per sign, parallel SVG display art,
and the loader that assembles them into a `Dictionary`.

## File map

- [`sigils/NN-<id>.json`](sigils/) 8 sigils. Carry `element`, which picks the spell's element.
- [`signs/NN-<id>.json`](signs/) 12 signs. Carry `semantic.manifestation`, which shapes the effect.
- [`svg/`](svg/) normalized centerline art, one file per glyph id. Display only.
- [`dictionaryLoader.ts`](dictionaryLoader.ts) eager `import.meta.glob` over both JSON directories, sorted numerically by filename.
- [`svgStrokes.ts`](svgStrokes.ts) DOM-side SVG parsing: raw markup for thumbnails, `Path2D` data for faithful rendering, sampled unit-box `Point[][]` for the placement optimizer.
- [`signIds.ts`](signIds.ts) canonicalizes legacy Aeroform spellings found in stored samples.
- [`sample-spells.json`](sample-spells.json) reference spells for `../components/DictionaryReference.svelte`. Not used by recognition.

Entry shapes (`SigilEntry`, `SignEntry`, `Semantic`) live in [`../types/dictionary.ts`](../types/dictionary.ts).

## How it works

`loadDictionary()` returns `{ sigils, signs, sampleSpells }`. Array order comes
from the numeric filename prefix. That prefix is presentation order only and is
**not** the id. `entry.id` is the identity used by the parser, the ONNX class
map, stored sample labels, and preset serialization.

`strokeTemplate.strokes` is the load-bearing field, and it feeds two consumers:

- **Recognition.** `buildExamplesFromDictionary` in
  `../parser/shape-matcher/examples.ts` turns each template into a
  `RecognitionExample`, plus a "simplified" variant that drops short strokes.
- **The palette.** `../input/shapeLibrary.ts` reuses the same points as
  `baseStrokes` for stamped placements, sized by `referenceSizeNorm`.

`svg/` is a parallel asset set that never reaches recognition. It backs
thumbnails and the sample-maker overlay. The two representations of a glyph must
be kept in sync by hand.

## Invariants and gotchas

- Renumbering a file is safe. Renaming an `id` is not: it breaks stored samples,
  saved presets, and the ONNX class map. Ids are lowercase kebab-case.
- Author sign `strokeTemplate` drawings at the bottom-of-ring pose, 270 degrees.
  `../parser/signRotation.ts` rotates candidates into that frame and allows only
  +/- 15 degrees. A template drawn upright is unrecognizable at most ring positions.
- Signs are orientation-bearing. A new sign needs `semantic.manifestation` **and**
  a family row in `../compiler/plan/resolvePlan.ts`, or its ink only pays into the
  burst budget and the plan tags it `unmodeled-<manifestation>`. `crush`, `weave`,
  `billowing`, and `repetition` sit in that state today. See
  [`../compiler/CLAUDE.md`](../compiler/CLAUDE.md).
- Unit tests read these files from disk. `tests/dictionaryFixtures.ts`
  `readRealDictionary()` parses the real JSON, so a template edit changes the
  outcome of `symbolRecognition`, `decomposition`, and `shapePlacement` tests.
  Run `npm run test:unit` after any template change.
- An entry with no `strokeTemplate.strokes` produces no recognition example and
  is invisible to the template recognizer, and it is dropped from the palette.
- `static/models/glyph-class-to-idx.json` is a separately trained artifact. It
  currently holds 26 classes, six of which (`cool`, `empower`, `entwine`,
  `focus`, `gather`, `orb`) have `svg/` art but no JSON entry. The ML pass drops
  predictions it cannot resolve to an entry. Adding JSON for one of those six
  makes it live with no retraining. A genuinely new glyph needs a retrained model.
- `svgStrokes.ts` is browser-only (`DOMParser`, `getPointAtLength`). Never import
  it from a worker, a unit test, or server code.
- `recognitionRotationInvariant` drives ML training augmentation. It does not
  relax the template matcher's sign handling. Every current entry sets it `true`.
- `referenceSizeNorm` is the ring-relative footprint of a normally drawn
  instance. It sets both the palette stamp size and the compiler's size ratio.
  Omitting it falls back to `config.renderer.effectSize.defaultReferenceSizeNorm`.

## Adding a glyph

1. Draw the template at `/tools/stroke-template-maker` and paste the exported
   `strokeTemplate` object into a new numbered JSON file in `sigils/` or `signs/`.
2. Fill `id`, `displayName`, `allowedLayers`, `referenceSizeNorm`, `sourceNotes`,
   `recognitionRotationInvariant`. Sigils add `element`; signs add `semantic`.
3. Add `svg/<id>.svg` and run `npm run normalize:svg` so thumbnails and the
   sample-maker overlay work.
4. For a sign, add the `manifestation` row in `../compiler/plan/resolvePlan.ts`.
5. Run `npm run test:unit`.

Canonical glyph art comes from the Witch Hat Atelier wiki on telepedia. Trace
from there rather than inventing a shape.

## Related

- [`../../../docs/dictionary-authoring.md`](../../../docs/dictionary-authoring.md) full field-by-field authoring guide.
- [`../parser/CLAUDE.md`](../parser/CLAUDE.md) how templates become recognition examples.
- [`../compiler/CLAUDE.md`](../compiler/CLAUDE.md) how a sign's manifestation and orientation become a plan.
