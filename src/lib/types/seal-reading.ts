/**
 * @file SealReading — the Reading layer's output, and the only shape downstream
 * spell code is allowed to see. Recognition noise (poses off by 122 degrees, a
 * dropped `ml.accepted` flag zeroing every facing) caused as many failures as
 * physics did, so gating it is a layer with its own contract.
 *
 * Contract: downstream code never sees a raw `Recognition`. Specified in
 * `docs/animation-redesign.md` section 1. That document writes the 2D vectors as
 * `Vec2`; this repo already names that shape `Vector`.
 */

import type { Vector } from './geometry.js';
import type { ElementId } from './dictionary.js';

/** Where a sign's facing came from, best evidence first. Trust declines down the list. */
export type FacingSource = 'ml-pose' | 'template-rotation' | 'stroke-geometry' | 'canonical';

/** The quantized facing buckets rules branch on. Never a continuous angle. */
export type FacingClass = 'inward' | 'outward' | 'tangential-cw' | 'tangential-ccw' | 'oblique';

/** What the reading had to say about the drawing it gated. */
export type ReadingNote = 'facing-untrusted' | `snapped-${number}-fold`;

export interface SignReading {
	/** Dictionary sign id. */
	id: string;
	/** Read from the sign's JSON `semantic.manifestation`, never inferred. */
	manifestation: string;
	/** Seal space: ring center origin, one unit = ring radius, y screen-down. */
	at: Vector;
	/** Drawn ink length in seal units. Feeds the R-05 budget. */
	length: number;
	/** Unit, in-plane. Continuous, so a facing keeps its measured angle. */
	facing: Vector;
	/** Quantized `facing`. Rules branch on this. */
	facingClass: FacingClass;
	facingSource: FacingSource;
	/** 0..1, gates interpretation. Below the R-06 floor the facing is not direction evidence. */
	facingTrust: number;
	/** 0..1, size and layer only. NOT confidence. */
	power: number;
}

export interface SealReading {
	signs: SignReading[];
	/** Sigil id, not element: crystal is not earth. */
	sigil: string | null;
	element: ElementId | null;
	/** The drawing's overall precision. */
	quality: number;
	/** n-fold symmetry detected, after snapping. */
	symmetry: number | null;
	notes: ReadingNote[];
}
