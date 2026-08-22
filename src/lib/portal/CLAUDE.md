# src/lib/portal

The portal: the paper an activated spell tilts into, and the projection that
puts the spell on it. One file, [`portal.ts`](portal.ts), and it is the **only**
place a portal number may live.

## What it owns

- **The numbers.** `PORTAL` holds the shrink, tilt, perspective, ground
  foreshortening, pivot, lift, and tilt duration. Nothing else declares one.
- **The CSS.** `portalCssVariables()` renders those numbers as custom
  properties. The app shell (`routes/+layout.svelte`) writes them onto
  `.app-content` once, and [`../styles/canvas.css`](../styles/canvas.css) draws
  the tilt from them. The stylesheet holds no tilt values of its own.
- **The projection.** `portalScaledRing()` and `activePortalPlane()` turn a
  detected ring into the on-screen ellipse; `projectSeal()` places a seal-space
  point on it; `projectSealDirection()` does the same for a direction.
- **The spaces.** `sealToWorld()` / `worldToSeal()` are the one conversion in
  the codebase, per spec R-03.

## The identity

The CSS ellipse fixes a camera. A ground circle squashes to `scaleY`, so the
viewer's elevation is `asin(scaleY)`, and then everything follows from that one
angle:

| Quantity                            | Factor           | Value |
| ----------------------------------- | ---------------- | ----- |
| ground distance, per seal unit      | `sin(elevation)` | 0.44  |
| height off the paper, per seal unit | `cos(elevation)` | 0.898 |

`projectSeal` returns `depth` alongside the screen point: distance from the
viewer in seal units, relative to the ring center, larger being farther. It is
there for painter-order sorting and size attenuation, which is most of why flat
2D effects read flat.

## Invariants and gotchas

- **Never mirror a portal number.** The old bug this directory exists to kill
  was `PORTAL_SHRINK` in TS and `scale(0.45)` in CSS drifting apart, plus a
  particle height that used 0.8 while the ground plane implied 0.898. Add a
  field to `PORTAL`, never a second copy.
- **`scaleY` is fitted, not derived from `tiltDeg`.** `perspective()` and the
  off-center pivot make the drawn paper flatter than `cos(62deg)`. Change the
  tilt and the ellipse stops matching until `scaleY` is re-fitted against a
  screenshot of the activated paper.
- **`PORTAL.tiltMs` is the spec's charge beat (R-01).** It is both the CSS
  animation length and the length of the cast's first beat in
  [`../cast/score/beats.ts`](../cast/CLAUDE.md), so the paper always finishes
  tilting before the spell erupts — while the ambient medium draws in over it.
  The superseded field renderer reads it as a flat emission hold through
  `CONFIG.renderer.portalTiltMs`, which is why its charge is dead time.
- **`portalFit` is measured, not fixed.** It is the fraction of the canvas
  height that is on screen, passed in by
  [`../ui/simulator/`](../ui/simulator/CLAUDE.md) and mirrored by the
  `--portal-fit` custom property. Both scale the pivot and the lift the same
  way. It defaults to 1.
- **This module is pure.** No DOM beyond reading `canvas.width` / `height`, no
  runes, no config import. Unit tested in [`../../../tests/portal.test.ts`](../../../tests/portal.test.ts).

## Related

- [`../renderer/CLAUDE.md`](../renderer/CLAUDE.md) — the effects that project
  through this module.
- [`../../../docs/animation-spec.md`](../../../docs/animation-spec.md) — R-01
  (beats), R-03 and R-04 (the canvas-to-world mapping).
- [`../../../docs/animation-redesign.md`](../../../docs/animation-redesign.md) —
  where `cast/` will consume `depth` for painter order and attenuation.
