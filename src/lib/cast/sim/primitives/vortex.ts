/**
 * @file The vortex kernel: R-05's circulation as a Rankine cell.
 *
 * Salvaged from `sim3d/core/vortex.ts` on branch `tc-field-canvas-rework`, minus
 * its three.js frame. Circulation is not a flat stir. It is a funnel that spins
 * solid-body inside its core and as `1/r` outside, wrapped in a secondary cell:
 * the floor boundary layer feeds the foot, the wall carries an updraft, and at
 * the crown the swirl fades and the column sheds **out and down**, which is the
 * spill rule that keeps matter cycling instead of stranding in mid-air.
 *
 * The eye is the one term the branch left implicit and the deleted field engine
 * made explicit: inside the core radius the flow is
 * thrown back onto the wall, so the funnel reads as a sheath around a calm
 * center rather than a filled cone.
 */

import { sampleAperture } from '../aperture.js';
import { NEGLIGIBLE_DISTANCE, smoothstep } from '../falloff.js';
import { restOnSeal, SPAWN_HEIGHT, type Primitive } from './primitive.js';
import type { Vec3, VortexParams } from '../../../types.js';

const VORTEX_SIM = {
	/** Fraction of the wall speed a parcel is launched with, along the tangent. */
	spawnKick: 0.3,
	/** Fraction of the updraft it leaves the paper with, so it clears the floor layer. */
	spawnRise: 0.5,
	/** Seconds a vortex parcel lives. Long: a cell has to be seen going round. */
	lifetimeS: 3.4,
	lifetimeSpread: 0.3,
	/** Nothing is born inside the eye, as a fraction of the foot radius. */
	spawnFloor: 1.1,
	/** Seal units where the `1/r` tail starts to die, and the length it dies over. */
	tail: { from: 1.15, over: 0.5 },
	/** The updraft sheath: where on the core radius it peaks, and how wide it is. */
	wall: { peak: 0.8, width: 0.7 },
	/**
	 * Crown fractions: the updraft is fully on by `onBy` and gone by `offBy`. The
	 * switch-on is the floor boundary layer, where the flow still spirals in
	 * rather than climbing, so it is shallow — a seal is not the branch's room.
	 */
	updraft: { onBy: 0.05, offFrom: 0.88, offBy: 1.06 },
	/** Crown fractions where the swirl fades, so spilling parcels exit on a curve. */
	swirlFade: { from: 0.85, to: 1.25 },
	/** The floor inflow: the layer it hugs, the band it draws from, and its own tail. */
	feed: { layer: 0.2, from: 1.1, to: 2.2, tailFrom: 1.35, tailOver: 0.6 },
	/** The crown spill: its window in crown fractions, its radial reach, its downward tilt. */
	spill: { onFrom: 0.9, onBy: 1.12, offFrom: 1.3, offBy: 1.6, reach: 1.6, fall: 0.45 },
	/** How hard the eye throws a parcel back onto the wall, as a share of the spin. */
	eyePush: 0.6
} as const;

/** A tight foot flaring toward the crown, from `vortexCoreR` on the branch. */
function coreRadiusAt(params: VortexParams, climb: number): number {
	const s = Math.min(1, Math.max(0, climb));
	return Math.max(
		params.footRadius + (params.crownRadius - params.footRadius) * s,
		NEGLIGIBLE_DISTANCE
	);
}

export const VORTEX: Primitive<VortexParams> = {
	kind: 'vortex',

	spawn(params, aperture, rng) {
		const at = sampleAperture(aperture, rng);
		const radius = Math.hypot(at.x, at.y);
		const floor = params.footRadius * VORTEX_SIM.spawnFloor;
		// A parcel born in the eye would fill the hollow the cell exists to hold.
		const scale = radius < floor ? floor / Math.max(radius, NEGLIGIBLE_DISTANCE) : 1;
		const x = at.x * scale;
		const y = at.y * scale;
		const arm = Math.max(Math.hypot(x, y), NEGLIGIBLE_DISTANCE);
		const kick = params.spin * VORTEX_SIM.spawnKick;
		return {
			at: { x, y, z: SPAWN_HEIGHT },
			velocity: {
				x: (y / arm) * kick,
				y: (-x / arm) * kick,
				z: params.updraft * VORTEX_SIM.spawnRise
			},
			lifetimeS: VORTEX_SIM.lifetimeS * (1 + (rng() * 2 - 1) * VORTEX_SIM.lifetimeSpread)
		};
	},

	velocity(params, at, _ageS): Vec3 {
		const height = Math.max(params.height, NEGLIGIBLE_DISTANCE);
		const climb = Math.max(0, at.z) / height;
		const core = coreRadiusAt(params, climb);
		const radius = Math.hypot(at.x, at.y);

		// The updraft peaks on the wall rather than on the axis: a tornado is a
		// climbing sheath around a calmer eye.
		const offWall = (radius - VORTEX_SIM.wall.peak * core) / (VORTEX_SIM.wall.width * core);
		const sheath = Math.exp(-(offWall ** 2));
		const rise =
			params.updraft *
			sheath *
			smoothstep(0, VORTEX_SIM.updraft.onBy * height, at.z) *
			(1 - smoothstep(VORTEX_SIM.updraft.offFrom, VORTEX_SIM.updraft.offBy, climb));

		if (radius < NEGLIGIBLE_DISTANCE) {
			return { x: 0, y: 0, z: rise };
		}
		const outward = { x: at.x / radius, y: at.y / radius };
		// Counter-clockwise as the drawer sees it, matching `fan.ts` and `columns.ts`:
		// seal space puts y screen-down, so a quarter turn maps (x, y) to (y, -x).
		const tangential = { x: outward.y, y: -outward.x };

		const rankine =
			radius <= core
				? radius / core
				: (core / radius) *
					Math.exp(-Math.max(0, radius - VORTEX_SIM.tail.from) / VORTEX_SIM.tail.over);
		const swirl =
			params.spin *
			rankine *
			(1 - smoothstep(VORTEX_SIM.swirlFade.from, VORTEX_SIM.swirlFade.to, climb));

		// The hollow eye: inside the core the flow is thrown back onto the wall.
		const eye =
			radius < core ? Math.abs(params.spin) * VORTEX_SIM.eyePush * (1 - radius / core) : 0;

		// The floor boundary layer spirals in and hands off to the wall updraft.
		const feed =
			params.feed *
			Math.exp(-Math.max(0, at.z) / VORTEX_SIM.feed.layer) *
			smoothstep(VORTEX_SIM.feed.from * core, VORTEX_SIM.feed.to * core, radius) *
			Math.exp(-Math.max(0, radius - VORTEX_SIM.feed.tailFrom) / VORTEX_SIM.feed.tailOver);

		// The crown spill: out and down, which starts the return leg the feed finishes.
		const spill =
			params.spill *
			smoothstep(VORTEX_SIM.spill.onFrom, VORTEX_SIM.spill.onBy, climb) *
			(1 - smoothstep(VORTEX_SIM.spill.offFrom, VORTEX_SIM.spill.offBy, climb)) *
			Math.exp(-((Math.max(0, radius - core) / (VORTEX_SIM.spill.reach * core)) ** 2));

		const radial = eye + spill - feed;
		return {
			x: outward.x * radial + tangential.x * swirl,
			y: outward.y * radial + tangential.y * swirl,
			z: rise - VORTEX_SIM.spill.fall * spill
		};
	},

	constrain(_params, parcel) {
		restOnSeal(parcel);
	}
};
