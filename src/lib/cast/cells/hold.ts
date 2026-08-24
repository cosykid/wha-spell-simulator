/**
 * @file The hold cell: R-13's spring, and the one place R-20 lives.
 *
 * | beat      | the cell                                                        |
 * | --------- | --------------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.        |
 * | strike    | the grip snaps shut and the first mass is thrown up into it.     |
 * | body      | the ball fills toward capacity, breathing, turning on its spin.  |
 * | release   | the grip does not let go: the ball rides and the feed thins.     |
 * | afterglow | it dims and coasts down where it stands.                         |
 *
 * Two rulings are visible in it. **R-16**: `spin` turns the ball whether or not
 * anything is gripped, so a levitation pinwheel is a rotor with no tension in
 * it. **R-20**: the held mass accumulates from the track's own emission against
 * `capacity`, approaching it asymptotically and never passing it, and that fill
 * is the whole of what the cell offers a coupling.
 *
 * R-20's other half is in the field itself: a parcel inside the shell stops
 * burning, because section 6 gives the grip no dissipation inside the blob.
 * Without that the ball never reaches capacity on a long cast.
 *
 * (R-17's inverted case never reaches here: the plan resolves no hold at all, so
 * the score builds no track and the stage builds no cell.)
 */

import { burnAt, punchAt, shapeAt, shapeOf, sootAt, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../hybrid/flow.js';
import { FLOW, MARK } from '../hybrid/tuning.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import type { Cell, CellConstraint, CellContext, CellReport } from './cell.js';
import type { Track, Vec3 } from '../../types.js';

/** How much of the ball is in the air. */
const PRESENCE: BeatShape = {
	charge: () => 0,
	strike: (t) => 0.45 + 0.55 * t,
	body: () => 1,
	release: (t) => 1 - 0.3 * t,
	afterglow: (t) => 0.7 * (1 - t)
};

/** How big the shell is at nothing held, and at brim full. */
const SHELL = { empty: 0.7, full: 1.55 } as const;

/**
 * Capacity at which the grip reads fully closed, from the score's own
 * `capacityPerGrip`. R-16's rotor arrives with a capacity of about 1e-15 rather
 * than a clean zero, because the plan's spin and grip are trigonometry, and half
 * a parcel of capacity is not a grip.
 */
const FULL_CAPACITY = 45;
const GRIP_FLOOR = 0.01;

/** What a shell with no grip in it keeps, so R-16's rotor still has a middle. */
const GRIPLESS = 0.16;

/** Past the drive envelope the rotor still turns, slower. */
const COAST = 0.3;

export function createHoldCell(track: Track<'hold'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	// Capacity is linear in the plan's grip, so it is the one honest read of how
	// hard this hold grips.
	const gripStrength = clamp(params.capacity / FULL_CAPACITY);
	const grips = gripStrength >= GRIP_FLOOR;
	const spinRate = params.spin / Math.max(params.radius, 1e-3);
	let heldMass = 0;
	let spinPhase = 0;
	let bobPhase = 0;
	let radius = params.radius * SHELL.empty;
	// Rewritten in place each step. The stage may read it; nothing may keep it.
	const ceiling: CellConstraint = {
		at: { x: params.at.x, y: params.at.y, z: params.at.z },
		radius: 0,
		closed: 0
	};
	const tip: Vec3 = { x: params.at.x, y: params.at.y, z: params.at.z };

	const shape = channel.shape;
	shape.spawn = SPAWN.hover;
	shape.originX = params.at.x;
	shape.originY = params.at.y;
	shape.originZ = params.at.z;
	shape.axisX = 0;
	shape.axisY = 0;
	shape.axisZ = 1;
	shape.lobePhase = lobePhase;
	// A ball, not a shaft: its marks belong all around the shell, below the locus
	// as much as above it.
	shape.markFloor = -0.85;
	shape.narrow = 0;
	shape.converge = 0.35;
	shape.wander = FLOW.boundaryWander * 0.55;
	shape.turbulence = FLOW.turbulence * channel.ink.turbulence * 0.26;
	// Held magic does not stream: the drag is what turns a feed into a ball.
	shape.drag = FLOW.drag * 1.7;
	shape.veil = 1;
	shape.grain = 1.25;

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const seconds = frame.dtMs / 1000;
			const punch = punchAt(frame);
			const presence = shapeAt(PRESENCE, frame);
			// R-20. The feed accumulates in the ball and the valve closes as it
			// fills, so the mass approaches capacity and never reaches it.
			if (grips) {
				heldMass += frame.emission * seconds * Math.max(0, 1 - heldMass / params.capacity);
			}
			const fill = grips ? clamp(heldMass / params.capacity) : 0;
			// R-16. The rotor turns on its own spin whether or not it grips, and
			// coasts rather than stopping dead when the drive envelope closes.
			spinPhase += spinRate * (COAST + (1 - COAST) * frame.drive) * seconds;
			bobPhase += params.bobRate * seconds;
			const breath = 1 + 0.07 * Math.sin(bobPhase);
			radius = params.radius * (SHELL.empty + (SHELL.full - SHELL.empty) * fill) * breath;

			tip.z = params.at.z + radius * 0.07 * Math.sin(bobPhase);
			shape.originZ = tip.z;
			// Hard enough to beat the turbulence that would otherwise carry the ball
			// away. A grip that loses to its own noise is a plume with a name.
			shape.gather = (params.gather + 2) * (1.6 + 3.4 * (grips ? gripStrength : GRIPLESS));
			shape.holdRadius = radius;
			shape.footprint = radius * 1.35;
			// Measured from the locus, not from the paper: what is held is held there.
			shape.reach = Math.max(0.18, radius * 2.4);
			shape.pool = Math.max(0.15, radius);
			shape.speed = params.lift * frame.drive * 0.55;
			shape.buoyancy = FLOW.buoyancy * 0.12;
			shape.swirl = spinRate * (COAST + (1 - COAST) * frame.drive);
			shape.punch = punch;
			shape.burn = burnAt(frame);
			shape.heat = 0.9;
			// R-20's fill transient and then a suspended ball: the feed closes as the
			// ball fills, and what is already held keeps the shell dense.
			shape.emission = Math.min(
				0.9,
				shapeOf(frame.emission, track.emission.gain) * presence * (0.4 + 0.6 * (1 - fill)) +
					0.75 * fill * presence +
					0.3 * presence
			);

			channel.arc.drive = frame.drive;
			channel.arc.punch = punch;
			channel.arc.soot = sootAt(frame);
			channel.arc.rate = MARK.rate * 0.7 * shape.emission + MARK.punchRate * 0.3 * punch;
			channel.perform(frame.tMs, seconds);

			ceiling.radius = radius;
			ceiling.closed = fill * gripStrength;
		},
		constraint(): CellConstraint | null {
			// R-16: a rotor holds nothing, so it constrains nothing.
			return grips ? ceiling : null;
		},
		report(): CellReport {
			// The locus never bobs: the ball moves inside a shell that stands still.
			return reportOf(
				channel,
				clamp(shape.emission),
				{ ...params.at },
				{ ...tip },
				{
					fill: grips ? clamp(heldMass / params.capacity) : 0,
					grip: gripStrength * (grips ? clamp(heldMass / params.capacity) : 0),
					closed: ceiling.closed,
					radius,
					spin: spinPhase,
					// Unsigned, because how far a rotor has turned is a claim about the
					// rotor and the sense of it is a claim about the ink (R-05).
					turned: Math.abs(spinPhase)
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
