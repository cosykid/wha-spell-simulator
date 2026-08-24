/**
 * @file The burst cell: R-01's strike, made visible. A punch-class radial splash
 * thrown off the aperture, and nothing else.
 *
 * | beat      | the cell                                                     |
 * | --------- | ------------------------------------------------------------ |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.     |
 * | strike    | the whole spend: a violent front born across the whole seal.  |
 * | body      | what is left of it coasts outward and burns out.              |
 * | release   | a thinning scorch where the front passed.                     |
 * | afterglow | gone, with the front's own reach still recorded.              |
 *
 * It is brief on purpose. The score confines its emission to one hump inside the
 * strike (R-01 gives that beat "the impulse: burst ring"), so a burst that were
 * still arriving at the body would be a slug rather than a shock. The front it
 * reached keeps growing after the last parcel dies, because that is the ring the
 * mass was thrown along.
 */

import { burnAt, punchAt, shapeAt, shapeOf, sootAt, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../hybrid/flow.js';
import { FLOW, MARK } from '../hybrid/tuning.js';
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
	// A scorch where the front passed, thinning to nothing. The score confines
	// the burst's emission to the strike, so what shows here is the cell's own
	// decay rather than anything the envelope reaches into (R-02).
	afterglow: (t) => 0.03 * (1 - t)
};

/** How much of the drive a spent shock still carries. A wave does not stop dead. */
const COAST = 0.22;

export function createBurstCell(track: Track<'burst'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	let frontUnits = 0;
	const tip: Vec3 = { x: 0, y: 0, z: 0 };

	const shape = channel.shape;
	shape.spawn = SPAWN.splash;
	shape.axisX = 0;
	shape.axisY = 0;
	shape.axisZ = 1;
	shape.lobePhase = lobePhase;
	shape.markFloor = 0;
	// A shock has no waist: it spreads. The negative pinch is what stops the
	// splash reading as a column's foot.
	shape.converge = -0.12;
	shape.swirl = 0.22;
	shape.wander = FLOW.boundaryWander * 1.35;
	shape.turbulence = FLOW.turbulence * channel.ink.turbulence * 1.2;
	// The impulse burns out where it stands rather than being carried anywhere.
	shape.lifeS = 0.2;
	shape.lifeSpreadS = 0.34;
	// A blast is soft and wide: bigger, thinner parcels than the column's.
	shape.veil = 0.85;
	shape.grain = 1.3;

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

			shape.footprint = 0.34 + frontUnits * 0.62;
			shape.reach = Math.max(0.28, params.reach * 0.5 + frontUnits * 0.22);
			shape.speed = params.speed * carry * (0.6 + 1.4 * punch);
			shape.buoyancy = FLOW.buoyancy * 0.45 * params.rise * (0.4 + punch);
			shape.punch = Math.max(punch, frame.beat === 'strike' ? 0.35 : 0);
			shape.burn = burnAt(frame) * 1.4;
			shape.heat = 1;
			shape.emission = Math.min(
				0.94,
				shapeOf(frame.emission, track.emission.gain) * presence + 0.7 * punch
			);
			// The ring lifts a little as it spreads, so it is a wave and not a decal.
			tip.z = Math.min(params.rise * frontUnits * 0.06, 0.14);
			tip.x = frontUnits;

			channel.arc.drive = frame.drive;
			channel.arc.punch = Math.max(punch, 0.12);
			channel.arc.soot = sootAt(frame);
			// A shock has no silhouette to outline and leaves no smoke: it is over,
			// and marks that outlive it lie on the paper as dust.
			channel.arc.inkShare = 0;
			channel.arc.crownShare = 0;
			channel.arc.life = 0.4;
			channel.arc.rate = MARK.rate * 0.5 * shape.emission + MARK.punchRate * punch;
			channel.perform(frame.tMs, frame.dtMs / 1000);
		},
		report(): CellReport {
			return reportOf(
				channel,
				clamp(shape.emission),
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
