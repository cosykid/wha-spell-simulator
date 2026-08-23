/**
 * @file The intake cell: R-13's ambient coupling, performed as the world bending
 * toward the seal.
 *
 * These strokes are **the medium, not the spell**. `docs/ground-truth.md` section
 * 7 exempts the seal's own manifestation from the pull field outright, or
 * grasping wind would swallow its own burst, and the cell honors that the only
 * way a cell can: it reads its own track and draws its own ink, and it never
 * touches another cell's form. Nothing here is bright, because a pull that
 * out-draws the thing it is pulling toward has stopped being ambient.
 *
 * The three channels of section 7 arrive as three readable behaviours: a signed
 * radial run (inward draws, outward pushes — one kernel, not two), a turn whose
 * share of the run follows the arrows' slant, and a lateral carry along their net
 * side. The twist also lifts, which is what makes a slanted pull canon's helical
 * vortex rather than a flat inflow.
 *
 * **The charge beat is silent.** R-01 gives the charge "ambient medium draws
 * inward", and intake is ambient by law, so the question is real — but the score
 * settles it: this track's emission and drive both open at the strike, and
 * `cast/CLAUDE.md` names `shimmer` as the one track whose emission opens in the
 * charge. Drawing here would be timing no envelope authored, so R-10's medium
 * performs that line and this cell waits for the strike.
 *
 * What each beat looks like:
 *
 * | beat      | the cell                                                        |
 * | --------- | --------------------------------------------------------------- |
 * | charge    | nothing. The medium's own cell has that beat.                    |
 * | strike    | the world leans in and the mouth flares as the first strokes land. |
 * | body      | steady streaming, strokes swallowed one after another.           |
 * | release   | the mouth closes; the strokes coast on what speed they had.       |
 * | afterglow | they drift to a stop and fade where they stand.                   |
 */

import { createStreamlines, type StrokeSeed } from './forms/streamlines.js';
import { mulberry32 } from '../stage/rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellContext, CellFrame } from './cell.js';
import type { Beat, Track } from '../../types.js';

const INTAKE_CELL = {
	/** Strokes at no garnish at all, and at the table's most generous row. */
	strokes: { min: 10, max: 26 },
	/** Seal units out to which a stroke is born. Outside the ring, inside the frame. */
	bornRadius: 2,
	/** Seal units the mouth may sit at. Wide enough to read, never on the center. */
	mouth: { min: 0.3, max: 0.9 },
	/** Radians a stroke turns through when the arrows are pure twist. */
	fullTurn: Math.PI * 1.2,
	/** Seconds of lift and of lateral carry a stroke banks over one run. */
	riseSeconds: 1,
	driftSeconds: 0.8,
	/** Fraction of one run a stroke's tail spans, at no persistence and at full. */
	tail: { short: 0.28, long: 0.34 },
	/** Peak alpha. Low on purpose: this is the world, not the spell. */
	alpha: 0.56,
	/** Peak brightness of the flash at the mouth. */
	flash: 0.55,
	/** Fraction of the run rate the strokes coast at once the drive has closed. */
	coast: 0.35,
	/** Below this the draw is rounding dust and the medium still inhales. */
	deadDraw: 1e-6
} as const;

/** How present the streamlines are through each beat. */
const STREAM_PRESENCE: Record<Beat, (beatT: number) => number> = {
	charge: () => 0,
	strike: (t) => t,
	body: () => 1,
	release: (t) => 0.85 - 0.35 * t,
	afterglow: (t) => 0.5 * (1 - t) * (1 - t)
};

/** How hard the mouth flares in each beat, on top of the emission envelope. */
const MOUTH_BLOOM: Record<Beat, (beatT: number) => number> = {
	charge: () => 0,
	strike: (t) => 1.6 * t,
	body: () => 1,
	release: () => 0,
	afterglow: () => 0
};

/** An envelope's curve value, 0..1, with its gain divided back out. */
function shapeOf(value: number, gain: number): number {
	return gain > 0 ? clamp(value / gain) : 0;
}

