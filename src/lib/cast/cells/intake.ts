/**
 * @file The intake cell: R-13's ambient coupling, the pull family.
 *
 * | beat      | the cell                                                          |
 * | --------- | ----------------------------------------------------------------- |
 * | charge    | nothing. The medium's own cell has that beat.                      |
 * | strike    | the world leans in and the mouth flares as the first mass arrives. |
 * | body      | steady streaming, swallowed at the pool one wave after another.    |
 * | release   | the mouth closes; what is in flight coasts on the speed it had.    |
 * | afterglow | it drifts to a stop and fades where it stands.                     |
 *
 * **The charge beat is silent.** R-01 gives the charge "ambient medium draws
 * inward", and intake is ambient by law, so the question is real — but the score
 * settles it: this track's emission and drive both open at the strike, and
 * `shimmer` is the one track whose emission opens in the charge. Drawing here
 * would be timing no envelope authored, so R-10's medium performs that line and
 * this cell waits for the strike.
 *
 * Ground truth section 7's three channels are one signed sink, a lateral drag
 * along the arrows, and a twist whose sense follows their turn. Only the twist
 * lifts: a straight pull is a flat inflow and a slanted one is canon's helical,
 * apple-plucking vortex. The population is exempt from itself by the same
 * section, which is why an intake never swallows its own burst.
 */

import { burnAt, punchAt, shapeAt, shapeOf, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../volume/flow.js';
import { BOUNDARY_WANDER } from '../volume/tuning.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** The mouth is the seal: everything the pull gathers ends up there. */
const SEAL_ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** How much of the stream is in the air. Heavy matter takes its time leaning in. */
const PRESENCE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.4 + 0.6 * t,
	body: () => 1,
	release: (t) => 1 - 0.55 * t,
	afterglow: (t) => 0.45 * (1 - t)
};

/** The mouth's flare. It blooms as the first mass lands and closes on release. */
const BLOOM: BeatShape = {
	charge: () => 0,
	strike: (t) => Math.sin(Math.PI * t * 0.85),
	body: (t) => 0.45 * (1 - t),
	release: () => 0,
	afterglow: () => 0
};

/** Where the medium is born, in seal radii. Well outside the ring. */
const BORN_RADIUS = 2;

/** Below this a draw is rounding dust rather than a direction. */
const DEAD_DRAW = 1e-6;

/** Past the drive envelope the stream still carries. */
const COAST = 0.35;

/**
 * The medium is moved matter, never the spell's own body: its deposits are
 * lighter, so the drawn-in stream reads as a thin wash merging at the mouth
 * rather than as a second manifestation.
 */
const MEDIUM_DEPOSIT = 0.85;

export function createIntakeCell(track: Track<'intake'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	const outward = params.draw < -DEAD_DRAW;
	const mouth = clamp(Math.max(params.eye, params.pool), 0.3, 0.9);
	// One signed kernel, not two forms: reversing the draw swaps the ends of the
	// same run.
	const from = outward ? mouth : BORN_RADIUS;
	const to = outward ? BORN_RADIUS : mouth;
	// The wiki's flux law in the plan's own two components: pull weakens as the
	// cosine of the slant and twist grows as its sine.
	const speed = Math.hypot(params.draw, params.swirl);
	const slant = speed > 0 ? params.swirl / speed : 0;
	const turn = 1.2 * Math.PI * slant;
	const runsPerSecond = speed / Math.max(0.05, Math.abs(BORN_RADIUS - mouth));
	let flowPhase = 0;
	let flash = 0;
	const tip: Vec3 = { x: 0, y: 0, z: 0 };

	const flow = channel.flow;
	flow.spawn = SPAWN.sink;
	flow.lobePhase = lobePhase;
	flow.pinchMul = 0;
	// A drawn-in medium is dominated by the pull: its element's own churn and
	// gusting are damped hard, or the arrivals dwelling at the mouth get herded
	// into curl pockets and the one tide breaks into countable balls.
	flow.turbMul = 0.3;
	flow.gustMul = 0.35;
	flow.wander = BOUNDARY_WANDER * 0.9;
	flow.pool = mouth;
	flow.ceiling = params.ceiling;
	flow.driftX = params.lateral.x * params.drift;
	flow.driftY = params.lateral.y * params.drift;
	flow.footprint = BORN_RADIUS * 0.58;
	flow.deposit = MEDIUM_DEPOSIT;

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const seconds = frame.dtMs / 1000;
			const punch = punchAt(frame);
			const presence = shapeAt(PRESENCE, frame);
			const carry = Math.max(frame.drive, COAST * presence);
			flowPhase = (flowPhase + runsPerSecond * carry * seconds) % 1;
			// Flicker strobes the mouth rather than the stream: fire's intake
			// gutters where water's swallows evenly.
			const gutter =
				1 - clamp(ctx.look.material.flicker) * 0.45 * (0.5 + 0.5 * Math.sin(flowPhase * 44));
			const lift = Math.min(params.ceiling, params.rise);
			flash = shapeAt(BLOOM, frame) * (0.35 + 0.65 * clamp(ctx.look.material.emissive));

			flow.reach = Math.max(0.25, params.ceiling * 1.4 + lift);
			flow.sink = params.draw * carry;
			flow.swirl = params.swirl * carry;
			flow.speed = Math.max(0.15, speed) * carry;
			flow.punch = punch;
			flow.burn = burnAt(frame);
			flow.drain = frame.beat === 'afterglow' ? frame.beatT : 0;
			flow.emission = Math.min(
				0.45,
				shapeOf(frame.emission, track.emission.gain) * presence * gutter
			);
			tip.x = to;
			tip.z = lift;
			channel.perform(frame.tMs);
		},
		report(): CellReport {
			return reportOf(
				channel,
				clamp(flow.emission),
				SEAL_ORIGIN,
				{ ...tip },
				{
					outward: outward ? 1 : 0,
					from,
					to,
					turn,
					lift: tip.z,
					flash,
					phase: flowPhase
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
