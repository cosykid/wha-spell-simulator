/**
 * @file The fan cell: R-07's plane-hugging dispersion, and R-13's routed vessel.
 *
 * | beat      | the cell                                                      |
 * | --------- | ------------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.      |
 * | strike    | the sheet snaps open and its lip rears into a bow wave.        |
 * | body      | it runs outward and thins, shedding marks off its own front.   |
 * | release   | it commits: the root lets go and the sheet becomes a band.     |
 * | afterglow | the band fades where it stands.                                |
 *
 * R-08 lives here as timing, not as shape. A dispersion sign contributes to
 * `(S, P, C, Gamma)` exactly as a column does, so the two cannot be told apart in
 * space; the score tells them apart by giving a fan the `leak` curve, and this
 * cell simply performs the envelope it is handed.
 *
 * R-13's vessel is param-driven rather than id-driven: a fan no sign asked for
 * carries no sites, so it opens the whole seal, and its `swirl` stirs what it
 * cannot spread.
 */

import { burnAt, punchAt, shapeAt, shapeOf, sootAt, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../hybrid/flow.js';
import { FLOW, MARK } from '../hybrid/tuning.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** A sheet spreads from the seal itself, whichever arc of it emits. */
const SEAL_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** How much of the sheet is in the air. */
const PRESENCE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.55 + 0.45 * t,
	body: () => 1,
	release: (t) => 1 - 0.5 * t,
	afterglow: (t) => 0.5 * (1 - t)
};

/** How high the lip rears. R-07 caps the climb; this only says when it peaks. */
const LIP: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.4 + 1.4 * Math.sin(Math.PI * t),
	body: (t) => 1 - 0.35 * t,
	release: (t) => 0.65 - 0.3 * t,
	afterglow: () => 0.3
};

/** Below this a facing is the reading's "not trusted" zero (R-06). */
const FACING_FLOOR = 1e-3;

/** Seal units the front may reach. Past two ring radii it has left the shot. */
const FAN_REACH = 2;

export function createFanCell(track: Track<'fan'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	let spreadUnits = 0;
	let swirlTurns = 0;
	const tip: Vec3 = { x: 0, y: 0, z: 0 };

	const shape = channel.shape;
	shape.spawn = SPAWN.sector;
	shape.axisX = 0;
	shape.axisY = 0;
	shape.axisZ = 1;
	shape.lobePhase = lobePhase;
	// A fan is all foot: its marks are born anywhere along it, unlike a column's,
	// which have nothing to tear off down at the plate.
	shape.markFloor = 0;
	shape.converge = -0.05;
	shape.wander = FLOW.boundaryWander * 0.8;
	shape.turbulence = FLOW.turbulence * channel.ink.turbulence * 0.72;
	shape.pool = Math.max(0.2, params.core);
	shape.veil = 0.72;
	shape.grain = 1.25;
	shape.ceiling = params.ceiling;
	shape.siteCount = Math.min(4, params.sites.length);
	for (let i = 0; i < shape.siteCount; i += 1) {
		const site = params.sites[i];
		// R-06: a facing the reading did not trust is a zero, and a site with no
		// facing points the only way it can, outward from where it stands.
		const trusted = Math.hypot(site.facing.x, site.facing.y) > FACING_FLOOR;
		shape.sites[i * 4] = site.at.x;
		shape.sites[i * 4 + 1] = site.at.y;
		shape.sites[i * 4 + 2] = trusted ? site.facing.x : 0;
		shape.sites[i * 4 + 3] = trusted ? site.facing.y : 0;
	}

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const seconds = frame.dtMs / 1000;
			const punch = punchAt(frame);
			const presence = shapeAt(PRESENCE, frame);
			spreadUnits += Math.abs(params.speed) * frame.drive * seconds;
			swirlTurns += (params.swirl * frame.drive * seconds) / (Math.PI * 2);

			// The sheet runs past the ring and then spends itself. Uncapped it walks
			// off the paper and stops being a spell on a seal.
			const outer = Math.min(FAN_REACH, params.core + 0.7 + spreadUnits);
			// R-07: the fan hugs the plane however far it runs, and only its lip
			// ever leaves the paper.
			const lift = Math.min(params.rise * shapeAt(LIP, frame), params.ceiling);
			shape.footprint = outer;
			shape.reach = Math.max(0.18, params.ceiling * 1.6 + lift);
			// The whole sheet is short and wide, so its boundary barely narrows.
			shape.narrow = 0.18;
			shape.speed = Math.abs(params.speed) * frame.drive * (1 + 0.8 * punch);
			shape.buoyancy = FLOW.buoyancy * 0.16 * (0.3 + lift);
			// A negative sink is the outward push: one signed term serves the fan
			// running out and the vessel stirring in place.
			shape.sink = -Math.abs(params.speed) * frame.drive * 0.45;
			shape.swirl = params.swirl;
			shape.punch = punch;
			shape.burn = burnAt(frame);
			shape.heat = 0.72;
			// It thins as it runs: the same mass over a widening ring.
			const thinning = 1 - 0.5 * clamp(spreadUnits / FAN_REACH);
			shape.emission = Math.min(
				0.55,
				(shapeOf(frame.emission, track.emission.gain) * presence + 0.4 * punch) * thinning
			);
			tip.x = outer;
			tip.z = lift;

			channel.arc.drive = frame.drive;
			channel.arc.punch = punch;
			channel.arc.soot = sootAt(frame);
			// A sheet pools rather than tearing: a crowd of tongues on a plane reads
			// as a starburst pointing away from the seal.
			channel.arc.tongueShare = 0.68;
			// A sheet running out across the paper has no edge facing the viewer to
			// outline, so it carries almost none of the row's ink.
			channel.arc.inkShare = channel.ink.inkShare * 0.2;
			channel.arc.rate = MARK.rate * 0.4 * shape.emission + MARK.punchRate * 0.3 * punch;
			channel.perform(frame.tMs, seconds);
		},
		report(): CellReport {
			return reportOf(
				channel,
				clamp(shape.emission),
				SEAL_ORIGIN,
				{ ...tip },
				{
					outer: shape.footprint,
					lift: tip.z,
					spread: spreadUnits,
					stir: swirlTurns
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
