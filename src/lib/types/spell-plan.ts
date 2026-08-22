/**
 * @file SpellPlan — the Plan layer's output, and the only shape canon rulings
 * are written into. Specified in `docs/animation-redesign.md` section 2; the
 * rulings it carries are R-05 through R-13 in `docs/animation-spec.md`.
 *
 * Small, serializable and text-diffable on purpose: a plan text snapshot is the
 * cheap regression tier below PNG diffing. The redesign document writes 2D
 * vectors as `Vec2`; this repo already names that shape `Vector`.
 */

import type { Vec3, Vector } from './geometry.js';
import type { ElementId } from './dictionary.js';

/** R-10. Create-class sigils emit their own element; manipulate-only sigils move the ambient medium. */
export type PlanMode = 'create' | 'manipulate';

/**
 * The named motion primitives a plan may talk about. The Score layer types its
 * tracks on the same names, so a coupling stays readable across the seam.
 */
export type PlanPrimitive = 'burst' | 'jet' | 'fan' | 'vortex' | 'hold' | 'intake' | 'vessel';

/** R-09. Which part of the seal disc emits. Radii are in seal units. */
export type Aperture =
	| { kind: 'disc'; bias?: Vector }
	| { kind: 'annulus'; inner: number; outer: number; arcDeg?: number; bearingDeg?: number }
	| { kind: 'sector'; bearingDeg: number; halfAngleDeg: number; inner: number; outer: number }
	| { kind: 'band'; normal: Vector; offset: number; width: number }
	| { kind: 'point'; at: Vector };

/**
 * R-09. The region family's whole output: the valve. A plan spreads these four
 * fields flat so every one of them is visible in a text snapshot.
 *
 * `exhaust` is a direction in seal space. A rotationally symmetric aperture with
 * no in-plane component exhausts along its own outward normal, which is how the
 * all-outward moat (rule 3) says "radial" in a single vector.
 */
export interface Region {
	aperture: Aperture;
	exhaust: Vec3;
	/** 0..1, how strictly the aperture masks. Grows with member count. */
	hardness: number;
	/** 1 and up, how far the valve throws. Grows with member count. */
	reach: number;
}

/** R-13. The levitation family as a spring: where it grips and how hard. */
export interface HoldSpec {
	/** Hover locus in seal space; `z` is height above the seal plane. */
	at: Vec3;
	/**
	 * Grip strength, the levitation clash. Zero on a rotor: R-16 spins without a
	 * grip, so a hold may exist on the strength of its `spin` alone.
	 */
	grip: number;
	/** Torque about the hover axis; positive is counter-clockwise seen from +z. */
	spin: number;
	/** Levitation ink budget, kept separate from the column budget. */
	budget: number;
}

/** R-13. The pull family as the ambient coupling. */
export interface IntakeSpec {
	/** Pull ink budget, kept separate from the column budget. */
	budget: number;
	/** Radial draw: positive inhales, negative pushes the ambient medium away. */
	draw: number;
	/** Swirl about the seal axis; positive is counter-clockwise seen from +z. */
	swirl: number;
	/** Net lateral bias of the ambient stream. */
	lateral: Vector;
}

/** R-13. The orb family as a vessel. Deferred: always null in v1. */
export interface VesselSpec {
	at: Vec3;
	radius: number;
	/** Solid-body swirl of the contents. */
	stir: number;
}

/**
 * A declared interaction between two primitives. Superposition used to make
 * these emergent and unpredictable; naming them puts them in a text golden.
 */
export interface Coupling {
	holder: PlanPrimitive;
	captures: PlanPrimitive[];
}

/**
 * What the plan had to say about the seal it resolved. Notes never change
 * behavior here; they are how a later layer (and a reviewer) sees which ruling
 * or open question shaped a plan.
 */
export type PlanNote =
	/** Passed through from the reading: at least one sign's facing is not evidence (R-06). */
	| 'facing-untrusted'
	/** R-08: dispersion ink is present, so the body beat runs as a slow leak. */
	| 'dispersion-leak'
	/** Budget with no aim, no fan and no swirl. R-15: it fires the bare shockwave. */
	| 'inert-quadrupole'
	/** Levitation ink whose convergence points outward, so it grips nothing (R-17). */
	| 'levitation-inverted'
	/** Levitation ink with neither a grip nor a rotor to show for it (R-16, R-17). */
	| 'levitation-inert'
	/** Pull is the only budget-bearing family, so the seal manifests nothing of its own (R-11). */
	| 'intake-only'
	/** Chevrons in an arrangement R-09's table does not name; the default disc applies. */
	| 'region-unruled'
	/** A manifestation with no ruling yet. Its ink still pays into the budget (PDF defect I). */
	| `unmodeled-${string}`;

export interface SpellPlan {
	version: 1;
	/** Sigil id, not element: crystal is not earth. */
	sigil: string | null;
	element: ElementId | null;
	mode: PlanMode;
	/** R-05. In-plane lateral momentum plus the clash's vertical component. */
	aim: Vec3;
	/** R-05/R-07. The plane-hugging radial fan; positive only. */
	dispersion: number;
	/** R-05. Swirl about the seal axis; positive is counter-clockwise seen from +z. */
	circulation: number;
	/** R-05. The burst budget: column ink plus ink that only pays power (R-13). */
	budget: number;
	/** R-09. The four `Region` fields, spread flat so a text snapshot shows each one. */
	aperture: Aperture;
	exhaust: Vec3;
	hardness: number;
	reach: number;
	hold: HoldSpec | null;
	intake: IntakeSpec | null;
	vessel: VesselSpec | null;
	/** R-13. The lens factor: 1 is no convergence ink, higher packs everything tighter. */
	focus: number;
	/** The drawing's overall precision, carried from the reading. */
	quality: number;
	couplings: Coupling[];
	notes: PlanNote[];
}
