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
