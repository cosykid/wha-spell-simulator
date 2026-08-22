/**
 * @file The `Look` contract: everything about how a parcel is painted, and
 * nothing about how it moves.
 *
 * Looks are **data**. The one architectural idea worth salvaging from the two
 * abandoned 3D attempts is a look table, because it is what stops an art fix
 * from being smuggled in as a physics term. That only holds while the data
 * cannot reach the behavior, so this directory may not import from
 * `compiler/plan/` or `cast/sim/`, and one `no-restricted-imports` rule in
 * `eslint.config.js` says so out loud.
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

/** Which pre-baked sprite a look blits. `../render/sprites.ts` bakes one per (sprite, tint). */
export type SpriteId = 'disc' | 'spark' | 'streak';

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
 * One sigil's or element's five roles. A row is complete on purpose: resolution
 * picks a whole row and then indexes it, so there is no half-resolved look and
 * no per-field fallback chain to reason about.
 */
export type LookRow = Record<LookRole, Look>;

/** The table `table.ts` resolves against, keyed on sigil id with element rows as the fallback tier. */
export type LookTable = Record<string, LookRow>;