/**
 * One stroke per seed, spread around the ring and staggered in time, so the field
 * reads as many independent arrivals rather than as one rotating comb.
 */
function strokeSeeds(count: number, rng: () => number): StrokeSeed[] {
	const spacing = (Math.PI * 2) / count;
	return Array.from({ length: count }, (unused, index) => ({
		bearing: index * spacing + (rng() - 0.5) * spacing * 0.7,
		phase: rng(),
		jitter: rng()
	}));
}

/**
 * The pull family as ambient streamlines. Everything that separates a draw from a
 * push is the sign of one param, exactly as section 7's signed kernel says.
 */
export function createIntakeCell(track: Track<'intake'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const { params } = track;
	const look = ctx.look[track.look];
	const material = ctx.look.material;

	const count = Math.round(
		INTAKE_CELL.strokes.min +
			(INTAKE_CELL.strokes.max - INTAKE_CELL.strokes.min) * clamp(material.garnishDensity)
	);
	const streams = createStreamlines({
		look,
		material,
		seeds: strokeSeeds(count, rng),
		length: INTAKE_CELL.tail.short + INTAKE_CELL.tail.long * clamp(material.trailPersistence),
		width: clamp(material.ribbonWidth * 0.3, 0.013, 0.05)
	});

	// One signed kernel. The draw's sign is the whole of the difference between a
	// seal that inhales and one that pushes the medium away.
	const outward = params.draw < -INTAKE_CELL.deadDraw;
	const mouth = clamp(
		Math.max(params.eye, params.pool),
		INTAKE_CELL.mouth.min,
		INTAKE_CELL.mouth.max
	);
	const from = outward ? mouth : INTAKE_CELL.bornRadius;
	const to = outward ? INTAKE_CELL.bornRadius : mouth;

	// The wiki's flux law, in the plan's two components: pull weakens as the
	// cosine of the slant and twist grows as its sine, so the share of the run
	// spent turning is the share of the speed the swirl holds.
	const speed = Math.hypot(params.draw, params.swirl);
	const slant = speed > 0 ? params.swirl / speed : 0;
	const turn = INTAKE_CELL.fullTurn * slant;
	const runsPerSecond = speed / Math.max(0.05, Math.abs(INTAKE_CELL.bornRadius - mouth));

	const lift = Math.min(params.ceiling, params.rise * INTAKE_CELL.riseSeconds);
	const drift = params.drift * INTAKE_CELL.driftSeconds;
	// Faint by law. A medium that reads as brightly as the manifestation it
	// surrounds has stopped being the background of the shot.
	const inkAlpha = INTAKE_CELL.alpha * (0.45 + 0.55 * clamp(material.opacity));

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(streams.mesh);

	/** How far through a run the leading stroke is, wrapped into 0..1. The cell's only state. */
	let flowPhase = 0;

	return {
		group,
		update(frame: CellFrame) {
			group.visible = frame.beat !== 'charge';
			if (!group.visible) {
				return;
			}

			const presence = Math.pow(
				STREAM_PRESENCE[frame.beat](frame.beatT),
				// Heavy matter takes its time leaning in; thin matter is already moving.
				0.6 + clamp(material.weight)
			);
			const carry = Math.max(frame.drive, INTAKE_CELL.coast * presence);
			flowPhase = (flowPhase + runsPerSecond * carry * (frame.dtMs / 1000)) % 1;

			// Flicker strobes the mouth rather than the strokes: fire's intake gutters
			// where water's swallows evenly.
			const gutter = 1 - clamp(material.flicker) * 0.45 * (0.5 + 0.5 * Math.sin(flowPhase * 44));
			streams.setFlow({
				phase: flowPhase,
				from,
				to,
				outward,
				turn,
				lift,
				drift,
				lateral: params.lateral,
				alpha: presence * inkAlpha,
				flash:
					shapeOf(frame.emission, track.emission.gain) *
					MOUTH_BLOOM[frame.beat](frame.beatT) *
					INTAKE_CELL.flash *
					(0.35 + 0.65 * clamp(material.emissive)) *
					gutter
			});
		},
		dispose() {
			group.clear();
			streams.dispose();
		}
	};
}
