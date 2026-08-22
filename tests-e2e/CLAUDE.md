# tests-e2e/

Playwright specs that drive the real simulator in Chromium: draw strokes, seal the ring, assert the wired-up UI.

## How to run

```sh
npm run test:e2e                  # playwright install && playwright test
npx playwright test fire-shoot    # one spec
npx playwright test --ui
```

Locally the config starts `npm run dev` on 5173 and reuses an already-running server. CI builds and serves `npm run preview` on 4173.

**Never run the suite from a git worktree while a dev server is up on 5173.** `reuseExistingServer` makes the worktree's run silently exercise the main checkout's code — screenshots and golden baselines then pin the wrong tree. From a worktree, point a throwaway config at a free port instead.

## Map

- [`pages/SpellCanvasPage.ts`](pages/SpellCanvasPage.ts) — the page object. Every canvas interaction goes through it.
- [`fire-shoot.e2e.ts`](fire-shoot.e2e.ts) — the reference cast: prepared, sealed, active, then the beats read off the effect canvas, plus a seal-to-active latency benchmark. It proves the production wiring; whether the fire _looks_ right is the look tier's job.
- [`eraser.e2e.ts`](eraser.e2e.ts) — erase splits a stroke and undo restores it, read from glyph-canvas pixels.
- [`shape-placement.e2e.ts`](shape-placement.e2e.ts) — palette drag-to-place, arrange mode, ring z-order, copy and paste.
- [`library.e2e.ts`](library.e2e.ts), [`spell-presets.e2e.ts`](spell-presets.e2e.ts) — database backed, skipped by default.
- [`golden-look.e2e.ts`](golden-look.e2e.ts) — the look golden tier: the Spell Effect Lab's effect canvas per lab preset at fixed timestamps. A case with no baseline skips.
- [`helpers/strokes.ts`](helpers/strokes.ts) `circleStroke`, [`helpers/castProbe.ts`](helpers/castProbe.ts) the in-page half of reading a cast, [`helpers/account.ts`](helpers/account.ts) auth and drawer helpers, [`helpers/types.d.ts`](helpers/types.d.ts) `NormPoint` / `NormStroke` / `RingGeometry`, [`fixtures/sampleSpells.ts`](fixtures/sampleSpells.ts) `FIRE_SHOOT`.

## Invariants and gotchas

