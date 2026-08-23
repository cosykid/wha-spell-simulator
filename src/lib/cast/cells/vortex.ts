/**
 * @file The vortex cell: R-05's circulation, performed as the Rankine funnel the
 * abandoned `tc-field-canvas-rework` branch proved out.
 *
 * The branch's physics is ported as **form**. A core that flares with height,
 * helical arms on the funnel wall, a calm hollow eye, a boundary layer feeding
 * the foot along the paper, and a crown that folds out and down to close the
 * circulation cell. What changed is where it lives: none of it is a force term
 * any more, so a spell that is not a whirl has nothing here to retune.
 *
 * One phase turns everything. The arms' helices, the stripes on them and the
 * floor's streaks all read `spinPhase`, which is advanced by the drive envelope
 * and by nothing else. That is the branch's one non-negotiable rule.
 *
 * What each beat looks like:
 *
 * | beat      | the cell                                                       |
 * | --------- | -------------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.       |
 * | strike    | the funnel is thrown up past where it settles, and spins up.    |
 * | body      | it stands and turns, every arm lit, breathing on its lean.      |
 * | release   | it commits: lets go of the floor, stretches taller and thinner. |
 * | afterglow | it unwinds, widening and losing arms as it goes.                |
 */

import { createVortexArms } from './forms/vortexArms.js';
import { createVortexFloor } from './forms/vortexFloor.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellConstraint, CellContext, CellFrame } from './cell.js';
import type { Beat, Track } from '../../types.js';

const VORTEX_CELL = {
	/** Arms a funnel may turn on. Two read as a stir; more than six as a brush. */
	arms: { min: 3, max: 6 },
	/** Seal units: a funnel taller than this has stood all the way up. */
	standingHeight: 1.5,
	/** How much wider a flat whirl runs at the foot and at the crown, at zero stature. */
	flatten: { foot: 0.34, crown: 0.55 },
	/** Turns of winding from foot to crown, plus what a flat whirl adds to them. */
	turns: { base: 1, flat: 0.7 },
	/** Seal units the crown leans by at full undulation, and radians per second of that lean. */
	sway: 0.18,
	swayRate: 1.1,
	/** The share of the arms lit before emission adds any of its own. */
	litFloor: 0.6,
	/** Seal units of paper the boundary layer is drawn across. */
	floorReach: 1.35,
	/** Peak alpha of the arms and of the floor. Additive ink piles up; nothing is opaque. */
	armAlpha: 0.95,
	floorAlpha: 0.62,
	/** How far past its settled height the strike throws a weightless funnel. */
	overshoot: 0.5,
	/** Fraction of the spin the funnel coasts at once the drive envelope has closed. */
	coast: 0.4,
	/** Radians the floor's streaks bend across the disc, per arm. */
	curl: 1.6
} as const;

/** How present the funnel is through each beat. */
const FUNNEL_PRESENCE: Record<Beat, (beatT: number) => number> = {
	charge: () => 0,
	strike: (t) => t * (2 - t),
	body: () => 1,
	release: (t) => 1 - 0.4 * t,
	afterglow: (t) => 0.6 * (1 - t) * (1 - t)
};

/**
 * How tall it stands in each beat, as a multiple of the height the track asked
 * for. Only the strike reads `overshoot`, which is how far past the mark the
 * throw carries: light matter sails past it and heavy matter barely does.
 */
const FUNNEL_STATURE: Record<Beat, (beatT: number, overshoot: number) => number> = {
	charge: () => 0,
	// Thrown up, over the mark, and back onto it by the time the body opens.
	strike: (t, overshoot) => Math.pow(t, 0.35) * (1 + overshoot * Math.sin(Math.PI * t)),
	body: () => 1,
	release: (t) => 1 + 0.32 * t,
	afterglow: (t) => 1.32 + 0.34 * t
};

/** How wide its crown runs in each beat. A dying whirl spreads before it goes. */
const FUNNEL_SPREAD: Record<Beat, (beatT: number) => number> = {
	charge: () => 1,
	strike: (t) => 0.66 + 0.34 * t,
	body: () => 1,
	release: (t) => 1 + 0.16 * t,
	afterglow: (t) => 1.16 + 0.6 * t
};

/** An envelope's curve value, 0..1, with its gain divided back out. */
function shapeOf(value: number, gain: number): number {
	return gain > 0 ? clamp(value / gain) : 0;
}

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

/**
 * How many ribbons the funnel turns on. R-05 already spent the sign count on the
 * spin, so the drawing's fold only says how the form repeats; a material with no
 * banding of its own falls back to the fewest arms a funnel still reads with.
 */
