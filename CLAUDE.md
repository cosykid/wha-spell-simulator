# CLAUDE.md

Guidance for agents (and humans) working in this repository.

## Coding standards

**Read [`docs/CODE_GUIDE.md`](docs/CODE_GUIDE.md) before writing or refactoring
code, and follow it.** The core rule is: _code should be written to minimize the
time it takes for someone else to understand it._ In short:

- **Keep files small** — aim for under ~200–300 lines. When a file grows past
  that, split it by responsibility.
- **Provide a clear path to understanding** — an entry point (route, component,
  module) should read like a table of contents: high-level structure visible at
  a glance, details one named click away.
- **Build pages as a hierarchy of components** — extract repeated UI and any
  self-contained cluster of state + markup into its own component. If a subset
  of a page's reactive variables is used only by one chunk of the template,
  that chunk is a component.
- **Keep styles with the component** — put CSS in the component/page's scoped
  `<style>` block. Global CSS (`styles.css`) is only for truly global things:
  design tokens, the reset, base element styling.
- **Decouple behind small contracts** — separate _what_ from _how_. Add features
  by implementing a small interface (`Entity`, `Command`, `CanvasBehavior`), not
  by editing shared machinery. Lean on known patterns where they fit (the
  canvas system uses Composite / Command / Strategy) — and name them.
- **Comment sparingly and concisely** — comments are an escape hatch for when
  code can't speak for itself. Explain the _why_, keep each one self-contained,
  use plain sentences (no em dashes/semicolons). `@file`/`@component` on modules,
  `@example` on reusable API, implementation detail stays inline not in docstrings.
- **Name things in the domain's language** — reveal intent, and reuse the
  vocabulary (sigil, sign, ring, glyph, stroke, placement, entity, scene, …)
  consistently rather than inventing synonyms.
- **Keep state minimal, derive the rest** — a pure function of state is a
  `$derived`, not a synced `$state`; use `$effect` only for real side-effects.
  Move complex/shared state into a `.svelte.ts` module or context.
- **Push complex logic into pure functions and test it** — pure modules get unit
  tests (`tests/`), UI gets `data-testid` hooks and Playwright E2E (`tests-e2e/`).

When you finish a change, skim it against the checklist at the end of the guide.

## Project

Witch Hat Atelier Spell Simulator — a SvelteKit app that recognizes hand-drawn
spell glyphs and renders animated effects. See [`README.md`](README.md) for what
it does, how to run it locally, and the recognition pipeline overview.

## Directory guides

Each core directory carries its own `CLAUDE.md` with its contracts, invariants,
and extension recipes. **Read the guide for every directory you change.** The
pipeline, in order:

- [`src/lib/parser/`](src/lib/parser/CLAUDE.md) — strokes → `ClassifiedDrawing`/`GlyphAST` (recognition)
- [`src/lib/dictionary/`](src/lib/dictionary/CLAUDE.md) — the glyph corpus: sigil/sign JSON + SVG art
- [`src/lib/compiler/`](src/lib/compiler/CLAUDE.md) — `GlyphAST` → `SpellIR`: the gated `reading`, the resolved `plan` (where canon rulings live), activation, signature
- [`src/lib/cast/`](src/lib/cast/CLAUDE.md) — `SpellPlan` → pixels: score → cells → stage. The only effect path, in two user-selectable styles
  - [`src/lib/cast/cells/`](src/lib/cast/cells/CLAUDE.md) — the performers: one bespoke cell per track kind, and the forms it is built from
  - [`src/lib/cast/stage/`](src/lib/cast/stage/CLAUDE.md) — the three.js stage: the portal-true camera, the fixed step, the WebGL surface
  - [`src/lib/cast/classic/`](src/lib/cast/classic/CLAUDE.md) — the frozen Canvas2D engine restored from `b439a01`, behind the same seam

Around it:

- [`src/lib/renderer/`](src/lib/renderer/CLAUDE.md) — the glyph overlay: ink glow, seal guides, debug layer. Draws no spells
- [`src/lib/portal/`](src/lib/portal/CLAUDE.md) — the tilted paper: one owner of the CSS tilt and the seal-to-screen projection
- [`src/lib/ui/canvas/`](src/lib/ui/canvas/CLAUDE.md) — the Entity/Command/Behavior canvas engine
- [`src/lib/ui/simulator/`](src/lib/ui/simulator/CLAUDE.md) — the main route's session, runtime, and locks
- [`src/lib/structures/`](src/lib/structures/CLAUDE.md) — spell presets and cross-boundary shapes
- [`src/lib/server/`](src/lib/server/CLAUDE.md) — auth, Postgres, migrations (read its DB warning first)
- [`tests/`](tests/CLAUDE.md) — unit-suite rules · [`tests-e2e/`](tests-e2e/CLAUDE.md) — Playwright rules

Everything below `SpellIR` was rebuilt by the animation redesign, specified in
[`docs/animation-spec.md`](docs/animation-spec.md) (behavior rulings) and
[`docs/animation-redesign.md`](docs/animation-redesign.md) (architecture and
migration record). Read both before touching `compiler/plan/` or `cast/`.

## Environment gotchas

- A fresh git worktree needs its own `npm install`, or Vite serves 403s and the
  app never hydrates. Run `npx svelte-kit sync` before `npm run check` there.
- Before `npm run db:migrate` or DB-backed tests, check where `DATABASE_URL_VPS`
  points — a local `.env` may target the production database. Details in
  [`src/lib/server/CLAUDE.md`](src/lib/server/CLAUDE.md).
