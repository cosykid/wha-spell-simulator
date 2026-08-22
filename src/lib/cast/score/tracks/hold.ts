/**
 * @file The hold track: R-13's spring, levitation as a hover ceiling.
 *
 * `docs/ground-truth.md` section 6 gives the shape: parcels are lifted to and
 * held at a rest height proportional to mean sign length, gathered back onto the
 * hover axis when displaced, and spun by the levitation circulation. This file's
 * one job past that is unit conversion. The plan's `hold.at` is in ink units, an
 * unbounded sum of drawn length, so a four-sign ring parks its locus at 2.8 ring
 * radii — off the seal entirely. `saturate` maps it onto the seal's own hover
 * range, whose top is the 0.85 `hoverCeiling` salvaged from `sampleField.ts`.
 *
 * Open canon question 3 (does a levitation rotor spin without a grip?) is
 * already answered upstream: `resolveHold` returns null when the ink never
 * closes a grip and tags the plan `levitation-without-grip`. Nothing here
 * second-guesses that, so a rotor scores no track rather than an invented one.
 */

import { aboveFloor, saturate } from './gain.js';
import { clamp } from '../../../utils/geometry.js';
import type { Population, SpellPlan, Track, Vector } from '../../../types.js';

const HOLD_TUNING = {
	/** Grip magnitude at which the spring reads half as strong as it can get. */
	halfGrip: 8,
	/** Rest height in ink units at which the locus sits half way up its range. */
	halfHeight: 1.6,
	/** Seal units: the lowest a hold may park its mass, and how far above that it may go. */
	restFloor: 0.35,
	restSpan: 0.8,
	/** Seal units the locus may slide off the seal axis, however lopsided the ink. */
	maxSlide: 0.8,
	/** Parcels per second at full strength. */
	rate: 95,
	/**
	 * Seal units per second of lift below the ceiling. Brisk on purpose: section 6
	 * reads the visible spell as a brief fill transient and then a suspended ball,
	 * so the climb has to be over well inside the body beat.
	 */
	lift: 2.4,
	liftFloor: 0.35,
	/** Per second: how hard displaced parcels are drawn back onto the hover axis. */
	gather: 1.6,
	/** Seal units of blob the held mass churns in. */
	radius: 0.22,
	/** Radians per second of the settled mass's bob. Slow: it reads as breathing. */
	bobRate: 1.5,
	/** Seal units per second below which a parcel counts as arrived (open question 5). */
	captureSpeed: 0.55,
	/** Spin magnitude at which the rotor reads half as fast as it can get. */
	halfSpin: 6,
	/** Tangential seal units per second at full spin. */
	spin: 1.1
} as const;

/** The in-plane locus, squashed into the seal disc however lopsided the ink is. */
function slide(at: Vector): Vector {
	const arm = Math.hypot(at.x, at.y);
	if (arm <= HOLD_TUNING.maxSlide) {
		return { x: at.x, y: at.y };
	}
	const scale = HOLD_TUNING.maxSlide / arm;
	return { x: at.x * scale, y: at.y * scale };
}

/** R-13. The levitation clash, played as a mass lifted to and kept at a ceiling. */
export function holdTrack(plan: SpellPlan, population: Population): Track<'hold'> | null {
	const hold = plan.hold;
	if (!hold) {
		return null;
	}
	const strength = saturate(hold.grip, HOLD_TUNING.halfGrip);
	const rest = saturate(hold.at.z, HOLD_TUNING.halfHeight);
	const locus = slide(hold.at);
	return {
		id: 'hold-levitation',
		kind: 'hold',
		population,
		params: {
			at: {
				x: locus.x,
				y: locus.y,
				z: HOLD_TUNING.restFloor + HOLD_TUNING.restSpan * rest
			},
			lift: HOLD_TUNING.lift * aboveFloor(HOLD_TUNING.liftFloor, strength),
			gather: HOLD_TUNING.gather * clamp(plan.quality),
			radius: HOLD_TUNING.radius,
			spin: Math.sign(hold.spin) * HOLD_TUNING.spin * saturate(hold.spin, HOLD_TUNING.halfSpin),
			bobRate: HOLD_TUNING.bobRate,
			captureSpeed: HOLD_TUNING.captureSpeed
		},
		// Section 6's fill transient: the disk feeds the blob hard at the strike and
		// then tails off, and the drive runs long because the grip does not let go
		// when release begins.
		emission: { from: 'strike', to: 'body', curve: 'decay', gain: HOLD_TUNING.rate * strength },
		drive: { from: 'strike', to: 'release', curve: 'hold', gain: 1 },
		look: 'body'
	};
}
