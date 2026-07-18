/**
 * @file Seal and sign types for the physical spell model, ported from
 * theorycrafting/sim/src/model.ts (GROUND_TRUTH.md §1–§9). The app's
 * recognition pipeline compiles drawn glyphs into this shape via adapter.ts.
 */
import type { Vec2 } from './math2.js';
import type { ElementId } from '../../types/dictionary.js';

/**
 * The sim models crystal as its own element (distinct grip and look) while
 * the app dictionary files crystal as an earth-element sigil variant.
 */
export type SimElement = ElementId | 'crystal';

/**
 * Column: the directional "flow" sign. Application point = stem ∩ crossbar,
 * direction = along the stem away from the crossbar, len = stem length in
 * seal units (λ = ℓ/R).
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
 * Levitation: the body-coupling arrow (GROUND_TRUTH §6). Parsed like column
 * but its budget drives the force pair, not the element flow.
 */
export interface LevitationSign {
	kind: 'levitation';
	pos: Vec2;
	dir: Vec2; // unit
	len: number;
}

/**
 * Pull: the ambient-coupling arrow (GROUND_TRUTH §7). Its budget drives
 * ambient matter of the seal's element, never the spell's own manifestation.
 */
export interface PullSign {
	kind: 'pull';
	pos: Vec2;
	dir: Vec2; // unit
	len: number;
}

/**
 * Convergence: the lens (GROUND_TRUTH §8). The law reads ink amount only;
 * orientation is ignored (the glyph is 120°-symmetric).
 */
export interface ConvergenceSign {
	kind: 'convergence';
	pos: Vec2;
	dir: Vec2; // unit, drawing only
	len: number;
}

/**
 * Orb: the vessel (GROUND_TRUTH §9). Non-directional; the law reads only the
 * diameter. No app glyph maps here yet — kept so lab presets can exercise it.
 */
export interface OrbSign {
	kind: 'orb';
	pos: Vec2;
	dir: Vec2; // unit, drawing only
	len: number;
}

export type SimSign =
	| ColumnSign
	| RegionSign
	| LevitationSign
	| PullSign
	| ConvergenceSign
	| OrbSign;

export interface SimSeal {
	element: SimElement;
	signs: SimSign[];
}

/**
 * Can the levitation force pair grip this element's manifestation?
 * Fire, water, earth, crystal and light manifest a holdable blob; wind is
 * ambient fluid that streams through the grip and becomes sustained thrust
 * (GROUND_TRUTH §6 — the first crack in strict element equivalence).
 */
export const ELEMENT_GRIP: Record<SimElement, boolean> = {
	fire: true,
	water: true,
	earth: true,
	wind: false,
	crystal: true,
	light: true
};

/**
 * Buoyancy of the gathered pool: a charged fire grasp feeds its own vortex —
 * the collected mass rises and whirls even without Γ_p arrows (a fire whirl
 * makes its own spin). 0 = the pool lies flat and only churns with Γ_p.
 */
export const ELEMENT_VORTEX: Record<SimElement, number> = {
	fire: 1,
	water: 0,
	earth: 0,
	wind: 0,
	crystal: 0,
	light: 0
};

/**
 * Flat circulation of the gathered heap, rad/s: air never rests — a grasped
 * gale keeps swirling in the cushion (Grasping Wind) while solid and liquid
 * catches settle still unless Γ_p stirs them.
 */
export const ELEMENT_BREEZE: Record<SimElement, number> = {
	fire: 0,
	water: 0,
	earth: 0,
	wind: 1.9,
	crystal: 0,
	light: 0
};

export const ELEMENT_COLOR: Record<SimElement, number> = {
	fire: 0xff7043,
	water: 0x4fc3f7,
	earth: 0xbcaaa4,
	wind: 0xb2fff2,
	crystal: 0xce93d8,
	light: 0xffe082
};
