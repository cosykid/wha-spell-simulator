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
 * It is **pigment, not light**. The medium is drawn as faint wisps and grain low
 * on the heat ramp, capped hard in every beat, because a world that reads as
 * brightly as the manifestation it surrounds has stopped being the background of
 * the shot.
 */

import { burnAt, shapeAt, shapeOf, sootAt, type BeatShape } from './arc.js';
import { reportOf } from './perform.js';
import { SPAWN } from '../hybrid/flow.js';
import { FLOW, MARK } from '../hybrid/tuning.js';
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
 * being the background of the shot. It is the product of how many parcels the
 * medium runs and how thinly each one is laid, which is why the population can
 * be dense while the veil stays faint.
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

	const shape = channel.shape;
	shape.spawn = SPAWN.medium;
	shape.axisX = 0;
	shape.axisY = 0;
	shape.axisZ = 1;
	shape.lobePhase = lobePhase;
	shape.markFloor = 0;
	shape.footprint = 1.35;
	shape.narrow = 0.15;
	shape.converge = -0.04;
	shape.pool = 0.95;
	shape.ceiling = params.ceiling;
	shape.reach = Math.max(0.3, params.ceiling * 2.2);
	shape.wander = FLOW.boundaryWander * 1.1;
	shape.turbulence = FLOW.turbulence * channel.ink.turbulence * 0.35;
	shape.drag = FLOW.drag * 0.6;
	// The medium hangs around, but not so long that it walks all the way to the
	// axis: a veil that piles up in the middle is a stain, not a room.
	shape.lifeS = 0.8;
	shape.lifeSpreadS = 1.3;
	// The world is a veil. Its parcels are broad and almost transparent and there
	// are a great many of them, which is the difference between grain in the paper
	// and a scatter of countable specks.
	shape.veil = 0.07;
	shape.grain = 2.2;

	return {
		update(frame) {
			const seconds = frame.dtMs / 1000;
			inhale = shapeAt(INHALE, frame);
			const presence = shapeAt(PRESENCE, frame);
			shape.sink = params.drift * inhale;
			shape.swirl = params.wander * 0.8;
			shape.speed = params.drift * (0.5 + 0.5 * inhale);
			shape.buoyancy = FLOW.buoyancy * 0.04;
			shape.punch = 0;
			shape.burn = burnAt(frame);
			// Low on the ramp and never off it: the medium is pigment, and a glowing
			// dot is the look this rework exists to be rid of.
			shape.heat = 0.26;
			shape.emission =
				0.24 * shapeOf(frame.emission, track.emission.gain) * presence * (0.5 + 0.5 * density);

			channel.arc.drive = frame.drive;
			channel.arc.punch = 0;
			channel.arc.soot = sootAt(frame) * 0.5;
			// The world carries no outline and leaves no smoke, and what it does lay
			// is a broad faint wash rather than a tongue.
			channel.arc.inkShare = 0;
			channel.arc.crownShare = 0;
			channel.arc.tongueShare = 0.6;
			channel.arc.alpha = channel.ink.markAlpha * 0.2;
			channel.arc.size = channel.ink.markSize * 1.15;
			channel.arc.life = 1.6;
			// Few, faint and long-lived. The veil is carried by the parcels; the
			// marks only give it a grain, and a crowd of big washes over the middle
			// of the seal is a stain rather than a room.
			channel.arc.rate = MARK.rate * 0.2 * shape.emission * (0.4 + 0.6 * density);
			channel.perform(frame.tMs, seconds);
			tip.z = params.ceiling;
		},
		report(): CellReport {
			// Loudness is what a channel paints, not how many parcels it runs: the
			// medium runs a great many at a thirteenth of the substrate's opacity.
			return reportOf(
				channel,
				shape.emission * shape.veil,
				SEAL_ORIGIN,
				{ ...tip },
				{
					inhale,
					presence: shape.emission,
					cap: CAP
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
