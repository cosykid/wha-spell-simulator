/**
 * @file The jet cell: R-05's aimed column, and the two other beams a plan can
 * ask for. The prototype's approved column, performed on the shared substrate.
 *
 * | beat      | the cell                                                        |
 * | --------- | --------------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.        |
 * | strike    | the punch class fires: a wide, violent, short-lived front.        |
 * | body      | the column stands on its own length and roars, licks tearing off. |
 * | release   | it commits: drive eases, the mass coasts and stretches taller.    |
 * | afterglow | it burns out from the foot up and the smoke crowns.               |
 *
 * `axis` is the plan's aim vector, which points where the long sign points and
 * never toward where it sits (R-05), so there is no lean term left to invert.
 */

import { burnAt, punchAt, shapeAt, shapeOf, sootAt, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../hybrid/flow.js';
import { FLOW, MARK } from '../hybrid/tuning.js';
import { mulberry32 } from '../rng.js';
import { normalize3 } from '../vec3.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellConstraint, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** How far the column stands, as a multiple of its own reach. */
const EXTENT: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.35 + 0.95 * t,
	body: (t) => 1.3 - 0.1 * t,
	release: (t) => 1.2 + 0.25 * t,
	afterglow: (t) => 1.45 * (1 - 0.55 * t)
};

/** How wide its mouth is. The hump in the strike is the punch flaring it open. */
const GIRTH: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.45 + 0.55 * t + 0.55 * Math.sin(Math.PI * t),
	body: () => 1,
	release: (t) => 1 + 0.35 * t,
	afterglow: (t) => 1.35 + 0.5 * t
};

/** How much of its population is in the air. */
const PRESENCE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.5 + 0.5 * t,
	body: () => 1,
	release: (t) => 1 - 0.55 * t,
	afterglow: (t) => 0.45 * (1 - t)
};

/** The three beams a plan can raise, and how each one differs from the column. */
type JetVariant = 'column' | 'valve' | 'plume';

interface JetForm {
	length: number;
	girth: number;
	alpha: number;
	/** Seal units the root is thrown clear of the centre, along the aim's heading. */
	offset: number;
	/** Seal units the root is lifted off the paper. */
	lift: number;
}

const FORM: Record<JetVariant, JetForm> = {
	// R-05: the drawn columns' own beam, rooted in the seal.
	column: { length: 1, girth: 1, alpha: 1, offset: 0, lift: 0 },
	// R-09: a valve exhausts through its aperture, so its root stands off-centre
	// and off the paper.
	valve: { length: 0.72, girth: 1.25, alpha: 1, offset: 0.55, lift: 0.14 },
	// R-11: "manifests nothing" is a look. A quiet plume, and never absent.
	plume: { length: 0.55, girth: 0.72, alpha: 0.5, offset: 0, lift: 0 }
};

function variantOf(track: Track<'jet'>): JetVariant {
	if (track.id === 'jet-exhaust') {
		return 'valve';
	}
	return track.id === 'jet-default' ? 'plume' : 'column';
}

/**
 * The length a holder's shell allows. R-18's ceiling caps how far the column may
 * stand and nothing else about it, and a grip that is only part closed only
 * partly caps it, so capture reads as the beam being reeled in rather than
 * switched off.
 *
 * The chord is what the axis actually cuts through the shell: where the axis
 * misses the shell entirely the beam still stops at the grip's own height rather
 * than at nothing.
 */
function heldWithin(length: number, held: CellConstraint | null, root: Vec3, axis: Vec3): number {
	if (!held || held.closed <= 0) {
		return length;
	}
	const toX = held.at.x - root.x;
	const toY = held.at.y - root.y;
	const toZ = held.at.z - root.z;
	const along = toX * axis.x + toY * axis.y + toZ * axis.z;
	const offAxisSq = Math.max(0, toX * toX + toY * toY + toZ * toZ - along * along);
	const chord = Math.sqrt(Math.max(0, held.radius * held.radius - offAxisSq));
	const ceiling = Math.max(0, along + chord);
	// The four-sign levitation ring the coupling exists for settles at about a
	// third closed, so that is where the cap is already complete.
	const bite = clamp(held.closed / 0.3);
	return length + (Math.min(length, ceiling) - length) * bite;
}

export function createJetCell(track: Track<'jet'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const form = FORM[variantOf(track)];
	const axis = normalize3(params.axis);
	const rng = mulberry32(ctx.seed);
	// A seeded phase for the standing lobes, so two casts never wear the same
	// silhouette even when the plan is identical.
	const lobePhase = rng() * Math.PI * 2;
	const heading = Math.hypot(axis.x, axis.y);
	const root: Vec3 = {
		x: heading > 1e-6 ? (axis.x / heading) * form.offset : 0,
		y: heading > 1e-6 ? (axis.y / heading) * form.offset : 0,
		z: form.lift
	};
	const reach = params.reach * 1.15 * form.length;
	let held: CellConstraint | null = null;
	let standing = 0;
	const tip: Vec3 = { x: root.x, y: root.y, z: root.z };

	const shape = channel.shape;
	shape.spawn = SPAWN.column;
	shape.originX = root.x;
	shape.originY = root.y;
	shape.originZ = root.z;
	shape.axisX = axis.x;
	shape.axisY = axis.y;
	shape.axisZ = axis.z;
	shape.converge = params.converge;
	shape.swirl = 0.5;
	shape.lobePhase = lobePhase;
	shape.markFloor = 0.34;
	shape.siteCount = Math.min(4, params.sites.length);
	for (let i = 0; i < shape.siteCount; i += 1) {
		const site = params.sites[i];
		shape.sites[i * 4] = site.at.x;
		shape.sites[i * 4 + 1] = site.at.y;
		shape.sites[i * 4 + 2] = site.facing.x;
		shape.sites[i * 4 + 3] = site.facing.y;
	}
	// Quality is form roughness and never magnitude: a sloppier seal wanders its
	// own boundary further rather than burning less brightly.
	shape.wander = FLOW.boundaryWander * (0.7 + 0.6 * (1 - clamp(ctx.quality)));
	shape.turbulence = FLOW.turbulence * channel.ink.turbulence;

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const punch = punchAt(frame);
			const soot = sootAt(frame);
			standing = heldWithin(reach * shapeAt(EXTENT, frame), held, root, axis);
			tip.x = root.x + axis.x * standing;
			tip.y = root.y + axis.y * standing;
			tip.z = root.z + axis.z * standing;

			shape.reach = Math.max(0.05, standing);
			shape.footprint = params.footprint * shapeAt(GIRTH, frame);
			shape.speed = params.speed * frame.drive * (1 + 1.2 * punch);
			shape.buoyancy = FLOW.buoyancy * (0.6 + 0.5 * form.length) * frame.drive;
			shape.punch = punch;
			shape.burn = burnAt(frame);
			shape.heat = 1;
			shape.emission = Math.min(
				0.94,
				shapeOf(frame.emission, track.emission.gain) * shapeAt(PRESENCE, frame) * form.alpha +
					0.55 * punch
			);

			channel.arc.drive = frame.drive;
			channel.arc.punch = punch;
			channel.arc.soot = soot;
			channel.arc.rate = (MARK.rate * shape.emission + MARK.punchRate * punch) * form.alpha;
			channel.perform(frame.tMs, frame.dtMs / 1000);
		},
		bind(constraint) {
			held = constraint;
		},
		report(): CellReport {
			return reportOf(
				channel,
				shape.emission,
				{ ...root },
				{ ...tip },
				{
					standing,
					girth: shape.footprint
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
