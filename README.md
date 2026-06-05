# Witch Hat Atelier Spell Simulator

A fan-made browser-based spell drawing simulator inspired by _[Witch Hat Atelier](https://en.wikipedia.org/wiki/Witch_Hat_Atelier)_.

<div align="center">
  <img src="./assets/demo.gif" width="720"/>
  <p>Try here: <a href="https://ytnrvdf.github.io/wha-spell-simulator">https://ytnrvdf.github.io/wha-spell-simulator</a></p>
</div>

## Fan Project Notice

This is an unofficial fan-made project for learning, experimentation, and appreciation. It is not affiliated with, endorsed by, or sponsored by the official creators, publishers, licensors, or production partners of _Witch Hat Atelier_.

_Witch Hat Atelier_ and related names, artwork, symbols, and trademarks belong to their respective rights holders. The sigils, signs, spell terminology, and visual effects in this project are partial fan references and interactive interpretations, not official assets or canonical rules.

## What It Does

The app turns a freehand spell diagram into parser output, compiled spell behavior, and animated canvas effects.

- Lets you draw spell diagrams on a paper-like canvas.
- Detects one enclosing ring and distinguishes prepared versus active spells.
- Recognizes dictionary-backed primary sigils for fire, water, wind, earth, and light.
- Recognizes signs that modify direction, levitation, convergence, force, spread, focus, range, duration, and stability.
- Produces parser diagnostics, `GlyphAST`, and `SpellIR` output for inspection.
- Renders animated element effects from the compiled spell behavior.
- Shows sample spell layouts in the Dictionary panel as drawing references.
- Includes reference tools for making, viewing, and testing stroke templates, plus a spell effect lab for visual and animation tuning.

## Current Limitations

- The app supports one enclosing spell ring at a time. Multiple rings are detected as unsupported.
- The current compiler expects one primary sigil. Multiple primary sigils are detected as unsupported.
- Recognition is based on local stroke templates, so it works best with clean, deliberate drawings.
- The recognizer is not perfect. Some valid-looking drawings may fail to match, and some rough drawings may need to be redrawn more clearly.
- The dictionaries only cover a small fan-made subset of sigils, signs, and observed spell ideas.
- The visual effects are interpretive canvas animations, not a faithful reproduction of manga or anime effects.
- Raster images can be used as visual references, but the app cannot recover true stroke order from an image.
- Closed but invalid diagrams may show diagnostics, but they do not fall back to another element.
- This is a browser prototype, not a production drawing engine or general symbol recognizer.

## Run Locally

Install dependencies:

```sh
npm install
```

Start the SvelteKit dev server:

```sh
npm start
```

Then open:

```txt
http://127.0.0.1:5173/
```

To build the static site (output in `build/`):

```sh
npm run build
```

## Reference Tools

Companion lab tools are built into the app as SvelteKit routes and share the
simulator's core modules. Start the dev server (`npm start`) and open the
`/tools` index, or link to it from the **Tools** button in the app header:

```txt
/tools                          Index of all reference tools
/tools/stroke-template-maker    Draw a symbol and export a strokeTemplate
/tools/stroke-template-viewer   Preview a pasted strokeTemplate and its metrics
/tools/sigil-sign-detector-lab  Score a drawn symbol against the dictionary
/tools/spell-effect-lab         Tune a synthetic SpellIR and preview effects
```

## Tests

Run the Node test suite:

```sh
npm test
```

## Documentation

- [Dictionary authoring](docs/dictionary-authoring.md)
- [Parser and spell semantics rules](docs/play-rules.md)
- [Parsed glyph output contract](docs/glyph-ast.md)
- [Compiled spell output contract](docs/spell-ir.md)
- [Visual effect renderer notes](docs/effect-rendering.md)
