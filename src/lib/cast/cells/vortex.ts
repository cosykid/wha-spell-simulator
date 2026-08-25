/**
 * @file The vortex cell: R-05's circulation, performed as a swirl-dominant flow
 * with a hollow eye.
 *
 * | beat      | the cell                                                        |
 * | --------- | --------------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.        |
 * | strike    | the funnel is thrown up past where it settles, and spins up.     |
 * | body      | it stands and turns, dense on the wall and fed from the floor.   |
 * | release   | it commits: lets go of the floor, stretches taller and thinner.   |
 * | afterglow | it unwinds, widening and losing its wall as it goes.             |
 *
 * Strength arrives as one number — the height the score asked for — and it buys
 * stature, tightness of foot and winding together, so a weak swirl is a flat
 * wide whirl and a strong one a tall tight column.
 *
 * The flare is the pinch run backwards. A column's boundary narrows with height;
 * a funnel's widens, which is the same `narrow` term negative. The eye stays
 * open because birth is on the wall and the ring attractor pushes matter back
 * out of the exact center (R-16's hollow, the substrate's own law).
 */

import { burnAt, punchAt, shapeAt, shapeOf, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../volume/flow.js';
import { BOUNDARY_WANDER } from '../volume/tuning.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellConstraint, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** The funnel stands on the seal, however far its crown flares. */
const SEAL_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * How tall the funnel stands, as a multiple of the height the score asked for.
 * The strike throws it up past where it settles, the body holds it, and the
 * release lets it stretch as it lets go of the floor.
 */
const STATURE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.45 + 1.5 * Math.sin(Math.PI * t) + 0.65 * t,
	body: (t) => 1.1 + 0.2 * t,
	release: (t) => 1.3 + 0.35 * t,
	afterglow: (t) => 1.65 * (1 - 0.5 * t)
};

/** How far the crown flares. A spun body widens as it unwinds. */
const FLARE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.7 + 0.3 * t,
	body: () => 1,
	release: (t) => 1 + 0.25 * t,
	afterglow: (t) => 1.25 + 0.5 * t
};

/** How much of the wall is in the air. */
const PRESENCE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.5 + 0.5 * t,
	body: () => 1,
	release: (t) => 1 - 0.45 * t,
	afterglow: (t) => 0.55 * (1 - t)
};

/** Past the drive envelope a spun body still turns, slower. */
const COAST = 0.4;

/** A whirl's matter lives longer than its element's default, so it completes arcs. */
const WHIRL_LIFE = 1.5;

/**
 * A reach the holder's shell allows. R-18's ceiling caps how far the form may
 * spread, never how fast it turns, and a grip that is only half closed only half
 * caps it, so capture reads as a squeeze rather than as a snap.
 */
function heldWithin(reach: number, held: CellConstraint | null): number {
	if (!held || held.closed <= 0) {
		return reach;
	}
	return reach + (Math.min(reach, held.radius) - reach) * clamp(held.closed);
}

export function createVortexCell(track: Track<'vortex'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	const swaySeed = rng() * Math.PI * 2;
	const sense = Math.sign(params.spin) || 1;
	const stature = clamp(params.height / 1.5);
	const foot = params.footRadius * (1 + 0.34 * (1 - stature));
	const crown = params.crownRadius * (1 + 0.55 * (1 - stature));
	// Radians per second on the wall. One phase, and everything reads it.
	const omega = params.spin / Math.max(0.12, (foot + crown) / 2);
	const arms = Math.round(clamp(params.symmetry ?? ctx.look.material.bands, 3, 6));
	let spinPhase = 0;
	let swayPhase = swaySeed;
	let held: CellConstraint | null = null;
	const tip: Vec3 = { x: 0, y: 0, z: 0 };

	const flow = channel.flow;
	flow.spawn = SPAWN.swirl;
	flow.lobePhase = lobePhase;
	flow.footprint = foot;
	// The flare: a negative narrow widens the boundary with height where a
	// column's narrows it.
	flow.narrow = -Math.max(0, crown / Math.max(foot, 1e-3) - 1);
	// Light. A hard pinch fights the foot's own ring attractor and fills the eye
	// back in, and a funnel with a solid middle reads as a plume that happens to
	// be spinning.
	flow.pinchMul = 0.15;
	flow.wander = BOUNDARY_WANDER * (0.6 + 0.5 * (1 - clamp(ctx.quality)));
	flow.turbMul = 0.9;
	// A whirl is read from how far a parcel travels around it, so its matter has
	// to live long enough to go round: short lives make a fountain of any field.
	flow.lifeMul = WHIRL_LIFE;
	// The wall the mass rides, between the foot and the crown.
	flow.pool = (foot + crown) / 2;

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const seconds = frame.dtMs / 1000;
			const punch = punchAt(frame);
			const presence = shapeAt(PRESENCE, frame);
			const turn = Math.max(frame.drive, COAST * presence);
			spinPhase += omega * turn * seconds;
			swayPhase += 1.1 * turn * seconds;

			const height = heldWithin(params.height * shapeAt(STATURE, frame), held);
			const spread = heldWithin(crown * shapeAt(FLARE, frame), held);
			flow.reach = Math.max(0.12, height);
			flow.footprint = foot * (1 + 0.12 * Math.sin(swayPhase) * ctx.look.material.undulation);
			flow.narrow = -Math.max(0, spread / Math.max(flow.footprint, 1e-3) - 1);
			// The updraft carries matter up the wall; the swirl mouth reads it.
			flow.speed = params.updraft * frame.drive;
			flow.swirl = omega * turn * 1.9;
			// The floor boundary layer, as the signed ring attractor: matter is
			// drawn onto the wall at the foot and pushed back out of the eye.
			flow.sink = params.feed * 1.1 * frame.drive;
			flow.punch = punch;
			flow.burn = burnAt(frame);
			flow.drain = frame.beat === 'afterglow' ? frame.beatT : 0;
			flow.emission = Math.min(
				0.92,
				shapeOf(frame.emission, track.emission.gain) * presence + 0.45 * punch
			);
			tip.z = height;
			channel.perform(frame.tMs);
		},
		bind(constraint) {
			held = constraint;
		},
		report(): CellReport {
			return reportOf(
				channel,
				clamp(flow.emission),
				SEAL_ORIGIN,
				{ ...tip },
				{
					foot: flow.footprint,
					crown: flow.footprint * (1 - flow.narrow),
					height: tip.z,
					spin: spinPhase,
					pitch: sense * (1 + 0.7 * (1 - stature)),
					arms
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
