/**
 * @file SpellScore — the Score layer's output: a cast as an authored timeline.
 * Specified in `docs/animation-redesign.md` section 3; the beats it is cut into
 * are R-01 and R-02 in `docs/animation-spec.md`.
 *
 * Time is the primary axis. Every track carries an emission envelope and a drive
 * envelope, and both are required fields, so **a track without timing does not
 * type-check**. That is how "timing must be authored" stops being a convention.
 */

import type { Vec3, Vector } from './geometry.js';
import type { ElementId } from './dictionary.js';
import type { Aperture } from './spell-plan.js';

/** R-01. The five beats of a cast, in order. */
export type Beat = 'charge' | 'strike' | 'body' | 'release' | 'afterglow';

/** The time-shaping curves an envelope may take. Defined in `cast/score/envelopes.ts`. */
export type CurveId = 'attack' | 'hold' | 'decay' | 'pulse' | 'leak' | 'swell';

/** One beat's window on the cast clock. */
export interface BeatWindow {
	startMs: number;
	endMs: number;
}

/**
 * A quantity shaped over a span of beats. `from` and `to` are inclusive: the
 * window runs from the start of `from` to the end of `to`.
 */
export interface Envelope {
	from: Beat;
	to: Beat;
	curve: CurveId;
	/** Peak value. Emission gains are parcels per second; drive gains are a velocity scale. */
	gain: number;
}

/** R-10. Whether a track moves the spell's own manifestation or the ambient medium. */
export type Population = 'own' | 'ambient';

/** Which look row a track's parcels are painted with. */
export type LookRole = 'core' | 'body' | 'wisp' | 'ember' | 'skin';

export type PrimitiveKind =
	| 'jet'
	| 'fan'
	| 'vortex'
	| 'hold'
	| 'intake'
	| 'vessel'
	| 'burst'
	| 'shimmer';

/** Every primitive that plays. `vessel` is R-13's deferred orb and has no kernel yet. */
export type PlayedKind = Exclude<PrimitiveKind, 'vessel'>;

/**
 * R-05. The aimed column. The aim vector _is_ the lean: `axis` is where the long
 * sign points, never where it sits, so no separate lean term exists to invert.
 */
export interface JetParams {
	/** Unit, seal space. The beam axis, through the seal center. */
	axis: Vec3;
	/** Seal units per second at the nozzle. */
	speed: number;
	/** Seal units from the axis where the beam is still at half strength. */
	footprint: number;
	/** How hard the beam drafts surrounding parcels onto its own axis. */
	converge: number;
	/** Seal units along the axis where the beam has spent half its push. */
	reach: number;
}

/** R-07. Plane-hugging radial dispersion, and the swirl a routed vessel stirs into it. */
export interface FanParams {
	/** Seal units per second. Negative draws inward. */
	speed: number;
	/** Tangential rate; positive is counter-clockwise seen from +z. */
	swirl: number;
	/** Seal units per second out of the paper. Small: the fan hugs the plane. */
	rise: number;
	/** Radius where the radial push peaks, so the seal center is not a singularity. */
	core: number;
	/** Seal units above the paper the fan is allowed to climb to. */
	ceiling: number;
}

/** The strike-beat impulse every cast opens with: a ring thrown off the aperture. */
export interface BurstParams {
	/** Seal units per second at the ring's birth. */
	speed: number;
	/** Seal units per second out of the paper. */
	rise: number;
	/** Seal units where the impulse has spent half its speed. */
	reach: number;
	/** Fraction of the impulse still pushing one second in. */
	persistence: number;
}

/**
 * R-05's circulation as a Rankine cell, salvaged from `vortex.ts` on branch
 * `tc-field-canvas-rework`: a funnel that spins solid-body inside its core and
 * as `1/r` outside it, with a secondary cell (floor inflow, wall updraft, crown
 * spill) so matter cycles through the whirl instead of orbiting a flat stir.
 */
export interface VortexParams {
	/** Tangential rate on the funnel wall; positive is counter-clockwise from +z. */
	spin: number;
	/** Seal units: the core radius at the foot. Inside it the eye stays hollow. */
	footRadius: number;
	/** Seal units: the core radius at the crown, so the funnel flares as it climbs. */
	crownRadius: number;
	/** Seal units the crown stands at. Past it the swirl fades and parcels spill. */
	height: number;
	/** Seal units per second up the funnel wall. */
	updraft: number;
	/** Seal units per second the floor boundary layer feeds toward the foot. */
	feed: number;
	/** Seal units per second the crown sheds out and down, closing the cell. */
	spill: number;
}

/**
 * R-13's spring: levitation as a hover ceiling with a settle. The ceiling curve
 * is the `buoyancy` case of `field/sampleField.ts` moved into a kernel.
 */
