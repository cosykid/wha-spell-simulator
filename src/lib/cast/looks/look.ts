/**
 * @file The `Look` contract: everything about how a parcel is colored, and
 * nothing about how it moves or what shape it takes.
 *
 * Looks are **data**. The one architectural idea worth salvaging from the two
 * abandoned 3D attempts is a look table, because it is what stops an art fix
 * from being smuggled in as a physics term. That only holds while the data
 * cannot reach the behavior, so this directory may not import from
 * `compiler/plan/`, `cast/cells/` or `cast/stage/`, and one
 * `no-restricted-imports` rule in `eslint.config.js` says so out loud.
 *
 * A row says two things and no more. The five role `Look`s carry color and
 * compositing, which is all a row may say about one part of a form. Everything
 * about form and motion texture is said once, for the whole row, on its
 * `MaterialProfile`. The split is deliberate: the deleted 2D painter let a row
 * name a sprite and a pixel size, and those numbers only meant anything to that
 * one painter. What survives the renderer is color, so that is what a role
 * keeps.
 *
 * The five roles a track may ask a row for:
 *
 * | role    | what it paints                                               |
 * | ------- | ------------------------------------------------------------ |
 * | `core`  | the hot center of an event, brightest and shortest lived     |
 * | `body`  | the mass of the manifestation, the element's own color       |
 * | `wisp`  | the thin outer medium, faint and the last to leave           |
 * | `ember` | a fast fleck thrown off the body, small and short lived      |
 * | `skin`  | matter with a surface rather than light, hence `source-over` |
 */

import type { LookRole } from '../../types.js';

/** A color as sRGB channels, 0..255. `volume/pigment.ts` converts them for the renderer. */
export type Rgb = readonly [red: number, green: number, blue: number];

/** The gradient a form is inked with: hot center, cooler rim. */
export interface Tint {
	core: Rgb;
	edge: Rgb;
}

export interface Look {
	tint: Tint;
	blend: 'lighter' | 'source-over';
}

/**
 * How the cell stage renders this row's ink: everything about form and motion
 * texture that a tint could not say. Colors stay on the role `Look`s and a
 * profile never repeats them. Specified in `docs/animation-cells.md`.
 */
export interface MaterialProfile {
	/** 0..1, how much the form is its own light source; drives additive glow. */
	emissive: number;
	/** 0..1, the body's fill: earth is a mass, wind is barely there. */
	opacity: number;
	/** Ink edge treatment on ribbons and sheets. */
	edge: 'crisp' | 'feather' | 'serrated';
	/** Phase-locked stripe count on flowing surfaces; 0 is unbanded. */
	bands: number;
	/** Procedural break-up frequency, in seal units. */
	noiseScale: number;
	/** Base ribbon and tongue width, in seal units. */
	ribbonWidth: number;
	/** 0..1, spark and mote budget relative to the cell catalog's default. */
	garnishDensity: number;
	/** 0..1, afterimage lifetime scale. */
	trailPersistence: number;
	/** 0..1, high-frequency amplitude jitter: fire has it, water does not. */
	flicker: number;
	/** 0..1, low-frequency waviness of forms: water has it, crystal does not. */
	undulation: number;
	/** 0..1, apparent mass; biases attack and settle easing. */
	weight: number;
}

/**
 * One sigil's or element's five roles plus its material profile. A row is
 * complete on purpose: resolution picks a whole row and then indexes it, so
 * there is no half-resolved look and no per-field fallback chain to reason
 * about.
 */
export type LookRow = Record<LookRole, Look> & { material: MaterialProfile };

/** The table `table.ts` resolves against, keyed on sigil id with element rows as the fallback tier. */
export type LookTable = Record<string, LookRow>;
