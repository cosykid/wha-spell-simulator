/**
 * @file SpellScore — the Score layer's output: a cast as an authored timeline.
 * Specified in `docs/animation-redesign.md` section 3; the beats it is cut into
 * are R-01 and R-02 in `docs/animation-spec.md`.
 *
 * Time is the primary axis. Every track carries an emission envelope and a drive
 * envelope, and both are required fields, so **a track without timing does not
 * type-check**. That is how "timing must be authored" stops being a convention.
 */

import type { Vec3 } from './geometry.js';
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

/** The primitives phase 3 implements. Everything else in `PrimitiveKind` is phase 4. */
export type PlayedKind = 'burst' | 'jet' | 'fan';

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

/** R-07. Plane-hugging radial dispersion, and the swirl a routed vortex leaves in it. */
export interface FanParams {
	/** Seal units per second. Negative draws inward, which is how a routed intake reads. */
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
 * Params by kind. The four kinds phase 4 owns map to `never`, so a track of an
 * unbuilt kind cannot be constructed until its params type lands with it.
 */
export interface PrimitiveParams {
	burst: BurstParams;
	jet: JetParams;
	fan: FanParams;
	vortex: never;
	hold: never;
	intake: never;
	vessel: never;
	shimmer: never;
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
}

/** Any track a v1 score may hold. */
export type ScoreTrack = Track<'burst'> | Track<'jet'> | Track<'fan'>;

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
	/** The plan asked for a primitive phase 4 owns; the nearest built kind plays it. */
	| `routed-${PrimitiveKind}`
	/** R-11: the plan manifests nothing, so the score carries the designed default. */
	| 'manifests-nothing'
	/** R-08: dispersion ink, so its fan runs as a low, long leak. */
	| 'dispersion-leak';

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
