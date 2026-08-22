/**
 * @file The cast simulation: a fixed-step, replayable advection of parcels
 * through their own track's kernel.
 *
 * Two rules make it a baseline rather than a coin flip. Time advances in **whole
 * steps counted as integers**, never a float accumulator, so `tMs` is a product
 * and not a running sum. And randomness comes only from `state.rng`, seeded from
 * the score. Together they give the contract the golden tier stands on:
 *
 * **Stepping fresh to `targetMs` is bit-identical to stepping there
 * incrementally.**
 *
 * @example
 * const late = simulateTo(score, 2600);
 */

import { scoreTracks } from '../score/compileScore.js';
import { evaluateEnvelope } from '../score/envelopes.js';
import { bindParcel, type Parcel } from './parcel.js';
import { constrainFor, kernelFor, spawnFor, throttleFor } from './primitives/registry.js';
import { mulberry32, type Rng } from './rng.js';
import { add3, scale3, subtract3 } from '../vec3.js';
import type { Aperture, ScoreTrack, SpellScore } from '../../types.js';

export const CAST = {
	/** The redesign's fixed sim step (section 4). 120Hz, independent of frame rate. */
	stepsPerSecond: 120,
	stepMs: 1000 / 120,
	/** Ceiling on live parcels, so a heavy seal costs frames rather than the tab. */
	maxParcels: 1400,
	/**
	 * How fast a parcel's velocity relaxes onto its kernel, per second. It is the
	 * only damping in the sim: when a drive envelope closes the kernel goes to
	 * zero, and the same term becomes the coast R-01 asks `release` for.
	 */
	steerPerSecond: 4.5,
	/** Past this seal-space radius or height a parcel has left the scene for good. */
	bounds: 3.2
} as const;

const STEP_SECONDS = CAST.stepMs / 1000;

export interface CastState {
	/** Always `steps * CAST.stepMs`: a product, never a running sum. */
	tMs: number;
	/** Whole simulation steps taken. */
	steps: number;
	parcels: Parcel[];
	rng: Rng;
	/** Fractional parcels each track is carrying, by track id. */
	pending: Record<string, number>;
}

/** Whole steps that reach `atMs`. Sampled timestamps must land on a step boundary. */
export function stepsFor(atMs: number): number {
	return Math.round(atMs / CAST.stepMs);
}

/** A cast at rest: nothing spawned, the clock at zero, the rng at the score's seed. */
export function newCast(score: SpellScore): CastState {
	return {
		tMs: 0,
		steps: 0,
		parcels: [],
		rng: mulberry32(score.seed),
		pending: {}
	};
}

/**
 * Emission for one step. The envelope is read in parcels per second and the
 * remainder carries over, so a rate below one parcel per step still emits at the
 * right average and always at the same moments.
 */
function emit(
	state: CastState,
	score: SpellScore,
	track: ScoreTrack,
	aperture: Aperture,
	tMs: number
): void {
	// R-20: the envelope says how hard the seal would feed; the throttle says how
	// much room is left to feed into. A full ball closes the valve without
	// touching the clock, so the beat structure is untouched by capacity.
	const rate =
		evaluateEnvelope(track.emission, score.beats, tMs) * throttleFor(track, state.parcels);
	const carried = (state.pending[track.id] ?? 0) + rate * STEP_SECONDS;
	const wanted = Math.floor(carried);
	state.pending[track.id] = carried - wanted;
	for (let i = 0; i < wanted && state.parcels.length < CAST.maxParcels; i += 1) {
		state.parcels.push(bindParcel(spawnFor(track, aperture, state.rng), track, state.steps));
	}
}

/**
 * One parcel, one step: steer onto the driven kernel, move, then constrain.
 *
 * `holder` is the sim's only cross-track path, and it exists because a plan
 * `Coupling` declared it: a captured parcel also meets its holder's constraint,
 * which is how a levitation ceiling catches what a column threw. It never sees
 * the holder's kernel, so a parcel still feels exactly one flow.
 */
function advect(
	parcel: Parcel,
	track: ScoreTrack,
	drive: number,
	steps: number,
	holder: ScoreTrack | undefined
): void {
	parcel.ageS = (steps - parcel.bornStep) * STEP_SECONDS;
	const target = scale3(kernelFor(track, parcel.at, parcel.ageS), drive);
	const steer = CAST.steerPerSecond * STEP_SECONDS;
	parcel.velocity = add3(parcel.velocity, scale3(subtract3(target, parcel.velocity), steer));
	parcel.at = add3(parcel.at, scale3(parcel.velocity, STEP_SECONDS));
	constrainFor(track, parcel, STEP_SECONDS);
	if (holder) {
		constrainFor(holder, parcel, STEP_SECONDS);
	}
}

function inScene(parcel: Parcel): boolean {
	return (
		parcel.ageS < parcel.lifetimeS &&
		Math.hypot(parcel.at.x, parcel.at.y) <= CAST.bounds &&
		Math.abs(parcel.at.z) <= CAST.bounds
	);
}

function step(score: SpellScore, state: CastState, byId: Map<string, ScoreTrack>): void {
	const tMs = state.tMs;
	for (const layer of score.layers) {
		for (const track of layer.tracks) {
			emit(state, score, track, layer.aperture, tMs);
		}
	}
	const drives = new Map(
		[...byId.values()].map((track) => [track.id, evaluateEnvelope(track.drive, score.beats, tMs)])
	);
	state.steps += 1;
	for (const parcel of state.parcels) {
		const track = byId.get(parcel.trackId);
		if (track) {
			const holder = track.capturedBy ? byId.get(track.capturedBy) : undefined;
			advect(parcel, track, drives.get(track.id) ?? 0, state.steps, holder);
		}
	}
	state.parcels = state.parcels.filter(inScene);
	state.tMs = state.steps * CAST.stepMs;
}

/**
 * Advance a cast to `targetMs`. Stepping there in one call or in several is the
 * same state, which is what makes a golden frame independent of the frames
 * sampled before it.
 */
export function stepTo(score: SpellScore, state: CastState, targetMs: number): CastState {
	const target = stepsFor(targetMs);
	const byId = new Map(scoreTracks(score).map((track) => [track.id, track]));
	while (state.steps < target) {
		step(score, state, byId);
	}
	return state;
}

/** A fresh cast advanced to `targetMs`, for callers that want one snapshot. */
export function simulateTo(score: SpellScore, targetMs: number): CastState {
	return stepTo(score, newCast(score), targetMs);
}
