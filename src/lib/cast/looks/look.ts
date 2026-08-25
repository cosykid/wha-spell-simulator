/**
 * @file The `Look` contract: everything about how a parcel is painted, and
 * nothing about how it moves.
 *
 * Looks are **data**. The one architectural idea worth salvaging from the two
 * abandoned 3D attempts is a look table, because it is what stops an art fix
 * from being smuggled in as a physics term. That only holds while the data
 * cannot reach the behavior, so this directory may not import from
 * `compiler/plan/`, `cast/cells/` or `cast/stage/`, and one
 * `no-restricted-imports` rule in `eslint.config.js` says so out loud.
 *
 * The five roles a track may ask a row for:
 *
 * | role    | what it paints                                              |
 * | ------- | ----------------------------------------------------------- |
 * | `core`  | the hot center of an event, brightest and shortest lived    |
 * | `body`  | the mass of the manifestation, the element's own color      |
 * | `wisp`  | the thin outer medium, faint and long trailed               |
 * | `ember` | a fast fleck thrown off the body, small and heavily stretched |
 * | `skin`  | matter with a surface rather than light, hence `source-over` |
 */

import type { CurveId, LookRole } from '../../types.js';

/** A color as additive channels, 0..255. Tuples so a tint is a cheap atlas key. */
export type Rgb = readonly [red: number, green: number, blue: number];

/**
 * Which shape a look's flecks take. The 2D painter baked one sprite per
 * (sprite, tint); the cell stage draws real geometry, so this now records the
 * row's intent rather than naming an atlas entry. `glint` is the one
 * anisotropic shape: a specular cross no radial gradient can make, and the only
 * way crystal's facets read as facets rather than as small cool balls.
 */
export type SpriteId = 'disc' | 'spark' | 'streak' | 'glint';

/** The gradient a sprite is baked with: hot center, cooler rim. */
export interface Tint {
	core: Rgb;
	edge: Rgb;
}

/** How many ghost sprites trail back along the velocity, and how wide they run. */
export interface Trail {
	/** Ghosts behind the head, each one painter step of travel further back. */
	frames: number;
	/** The first ghost's size, as a fraction of the head's. Later ones taper. */
	widthScale: number;
}

export interface Look {
	sprite: SpriteId;
	tint: Tint;
	/** Screen pixels across, lerped between the two by `fade` over the parcel's life. */
	sizePx: [min: number, max: number];
	trail: Trail | null;
	blend: 'lighter' | 'source-over';
	/** Sprite elongation along the projected velocity. 0 keeps it round. */
	stretch: number;
	/**
	 * Presence over the parcel's life, driving alpha and size together: 1 is fully
	 * there and 0 is gone. `decay` dies fast, `leak` lingers, `pulse` blooms and
	 * then goes.
	 */
	fade: CurveId;
}

/**
 * How the cell stage renders this row's ink: everything about form and motion
 * texture that sizes-and-tints could not say. Colors stay on the role `Look`s;
 * a profile never repeats them. Specified in `docs/animation-cells.md`.
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
