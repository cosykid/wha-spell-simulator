import type { Vec2 } from './math2';

export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'crystal' | 'light';

/**
 * Column: the directional "flow" sign. Parsed exactly as agreed:
 * application point = stem ∩ crossbar, direction = along the stem away from the
 * crossbar, len = stem length in seal units (λ = ℓ/R).
 */
export interface ColumnSign {
	kind: 'column';
	pos: Vec2;
	dir: Vec2; // unit
	len: number;
}

/** Region: the chevron "shutter" sign. Zero momentum; pure constraint. */
export interface RegionSign {
	kind: 'region';
	pos: Vec2;
	dir: Vec2; // unit, apex direction
}

/**
 * Levitation: the body-coupling arrow (GROUND_TRUTH §6). Parsed exactly like
 * column — application point = stem ∩ tail crossbar, direction = toward the
 * arrowhead — but its budget drives the force pair, not the element flow.
 */
export interface LevitationSign {
	kind: 'levitation';
	pos: Vec2;
	dir: Vec2; // unit
	len: number;
}

/**
 * Pull: the ambient-coupling arrow (GROUND_TRUTH §7). No tail crossbar: the
 * ruling parses it at the bare tail — application point = tail end, direction
 * = tail → tip (the way the arrow points), len = full tail-to-tip length.
 * Its budget drives ambient matter of the seal's element, never the spell's
 * own manifestation.
 */
export interface PullSign {
	kind: 'pull';
	pos: Vec2;
	dir: Vec2; // unit
	len: number;
}

/**
 * Convergence: the lens (GROUND_TRUTH §8). A closed regular triangle; the law
 * reads ink amount only — Q = Σλ. Orientation is ignored (the glyph is
 * 120°-symmetric) and position is decorative, so pos/dir only style the seal.
 */
export interface ConvergenceSign {
	kind: 'convergence';
	pos: Vec2;
	dir: Vec2; // unit, drawing only — the law ignores orientation
	len: number; // triangle side length in seal units
}

/**
 * Orb: the vessel (GROUND_TRUTH §9). A circle with a line through it —
 * non-directional: the law reads only the diameter (len). Like convergence,
 * pos/dir merely style the seal; the vessel is a whole-seal property.
 */
export interface OrbSign {
	kind: 'orb';
	pos: Vec2;
	dir: Vec2; // unit, through-line orientation — drawing only
	len: number; // circle diameter in seal units
}

export type Sign = ColumnSign | RegionSign | LevitationSign | PullSign | ConvergenceSign | OrbSign;

export interface Seal {
	name: string;
	desc: string;
	element: Element;
	signs: Sign[];
	/**
	 * Demo boundary condition (§9 pour ruling): a scripted spawner streams
	 * ambient element into the scene — the Water Orb's waterskin. Not seal ink.
	 */
	pour?: boolean;
}

/**
 * Can the levitation force pair grip this element's manifestation?
 * The first crack in strict element equivalence (GROUND_TRUTH §6): fire, water
 * and light manifest a holdable blob; wind is ambient fluid that streams
 * through the grip and turns the pair into sustained thrust.
 */
export const ELEMENT_GRIP: Record<Element, boolean> = {
	fire: true,
	water: true,
	earth: true,
	wind: false,
	crystal: true,
	light: true
};

export const ELEMENT_COLOR: Record<Element, number> = {
	fire: 0xff7043,
	water: 0x4fc3f7,
	earth: 0xbcaaa4,
	wind: 0xb2fff2,
	crystal: 0xce93d8,
	light: 0xffe082
};

/** SVG icon file for each element's sigil (served from /icons). */
export const ELEMENT_ICON: Record<Element, string> = {
	fire: 'fire.svg',
	water: 'water.svg',
	earth: 'earth.svg',
	wind: 'wind-directs-air.svg',
	crystal: 'crystal.svg',
	light: 'light.svg'
};
