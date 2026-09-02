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
 * R-20's other half is the gather itself: matter inside the shell is contained,
 * not dissipated, so the blob a long cast gathers actually stands (section 6
 * gives the grip no dissipation inside the blob).
 *
 * Section 6's per-element grip shows here too, without the cell naming an
 * element: the channel says what purchase the pair gets on what it emits, and
 * the fill grows by that share. A wind hold is a fan, and a fan never fills.
 *
 * (R-17's inverted case never reaches here: the plan resolves no hold at all, so
 * the score builds no track and the stage builds no cell.)
 */

import { burnAt, punchAt, shapeAt, shapeOf, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { SPAWN } from '../volume/flow.js';
import { BOUNDARY_WANDER } from '../volume/tuning.js';
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

/**
 * What a shell with no grip in it keeps, so R-16's rotor still has a middle.
 * Firm enough that the crowd's own push (the disc is dense) does not spread
 * the turn out to the ring and break it into countable blobs.
 */
const GRIPLESS = 0.3;

/**
 * R-16's rotor stance. A gripless hold is a flat swirl at the hover height, not
 * a held pea: it stands wider than the ball the same ink would grip, and its
 * shell is squashed toward the equator so it reads as a turning disc.
 */
const ROTOR = { stance: 1.9, squash: 0.75 } as const;

/** Past the drive envelope the rotor still turns, slower. */
const COAST = 0.3;

/** Held magic keeps: its matter lives long, so the ball is a mass, not a stream. */
const HELD_LIFE = 1.7;

/** How much finer than its row's scale a held ball's turbulence runs. */
const CHURN_SCALE = 2.5;

export function createHoldCell(track: Track<'hold'>, ctx: CellContext): Cell {
	const params = track.params;
	const { channel } = ctx;
	const rng = mulberry32(ctx.seed);
	const lobePhase = rng() * Math.PI * 2;
	// Capacity is linear in the plan's grip, so it is the one honest read of how
	// hard this hold grips.
	const gripStrength = clamp(params.capacity / FULL_CAPACITY);
	const grips = gripStrength >= GRIP_FLOOR;
	const stance = grips ? 1 : ROTOR.stance;
	const spinRate = params.spin / Math.max(params.radius, 1e-3);
	// The turn has to be seen going round: the mass is born into arms and herded
	// onto them, and the pattern advances on the ball's own spin phase. With no
	// drawn fold to honour, the row's own banding decides the count — and a hold
	// that barely turns keeps the round unpatterned shell, or a still water orb
	// would stand lobed for no reason ink gave it.
	const turning = Math.abs(spinRate) > 0.3;
	const arms = turning ? Math.round(clamp(ctx.look.material.bands, 3, 6)) : 0;
	// What purchase the pair gets on this element (ground truth section 6): a
	// held one fills the grip, a streaming one washes through it and fills
	// nothing, so the seal pumps on. The substrate reads the row; the cell
	// only reads the substrate.
	const purchase = channel.grip;
	let heldMass = 0;
	let spinPhase = 0;
	let bobPhase = 0;
	let radius = params.radius * SHELL.empty * stance;
	// Rewritten in place each step. The stage may read it; nothing may keep it.
	const ceiling: CellConstraint = {
		at: { x: params.at.x, y: params.at.y, z: params.at.z },
		radius: 0,
		closed: 0
	};
	const tip: Vec3 = { x: params.at.x, y: params.at.y, z: params.at.z };

	const flow = channel.flow;
	flow.spawn = SPAWN.hover;
	flow.originX = params.at.x;
	flow.originY = params.at.y;
	flow.originZ = params.at.z;
	flow.lobePhase = lobePhase;
	// A ball, not a shaft: no column boundary to pinch toward, and the whole
	// of the element's own turbulence churning inside the grip at a scale
	// finer than the ball, because a held fire is still a fire (canon's
	// pyreball boils in the hand; the grip contains it, it does not calm it).
	// The rotor runs stiller, so its arms stay legible.
	flow.pinchMul = 0;
	flow.turbMul = grips ? 1 : 0.28;
	flow.turbScaleMul = grips ? CHURN_SCALE : 1;
	// The grip quiets the element's own sway the way it suspends its weight, or
	// a wind hold shivers apart and its turn never reads.
	flow.gustMul = 0.25;
	// Levitation is the suspension of weight: inside the grip the element's own
	// gravity and buoyancy are all but cancelled, or a water ball sags through
	// its shell and a fire ball floats off it.
	flow.weightMul = 0.12;
	flow.wander = BOUNDARY_WANDER * 0.55;
	flow.lifeMul = HELD_LIFE;
	flow.arms = arms;
	flow.armPitch = 0;
	flow.squash = grips ? 0 : ROTOR.squash;

	return {
		update(frame) {
			if (hushed(frame, channel)) {
				return;
			}
			const seconds = frame.dtMs / 1000;
			const punch = punchAt(frame);
			const presence = shapeAt(PRESENCE, frame);
			// R-20. The feed accumulates in the ball and the valve closes as it
			// fills, so the mass approaches capacity and never reaches it. Only
			// the share the pair has purchase on counts toward the fill.
			if (grips) {
				heldMass +=
					frame.emission * seconds * Math.max(0, 1 - heldMass / params.capacity) * purchase;
			}
			const fill = grips ? clamp(heldMass / params.capacity) : 0;
			// R-16. The rotor turns on its own spin whether or not it grips, and
			// coasts rather than stopping dead when the drive envelope closes.
			spinPhase += spinRate * (COAST + (1 - COAST) * frame.drive) * seconds;
			bobPhase += params.bobRate * seconds;
			const breath = 1 + 0.07 * Math.sin(bobPhase);
			radius = params.radius * (SHELL.empty + (SHELL.full - SHELL.empty) * fill) * breath * stance;

			tip.z = params.at.z + radius * 0.07 * Math.sin(bobPhase);
			flow.originZ = tip.z;
			// Hard enough to beat the turbulence that would otherwise carry the ball
			// away. A grip that loses to its own noise is a plume with a name.
			flow.gather = (params.gather + 2) * (1.5 + 3.2 * (grips ? gripStrength : GRIPLESS));
			flow.holdRadius = radius;
			flow.footprint = radius * 1.35;
			// Measured from the locus, not from the paper: what is held is held there.
			flow.reach = Math.max(0.18, radius * 2.4);
			flow.speed = params.lift * frame.drive * 0.55;
			// Driven under the pattern rate on purpose: matter that outruns its
			// own arms streams through them and washes the turn back out. The
			// herding carries trapped mass at the pattern's speed regardless.
			flow.swirl = spinRate * 0.55 * (COAST + (1 - COAST) * frame.drive);
			flow.armPhase = lobePhase + spinPhase;
			// The rotor's herding has to out-pull the gather's own churn, or the
			// arms smear back into the axisymmetric shell no turn can show on.
			flow.armGain = (grips ? 1.2 : 3.4) * (COAST + (1 - COAST) * frame.drive);
			flow.punch = punch;
			flow.burn = burnAt(frame);
			flow.drain = frame.beat === 'afterglow' ? frame.beatT : 0;
			// R-20's fill transient and then a suspended ball: the feed closes as the
			// ball fills, and what is already held keeps the shell dense.
			flow.emission = Math.min(
				0.9,
				shapeOf(frame.emission, track.emission.gain) * presence * (0.4 + 0.6 * (1 - fill)) +
					0.75 * fill * presence +
					0.3 * presence
			);
			channel.perform(frame.tMs);

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
				clamp(flow.emission),
				{ ...params.at },
				{ ...tip },
				{
					fill: grips ? clamp(heldMass / params.capacity) : 0,
					grip: gripStrength * (grips ? clamp(heldMass / params.capacity) : 0),
					closed: ceiling.closed,
					purchase,
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