export interface HoldParams {
	/** The hover locus in seal space; `z` is the ceiling the held mass parks at. */
	at: Vec3;
	/** Seal units per second of lift below that ceiling. */
	lift: number;
	/** Per second: how hard displaced parcels are drawn back onto the hover axis. */
	gather: number;
	/** Seal units of blob the mass churns in. Inside it the gather is off. */
	radius: number;
	/** Tangential rate about the hover axis; positive is counter-clockwise from +z. */
	spin: number;
	/** Radians per second of the slow bob the settled mass keeps, amplitude `radius`. */
	bobRate: number;
	/** Fastest a parcel may move and still count as arrived. Open canon question 5. */
	captureSpeed: number;
}

/** R-13's ambient coupling: the pull family drawing the ambient medium in. */
export interface IntakeParams {
	/** Seal units per second inward. Negative pushes the medium away: one signed kernel. */
	draw: number;
	/** Tangential rate; positive is counter-clockwise from +z. A swirled draw is helical inflow. */
	swirl: number;
	/** Seal units per second the stream is dragged along `lateral`. */
	drift: number;
	/** Unit, in-plane: which way that drag runs. */
	lateral: Vector;
	/** Radius where the draw peaks, so arriving matter pools instead of spiking. */
	pool: number;
	/** Seal units per second the swirl pumps up the seal axis. */
	rise: number;
	/** Seal units above the paper the stream may climb to. */
	ceiling: number;
}

/**
 * R-10 and R-11's thin ambient medium: the world every cast happens in, and the
 * one track R-01 gives the charge beat.
 */
export interface ShimmerParams {
	/** Seal units per second a young parcel draws toward the seal. */
	drift: number;
	/** Seconds over which that draw settles into a hover. */
	settleS: number;
	/** Seal units per second of the idle curl the settled medium keeps. */
	wander: number;
	/** Seal units above the paper the medium hovers around. */
	ceiling: number;
}

/**
 * Params by kind. `vessel` is R-13's deferred orb and maps to `never`, so a
 * track of the one unbuilt kind cannot be constructed until its params land.
 */
export interface PrimitiveParams {
	burst: BurstParams;
	jet: JetParams;
	fan: FanParams;
	vortex: VortexParams;
	hold: HoldParams;
	intake: IntakeParams;
	shimmer: ShimmerParams;
	vessel: never;
}

export interface Track<K extends PrimitiveKind = PlayedKind> {
	/** Stable and derived from the plan, e.g. `jet-aim`. Goldens key on it. */
	id: string;
	kind: K;
	population: Population;
	params: PrimitiveParams[K];
	/** Parcels per second. R-02: it may never reach into `release`. */
	emission: Envelope;
	/** Velocity scale on the primitive's kernel. */
	drive: Envelope;
	look: LookRole;
	/**
	 * The id of the `hold` track that captured this one, from a plan `Coupling`.
	 * The sim's only cross-track path, and it exists because the plan declared it.
	 */
	capturedBy?: string;
}

/** Any track a v1 score may hold. */
export type ScoreTrack =
	| Track<'burst'>
	| Track<'jet'>
	| Track<'fan'>
	| Track<'vortex'>
	| Track<'hold'>
	| Track<'intake'>
	| Track<'shimmer'>;

/**
 * R-12. The nesting hook: a score holds layers, and v1 always has exactly one.
 * The aperture sits here rather than on a track because R-12 makes an inner ring
 * a modifier of the outer's element _and aperture_, so the whole layer emits
 * through one valve.
 */
export interface ScoreLayer {
	/** Which ring authored it. Always `outer` in v1. */
	id: string;
	/** R-09. The spawn surface every track in the layer draws from. */
	aperture: Aperture;
	tracks: ScoreTrack[];
}

/** What the score had to say about the plan it compiled. Notes never change behavior. */
export type ScoreNote =
	/** The plan asked for a primitive with no kernel yet; the nearest built kind plays it. */
	| `routed-${PrimitiveKind}`
	/** R-11: the plan manifests nothing, so the score carries the designed default. */
	| 'manifests-nothing'
	/** R-08: dispersion ink, so its fan runs as a low, long leak. */
	| 'dispersion-leak'
	/** Open canon question 5: a hold captured other tracks, and only softly. */
	| 'coupling-soft'
	/** Open canon question 7: a hold holds without ever filling up. */
	| 'capacity-unmodeled';

export interface SpellScore {
	version: 1;
	/** Derived from `SpellIR.signature`, so the same spell always spawns the same cast. */
	seed: number;
	/** Sigil id, not element: crystal is not earth. */
	sigil: string | null;
	element: ElementId | null;
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	/** R-12. Always length 1 in v1. */
	layers: ScoreLayer[];
	notes: ScoreNote[];
	/** Identical signature means identical cast. */
	signature: string;
}
