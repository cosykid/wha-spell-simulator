# tests-e2e/

Playwright specs that drive the real simulator in Chromium: draw strokes, seal the ring, assert the wired-up UI.

## How to run

```sh
npm run test:e2e                  # playwright install && playwright test
npx playwright test fire-shoot    # one spec
npx playwright test --ui
```

Locally the config starts `npm run dev` on 5173 and reuses an already-running server. CI builds and serves `npm run preview` on 4173.

## Map

- [`pages/SpellCanvasPage.ts`](pages/SpellCanvasPage.ts) — the page object. Every canvas interaction goes through it.
- [`fire-shoot.e2e.ts`](fire-shoot.e2e.ts) — the reference cast: prepared, sealed, active, plus a seal-to-active latency benchmark.
- [`eraser.e2e.ts`](eraser.e2e.ts) — erase splits a stroke and undo restores it, read from glyph-canvas pixels.
- [`shape-placement.e2e.ts`](shape-placement.e2e.ts) — palette drag-to-place, arrange mode, ring z-order, copy and paste.
- [`library.e2e.ts`](library.e2e.ts), [`spell-presets.e2e.ts`](spell-presets.e2e.ts) — database backed, skipped by default.
- [`helpers/strokes.ts`](helpers/strokes.ts) `circleStroke`, [`helpers/account.ts`](helpers/account.ts) auth and drawer helpers, [`helpers/types.d.ts`](helpers/types.d.ts) `NormPoint` / `NormStroke` / `RingGeometry`, [`fixtures/sampleSpells.ts`](fixtures/sampleSpells.ts) `FIRE_SHOOT`.

## Invariants and gotchas

- **Go through `SpellCanvasPage`.** `goto`, `waitForReady`, `drawStroke`, `drawOpenRing`, `sealRing`, `castSpell`, `measureActivation`, `expectActive` are the vocabulary. Add new interactions to the page object, not inline in a spec.
- **Wait on `data-input-ready`, not on status text.** `waitForReady()` does this. The status leaves "Loading" before drawing capture attaches its pointer listeners, so a stroke drawn on status alone is silently dropped.
- **Seal last.** `castSpell` draws the open ring, then the symbols, then the closing arc. Closing the ring sets `canvasLocked` and every later freehand stroke is ignored. Pass `skipSeal: true` to stop at prepared.
- **Coordinates are normalized 0..1 over the canvas box**, then inset toward the center by `drawScale` (0.85). The 1024x1024 square viewport exists so the cover-square canvas fills the window exactly and those coordinates map 1:1. Do not change the viewport, it moves every stroke.
- **Drive input with `page.mouse`**, the way `drawStroke` does. Real pointer events flow through drawing capture, and it already emits down, moves, up, plus a settle delay.
- **Recognition is async and debounced.** Each `drawStroke` waits `settleMs` (default 90). Raise it for a slow machine rather than sprinkling bare `waitForTimeout` into a spec.
- **Assert on the settled status.** The values are `Loading`, `No ring detected`, `Prepared spell`, `Active spell`, plus the `Ring closed - ...` family for a sealed ring with no usable sigil. That family also shows transiently while the ML pass refines a template result, so never assert on the first status you see after sealing. `expectActive()` waits on both the text and `data-status-class="active"`.
- **Spell effects are one-shot.** Emission is held back for the 980ms portal tilt, runs full for the spell's duration, then fades. If you sample effect-canvas pixels, do it inside one `page.evaluate` pass before the fade.
- **`reducedMotion: 'reduce'` is deliberate.** Drawer and panel slide transitions are guarded by it. Without it a drag reads a palette card's box mid-animation and lands off the moving card.
- **`fullyParallel: false` is deliberate.** Casts contend for the recognition worker pool. Retries are 1 locally and 2 on CI to absorb timing flake.
- **Escape closes drawers** (`closeDrawer`). The open drawer covers the tab rail, so clicking the tab a second time does nothing.
- **Two different spell cards.** `spell-card` is a My Spells drawer row, `library-spell-card` is a library plate. Filter by name as well as by test id.
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
