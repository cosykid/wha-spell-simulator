// SpellIR — the compiler's output, the renderer's input.

import type { Vector } from './geometry.js';
import type { ElementId } from './dictionary.js';
import type { SpellField } from './spell-field.js';
import type { SimSeal } from '../sim3d/core/model.js';

export interface SpellDirection {
	x: number;
	y: number;
	z: number;
	xTiltDeg: number;
	yTiltDeg: number;
	tiltFromZDeg: number;
}

export interface Manifestation {
	strength: number;
	point?: Vector;
	radius?: number;
	rigidity?: number;
}

export interface SemanticDeltas {
	force: number;
	focus: number;
	spread: number;
	range: number;
	lifetimeBias: number;
}

export interface SpellIR {
	type: 'SpellIR';
	active: boolean;
	prepared: boolean;
	valid: boolean;
	status: string;
	activatedAt: number | null;
	element: ElementId | null;
	/** The id of the primary sigil, so effects can vary by element-variant sigils (e.g. crystal, aeroform). */
	sigil: string | null;
	elementConfidence: number;
	primarySizeNorm: number;
	/** Primary sigil footprint divided by its regular size; 1 = regular, <1 weaker, >1 stronger. */
	sizeRatio: number;
	/** 0..1 spell strength derived from `sizeRatio`. */
	strength: number;
	effectScale: number;
	primaryManifestation: string;
	manifestations: Record<string, Manifestation>;
	/** Per-sign force operators; drives the field particle effect when non-empty. */
	field: SpellField;
	/** Physical seal for the 3D effect; null when no sign maps into the model. */
	seal: SimSeal | null;
	direction: SpellDirection;
	directionCoherence: number;
	gravity: number;
	force: number;
	spread: number;
	focus: number;
	range: number;
	duration: number;
	stability: number;
	quality: number;
	neatness: number;
	warnings: string[];
	signature: string;
}