function armCount(symmetry: number | null, bands: number): number {
	return Math.round(clamp(symmetry ?? bands, VORTEX_CELL.arms.min, VORTEX_CELL.arms.max));
}

/**
 * The circulation as a standing, turning body. Strength arrives as one number —
 * the height the score asked for — and it buys stature, tightness of foot and
 * winding together, so a weak swirl is a flat wide whirl and a strong one is a
 * tall tight column.
 */
export function createVortexCell(track: Track<'vortex'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const { params } = track;
	const look = ctx.look[track.look];
	const material = ctx.look.material;

	const arms = armCount(params.symmetry, material.bands);
	const seeds = Array.from({ length: arms }, () => rng());
	const swaySeed = rng() * Math.PI * 2;

	// Sense of rotation is the param's sign, all the way through: the phase turns
	// that way, the arms wind that way, and the floor's streaks sweep that way.
	const sense = Math.sign(params.spin) || 1;
	const stature = clamp(params.height / VORTEX_CELL.standingHeight);
	// A standing funnel is tight at the paper and flared at the crown; a whirl
	// that never stood up is a broad shallow bowl instead.
	const foot = params.footRadius * (1 + VORTEX_CELL.flatten.foot * (1 - stature));
	// A funnel that sheds more than it lifts opens wider at the top.
	const spillShare = clamp(params.spill / Math.max(1e-6, params.updraft));
	const crown =
		params.crownRadius * (1 + VORTEX_CELL.flatten.crown * (1 - stature)) * (0.6 + 0.5 * spillShare);
	const pitch =
		sense * Math.PI * 2 * (VORTEX_CELL.turns.base + VORTEX_CELL.turns.flat * (1 - stature));
	// Solid body inside the core: one angular rate for the whole funnel, taken
	// from the tangential rate on the wall it acts at.
	const omega = params.spin / Math.max(0.12, (foot + crown) / 2);
	// The floor is only as present as the feed that draws it, against the lift.
	const feedShare = 0.55 + 0.45 * clamp(params.feed / Math.max(1e-6, params.feed + params.updraft));
	// How present the ink is: its own fill, plus whatever light it makes. The floor
	// is high because even wind, the faintest row in the table, has to read as a
	// turning body rather than as a smudge.
	const inkAlpha = clamp(0.5 + 0.35 * material.opacity + 0.5 * material.emissive, 0.55, 1);
	const overshoot = VORTEX_CELL.overshoot * (1 - 0.35 * clamp(material.weight));

	const funnel = createVortexArms({ look, material, arms, seeds });
	const floor = createVortexFloor({ look, material, arms });

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(floor.mesh, funnel.object);

	/** Radians of spin, and of the lean's own cycle. The cell's only state. */
	let spinPhase = 0;
	let swayPhase = swaySeed;
	/** The holder's ceiling, when the plan declared one. Never read across cells. */
	let held: CellConstraint | null = null;

	return {
		group,
		bind(constraint) {
			held = constraint;
		},
		update(frame: CellFrame) {
			// R-01: the charge belongs to the ambient medium, so a cell that
			// performs the seal's own circulation is absent rather than dark.
			group.visible = frame.beat !== 'charge';
			if (!group.visible) {
				return;
			}

			const presence = FUNNEL_PRESENCE[frame.beat](frame.beatT);
			// Past the drive envelope the funnel still turns, slower, the way a
			// spun body does. Presence carries it down to a stop.
			const turn = Math.max(frame.drive, VORTEX_CELL.coast * presence);
			const dtS = frame.dtMs / 1000;
			spinPhase += omega * turn * dtS;
			swayPhase += VORTEX_CELL.swayRate * turn * dtS;

			const spread = FUNNEL_SPREAD[frame.beat](frame.beatT);
			const lit =
				VORTEX_CELL.litFloor +
				(1 - VORTEX_CELL.litFloor) * shapeOf(frame.emission, track.emission.gain);

			funnel.setFunnel({
				phase: spinPhase,
				foot,
				crown: heldWithin(crown * spread, held),
				height: heldWithin(
					params.height * FUNNEL_STATURE[frame.beat](frame.beatT, overshoot),
					held
				),
				pitch,
				sway: VORTEX_CELL.sway * material.undulation,
				swayPhase,
				alpha: presence * VORTEX_CELL.armAlpha * inkAlpha,
				lit
			});
			floor.setInflow({
				eye: foot,
				reach: heldWithin(VORTEX_CELL.floorReach * spread, held),
				phase: spinPhase,
				curl: sense * VORTEX_CELL.curl * arms,
				alpha: presence * feedShare * VORTEX_CELL.floorAlpha * inkAlpha
			});
		},
		dispose() {
			group.clear();
			funnel.dispose();
			floor.dispose();
		}
	};
}