- **Go through `SpellCanvasPage`.** `goto`, `waitForReady`, `drawStroke`, `drawOpenRing`, `sealRing`, `castSpell`, `armCastClock`, `measureActivation`, `sampleCast`, `waitForCastEnd`, `expectActive` are the vocabulary. Add new interactions to the page object, not inline in a spec.
- **Wait on `data-input-ready`, not on status text.** `waitForReady()` does this. The status leaves "Loading" before drawing capture attaches its pointer listeners, so a stroke drawn on status alone is silently dropped.
- **Seal last.** `castSpell` draws the open ring, then the symbols, then the closing arc. Closing the ring sets `canvasLocked` and every later freehand stroke is ignored. Pass `skipSeal: true` to stop at prepared.
- **Coordinates are normalized 0..1 over the canvas box**, then inset toward the center by `drawScale` (0.85). The 1024x1024 square viewport exists so the cover-square canvas fills the window exactly and those coordinates map 1:1. Do not change the viewport, it moves every stroke.
- **Drive input with `page.mouse`**, the way `drawStroke` does. Real pointer events flow through drawing capture, and it already emits down, moves, up, plus a settle delay.
- **Recognition is async and debounced.** Each `drawStroke` waits `settleMs` (default 90). Raise it for a slow machine rather than sprinkling bare `waitForTimeout` into a spec.
- **Assert on the settled status.** The values are `Loading`, `No ring detected`, `Prepared spell`, `Active spell`, plus the `Ring closed - ...` family for a sealed ring with no usable sigil. That family also shows transiently while the ML pass refines a template result, so never assert on the first status you see after sealing. `expectActive()` waits on both the text and `data-status-class="active"`.
- **A cast is a one-shot with beats, and the clock starts at activation.** R-01: `charge` spans the 980ms portal tilt and carries the ambient medium alone, `strike` is the next 320ms and brings the spell itself, `body` is elastic, then `release` and `afterglow` fade it out; past `totalMs` the effect canvas is empty. Read the beats through `sampleCast` and `waitForCastEnd` on the page object, which measure from the clock `armCastClock`/`measureActivation` stamps. Sample a whole beat sequence inside **one** `page.evaluate` pass, the way `sampleCast` does — a round trip between two samples can step the cast past a beat boundary.
- **`reducedMotion: 'reduce'` is deliberate.** Drawer and panel slide transitions are guarded by it. Without it a drag reads a palette card's box mid-animation and lands off the moving card.
- **`fullyParallel: false` is deliberate.** Casts contend for the recognition worker pool. Retries are 1 locally and 2 on CI to absorb timing flake.
- **Escape closes drawers** (`closeDrawer`). The open drawer covers the tab rail, so clicking the tab a second time does nothing.
- **Two different spell cards.** `spell-card` is a My Spells drawer row, `library-spell-card` is a library plate. Filter by name as well as by test id.
- **The look tier is one list, because there is one engine.** Every lab preset at 700/1150/2200ms, read off R-01's beat clock: 700ms is charge _content_ (the ambient medium, with the spell's own manifestation still to come), 1150ms is inside the strike, 2200ms is mid-body of a 5s cast. Two more cases run `column-balanced` under the `crystal` and `aeroform` sigils, so the only difference between those baselines and the plain one is the look row. 60 baselines, all named `cast-*`.
- **Look baselines live in `golden-look.e2e.ts-snapshots/`.** Regenerate with `npm run test:golden:look:update` after any deliberate visual change, and eyeball the diff before committing. If a baseline is missing its case skips with a hint instead of failing. The 0.5% pixel tolerance only absorbs Chromium's gradient dithering: the cast engine is seeded end to end and reads no clock, so nothing else should move. Note that the lab synthesizes its own `SpellIR.signature`, which the score seeds from, so a change to how that signature is composed reseeds every parcel stream and rewrites all 60 baselines even when no behaviour moved; prove that case against the cast tier, which pins its own signature. The primary gate is that tier (`npm run test:golden`, see [`../tests/CLAUDE.md`](../tests/CLAUDE.md)); this one only catches what pixels can say and motion cannot.
- **A look frame is driven, never waited on.** `?preset=<id>&frameMs=<n>` on `/tools/spell-effect-lab` loads a preset and steps the preview to that timestamp on a scripted clock, then stops and stamps `data-golden-frame` on the effect canvas. `&sigil=<id>` picks the look row, narrowed against the lab's own sigil list so a URL cannot select one that does not exist. The hook is test-only and lives in [`../src/routes/tools/spell-effect-lab/lab-goldens.ts`](../src/routes/tools/spell-effect-lab/lab-goldens.ts).
- **Database specs are opt-in and destructive.** `library` and `spell-presets` call `test.skip(DB_SPECS_DISABLED, ...)` unless `E2E_DB=1`, because they register accounts and write spells. A local `.env` may point `DATABASE_URL_VPS` at the production database. Start the throwaway Postgres first (`docker compose -f docker-compose.dev.yml up -d`, then `npm run db:migrate`) and repoint `DATABASE_URL_VPS` at it before enabling.

## Writing a new spec

1. Name it `<subject>.e2e.ts`. `testMatch` is `**/*.e2e.{ts,js}`, so a `.test.ts` here never runs.
2. Open with `const canvas = new SpellCanvasPage(page); await canvas.goto();`.
3. To cast, replay a fixture: `castSpell(FIRE_SHOOT, { skipSeal: true })`, assert `Prepared spell`, then `sealRing(DEFAULT_RING)` and `expectActive()`.
4. To build a diagram without hand-drawing it, open the Shapes panel and drag `#shapesRootPanel .shape-card .reference-preview` onto the canvas (see `shape-placement.e2e.ts`). A dropped ring lands prepared with a 45 degree gap at the palette's own radius, not `DEFAULT_RING`'s, so seal it against its own geometry.
5. Prefer `getByTestId`. When a control has no test id, add a `data-testid` to the component instead of reaching for a CSS selector.
6. For a database spec, guard it with `test.skip(DB_SPECS_DISABLED, DB_SPECS_REASON)` and reuse `uniqueUsername`, `registerViaMySpells`, `saveCurrentSpell`.

## Related

- [`../playwright.config.ts`](../playwright.config.ts) — viewport, servers, retries, and why each is set.
- [`../tests/CLAUDE.md`](../tests/CLAUDE.md) — the pure-logic counterpart. Prove the logic there, prove the wiring here.
- [`../docs/CODE_GUIDE.md`](../docs/CODE_GUIDE.md) — Rule 9 on test ids and the unit/e2e split.
