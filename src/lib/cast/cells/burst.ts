/**
 * @file The burst cell: R-01's strike, made visible. A punch-class impulse
 * shell thrown off the aperture, and nothing else.
 *
 * | beat      | the cell                                                     |
 * | --------- | ------------------------------------------------------------ |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.     |
 * | strike    | the whole spend: a violent shell born across the whole seal.  |
 * | body      | what is left coasts out and burns; its splash dries in place. |
 * | release   | a thinning residue where the front passed.                    |
 * | afterglow | gone, with the front's own reach still recorded.              |
 *
 * It is brief on purpose. The score confines its emission to one hump inside the
 * strike (R-01 gives that beat "the impulse: burst ring"), so a burst that were
 * still arriving at the body would be a slug rather than a shock. Its matter is
 * the same medium as the spell's own, so where a column stands in it the two
 * merge into one body — that is the physics, not a bug. The front it reached
 * keeps growing after the last tracer dies, because that is the ring the mass
 * was thrown along.
 */

import { burnAt, punchAt, shapeAt, shapeOf, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../volume/flow.js';
import { BOUNDARY_WANDER } from '../volume/tuning.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** The strike is thrown off the aperture itself, so its form is rooted there. */
const SEAL_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** What is still in the air. The strike is everything and the rest is residue. */
const PRESENCE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.35)),
	body: (t) => 0.34 * (1 - t) ** 2,
	release: (t) => 0.09 * (1 - t) ** 1.5,
	// A residue where the front passed, thinning to nothing. The score confines
	// the burst's emission to the strike, so what shows here is the cell's own
	// decay rather than anything the envelope reaches into (R-02).
	afterglow: (t) => 0.03 * (1 - t)
};

/** How much of the drive a spent shock still carries. A wave does not stop dead. */
const COAST = 0.22;

/** The short fuse: the impulse burns out where it stands, whatever the element. */
const SHOCK_LIFE = 0.35;

export function createBurstCell(track: Track<'burst'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	let frontUnits = 0;
	const tip: Vec3 = { x: 0, y: 0, z: 0 };

	const flow = channel.flow;
	flow.spawn = SPAWN.splash;
	flow.lobePhase = lobePhase;
	// A shock has no waist: the pinch is off and the swirl is a stir, so the
	// splash cannot read as a column's foot.
	flow.pinchMul = 0;
	flow.swirl = 0.22;
	flow.turbMul = 1.2;
	flow.wander = BOUNDARY_WANDER * 1.35;
	flow.lifeMul = SHOCK_LIFE;

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const punch = punchAt(frame);
			const presence = shapeAt(PRESENCE, frame);
			// Weight is felt twice: it leans into the strike and then drags with
			// distance, so a heavy element's shock is slower and shorter.
			const material = ctx.look.material;
			const attack = frame.beat === 'strike' ? 1 - material.weight * 0.4 * (1 - frame.beatT) : 1;
			const drag = 1 / (1 + material.weight * 0.32 * frontUnits);
			const carry = Math.max(frame.drive, COAST * presence);
			frontUnits += params.speed * carry * attack * drag * (frame.dtMs / 1000);

			flow.footprint = 0.34 + frontUnits * 0.62;
			flow.reach = Math.max(0.28, params.reach * 0.5 + frontUnits * 0.22);
			flow.speed = params.speed * carry * (0.6 + 1.4 * punch);
			// The kind's outward push, on top of the launch itself.
			flow.sink = -params.speed * carry * 0.4;
			flow.punch = Math.max(punch, frame.beat === 'strike' ? 0.35 : 0);
			flow.burn = burnAt(frame) * 1.4;
			// An impulse leaves no standing puddle: what the splash lands, the
			// paper drinks through the body. Left to the element's own pool
			// clock, the scattered drops ride the pool spread to its edge and
			// stand the whole cast as a ring of countable beads.
			flow.drain =
				frame.beat === 'charge' || frame.beat === 'strike'
					? 0
					: frame.beat === 'body'
						? 0.3 + 0.7 * frame.beatT
						: 1;
			flow.emission = Math.min(
				0.94,
				shapeOf(frame.emission, track.emission.gain) * presence + 0.7 * punch
			);
			// The shell lifts a little as it spreads, so it is a wave and not a decal.
			tip.z = Math.min(params.rise * frontUnits * 0.06, 0.14);
			tip.x = frontUnits;
			channel.perform(frame.tMs);
		},
		report(): CellReport {
			return reportOf(
				channel,
				clamp(flow.emission),
				SEAL_ORIGIN,
				{ ...tip },
				{ front: frontUnits }
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
