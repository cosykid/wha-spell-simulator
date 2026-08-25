/**
 * @file The shimmer cell: R-10's thin ambient medium, and the only cell R-01
 * gives the charge beat to.
 *
 * | beat      | the medium                                                    |
 * | --------- | ------------------------------------------------------------- |
 * | charge    | draws inward onto the ring, gathering. Its own beat.           |
 * | strike    | blown back off the ring and dimmed as the spell takes over.    |
 * | body      | pooled and breathing, well under everything the seal manifests.|
 * | release   | drifting back out and thinning.                                |
 * | afterglow | returning to where it was before the cast, then gone.          |
 *
 * There is no charge gate here and there must not be: the charge is this cell's
 * beat, and R-01 makes it content rather than dead time.
 *
 * In the volume vocabulary the medium is **washes, never body**: its deposit
 * weight is zero, so it can never merge into the manifestation it surrounds,
 * and the stage draws its tracers as a few large, faint granulated washes
 * (`volume/ambient.ts`). Pigment, not light, and it may never dominate a frame.
 */

import { burnAt, shapeAt, shapeOf, type BeatShape } from './arc.js';
import { reportOf } from './perform.js';
import { SPAWN } from '../volume/flow.js';
import { BOUNDARY_WANDER } from '../volume/tuning.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** The world has no root of its own; it is measured against the seal. */
const SEAL_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** How hard the medium is drawing inward. The charge is where it gathers. */
const INHALE: BeatShape = {
	charge: (t) => t * t,
	strike: (t) => 1 - 0.45 * t,
	body: () => 0.55,
	release: (t) => 0.55 - 0.3 * t,
	afterglow: (t) => 0.25 * (1 - t)
};

/** How much of the medium is in the air. */
const PRESENCE: BeatShape = {
	charge: (t) => 0.35 + 0.65 * t,
	strike: (t) => 1 - 0.66 * t,
	body: () => 0.34,
	release: (t) => 0.34 - 0.14 * t,
	afterglow: (t) => 0.2 * (1 - t)
};

/**
 * The loudest the medium may ever paint, and a law rather than an intention: a
 * world that reads as brightly as the manifestation it surrounds has stopped
 * being the background of the shot. The wash alpha in `volume/tuning.ts` is
 * sized against it.
 */
const CAP = 0.1;

export function createShimmerCell(track: Track<'shimmer'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	// A sloppier seal stirs a slacker medium. Form roughness, never strength.
	const density = clamp(ctx.look.material.garnishDensity) * clamp(ctx.quality);
	let inhale = 0;
	const tip: Vec3 = { x: 0, y: 0, z: 0 };

	const flow = channel.flow;
	flow.spawn = SPAWN.medium;
	flow.lobePhase = lobePhase;
	flow.pinchMul = 0;
	flow.turbMul = 0.35;
	// The medium is thin whatever its element weighs: water's world drifts, it
	// does not rain.
	flow.weightMul = 0.12;
	flow.wander = BOUNDARY_WANDER * 1.1;
	flow.footprint = 1.35;
	// The ring the medium gathers onto. An attractor at a radius, never a sink
	// at a point: a medium that piles into the middle is a stain over the seal.
	flow.pool = 0.95;
	flow.ceiling = params.ceiling;
	flow.reach = Math.max(0.3, params.ceiling * 2.2);
	// Washes only: the medium never deposits into the body it surrounds.
	flow.deposit = 0;

	return {
		update(frame) {
			inhale = shapeAt(INHALE, frame);
			const presence = shapeAt(PRESENCE, frame);
			flow.sink = params.drift * inhale;
			flow.swirl = params.wander * 0.8;
			flow.speed = params.drift * (0.5 + 0.5 * inhale);
			flow.punch = 0;
			flow.burn = burnAt(frame);
			flow.drain = frame.beat === 'afterglow' ? frame.beatT : 0;
			flow.emission =
				0.4 * shapeOf(frame.emission, track.emission.gain) * presence * (0.5 + 0.5 * density);
			channel.perform(frame.tMs);
			tip.z = params.ceiling;
		},
		report(): CellReport {
			// Loudness is what the medium paints, not how many motes it runs: the
			// washes are laid at a fraction of the substrate's own opacity.
			return reportOf(
				channel,
				flow.emission * 0.25,
				SEAL_ORIGIN,
				{ ...tip },
				{
					inhale,
					presence: flow.emission,
					cap: CAP
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
