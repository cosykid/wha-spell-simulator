/**
 * @file The jet tracks: every aimed column a plan asks for.
 *
 * R-05 is built into the params rather than applied later. `axis` is the plan's
 * own aim vector, which points where the long sign points and never toward where
 * it sits, so there is no separate lean term left to invert the way the first
 * `SpellField` did.
 *
 * R-02 shapes the timing: emission runs from `strike` to `body` and stops there,
 * so nothing is still charging when `release` begins.
 */

import { aboveFloor, saturate } from './gain.js';
import { isPresent, magnitude3, normalize3, SEAL_UP } from '../../vec3.js';
import { clamp } from '../../../utils/geometry.js';
import type { Population, SpellPlan, Track, Vec3 } from '../../../types.js';

const JET_TUNING = {
	/** Aim magnitude at which a jet reads half as strong as it can get. */
	halfAim: 4,
	/** Parcels per second at full strength. */
	rate: 150,
	/** Seal units per second at full strength. */
	speed: 2.4,
	/** Fraction of `speed` the faintest jet still keeps. */
	speedFloor: 0.4,
	// Beam footprint and chimney draft, salvaged from the `axial` case of
	// field/sampleField.ts (FIELD_TUNING.axialFootprint / axialConverge).
	footprint: 0.45,
	converge: 0.6,
	/** Seal units along the axis where the beam has spent half its push. */
	reach: 1.6,
	/** R-09's valve throws by its own numbers, so its jet reads `hardness` as strength. */
	exhaustRateScale: 0.8,
	/** R-11's designed default: faint, upward, and never absent. */
	defaultRate: 45,
	defaultSpeed: 0.7
} as const;

interface JetShape {
	id: string;
	axis: Vec3;
	rate: number;
	speed: number;
	reach: number;
	look: Track['look'];
}

/** One jet, with the timing every jet shares. */
function jetTrack(shape: JetShape, plan: SpellPlan, population: Population): Track<'jet'> {
	return {
		id: shape.id,
		kind: 'jet',
		population,
		params: {
			axis: shape.axis,
			speed: shape.speed,
			// R-13's lens packs the beam tighter; a sloppy drawing drafts less firmly.
			footprint: JET_TUNING.footprint / Math.max(plan.focus, 1),
			converge: JET_TUNING.converge * clamp(plan.quality),
			reach: shape.reach
		},
		emission: { from: 'strike', to: 'body', curve: 'attack', gain: shape.rate },
		drive: { from: 'strike', to: 'body', curve: 'hold', gain: 1 },
		look: shape.look
	};
}

/** R-05. The column's own beam, aimed where the ink points. */
export function aimJet(plan: SpellPlan, population: Population): Track<'jet'> | null {
	if (!isPresent(plan.aim)) {
		return null;
	}
	const strength = saturate(magnitude3(plan.aim), JET_TUNING.halfAim);
	return jetTrack(
		{
			id: 'jet-aim',
			axis: normalize3(plan.aim),
			rate: JET_TUNING.rate * strength,
			speed: JET_TUNING.speed * aboveFloor(JET_TUNING.speedFloor, strength),
			reach: JET_TUNING.reach,
			look: 'body'
		},
		plan,
		population
	);
}

/** R-09. The region valve's exhaust, thrown as far as its `reach` says. */
export function exhaustJet(plan: SpellPlan, population: Population): Track<'jet'> | null {
	if (!isPresent(plan.exhaust)) {
		return null;
	}
	const strength = clamp(plan.hardness);
	return jetTrack(
		{
			id: 'jet-exhaust',
			axis: normalize3(plan.exhaust),
			rate: JET_TUNING.rate * JET_TUNING.exhaustRateScale * strength,
			speed: JET_TUNING.speed * aboveFloor(JET_TUNING.speedFloor, strength),
			reach: JET_TUNING.reach * plan.reach,
			look: 'body'
		},
		plan,
		population
	);
}

/**
 * R-11. "Manifests nothing" is a look, not an absence: a plan that resolved to
 * no primitive at all still gets a faint upward plume, so the renderer has no
 * empty path to fall into.
 */
export function defaultJet(plan: SpellPlan, population: Population): Track<'jet'> {
	return jetTrack(
		{
			id: 'jet-default',
			axis: SEAL_UP,
			rate: JET_TUNING.defaultRate,
			speed: JET_TUNING.defaultSpeed,
			reach: JET_TUNING.reach,
			look: 'wisp'
		},
		plan,
		population
	);
}
