/**
 * @file The `Look` contract: everything about how a parcel is colored, and
 * nothing about how it moves or what shape it takes.
 *
 * Looks are **data**. The one architectural idea worth salvaging from the two
 * abandoned 3D attempts is a look table, because it is what stops an art fix
 * from being smuggled in as a physics term. That only holds while the data
 * cannot reach the behavior, so this directory may not import from
 * `compiler/plan/`, `cast/cells/`, `cast/stage/` or `cast/volume/`, and one
 * `no-restricted-imports` rule in `eslint.config.js` says so out loud.
 *
 * A row says two things and no more. The five role `Look`s carry color and
 * compositing, which is all a row may say about one part of a form. What a cell
 * may read off the row is said once, for the whole row, on its
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
 * The numbers a cell reads off its row, for the few things only the cell
 * performing a track can decide. Every field has a reader in `cells/`, and a
 * field that loses its last reader is deleted rather than kept as a record. How
 * a row is painted lives in the volume's own tables, `volume/pigment.ts` and
 * `volume/elements.ts`, which never read a profile.
 */
export interface MaterialProfile {
	/** 0..1, how far the row is its own light source. Sets the flash the intake reports. */
	emissive: number;
	/**
	 * How many arms a turning hold, or a vortex with no drawn fold, is born into.
	 * Both cells keep it between three and six.
	 */
	bands: number;
	/** 0..1, how thick the ambient medium runs. The shimmer scales its emission on it. */
	garnishDensity: number;
	/** 0..1, high-frequency jitter: fire has it, water does not. Strobes the intake's mouth. */
	flicker: number;
	/** 0..1, low-frequency waviness: water has it, crystal does not. Sways the vortex's foot. */
	undulation: number;
	/** 0..1, apparent mass. Slows the burst's shock at the strike and drags it with distance. */
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
