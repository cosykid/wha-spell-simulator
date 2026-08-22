/**
 * @file Parcels to pixels. The only place a cast becomes an image, and the only
 * place the look table is read.
 *
 * There is no per-element code path here and there must never be one: a parcel
 * carries a {@link LookRole}, the cast carries a sigil and an element, and the
 * table turns that pair into every number this file uses. Adding an element or
 * changing an element's art is a table row.
 *
 * Depth comes from `portal/portal.ts` and does two jobs the flat 2D effects
 * never had: it sorts the painter's order, and it attenuates size and alpha, so
 * the far rim of the seal sits behind the near rim instead of beside it.
 *
 * @example
 * paintCast(ctx, portal, state.parcels, { sigil: score.sigil, element: score.element });
 */

import { curveAt } from '../score/envelopes.js';
import { lookRow, type LookKey } from '../looks/table.js';
import { spriteFor, type Sprite } from './sprites.js';
import { PORTAL, projectSeal, type Portal } from '../../portal/portal.js';
import { clamp } from '../../utils/geometry.js';
import type { Look } from '../looks/look.js';
import type { Parcel } from '../sim/parcel.js';

const PAINT = {
	/** Peak alpha of a parcel's head. Additive sprites pile up, so no parcel is opaque. */
	headAlpha: 0.62,
	/** Seconds of travel between one trail ghost and the next. */
	trailStepS: 1 / 45,
	/** Projected speed, in px per second, at which a look's `stretch` is fully applied. */
	fullStretchPxPerS: 320,
	/** How far depth may grow or shrink a parcel. Clamped so the near clip cannot explode. */
	attenuation: { min: 0.4, max: 1.8 },
	/** Nearest the viewer a parcel may be reckoned at, in seal units, to keep the divide finite. */
	nearPlane: 0.5
} as const;

/** How far through its life a parcel is: 0 at birth, 1 at retirement. */
export function lifeProgress(parcel: Pick<Parcel, 'ageS' | 'lifetimeS'>): number {
	return parcel.lifetimeS <= 0 ? 1 : clamp(parcel.ageS / parcel.lifetimeS);
}

/** The look's presence at that progress: 1 is fully there, 0 is gone. Drives alpha and size together. */
export function presenceAt(look: Look, progress: number): number {
	return curveAt(look.fade, progress);
}

/** Screen pixels across, before depth attenuation. */
export function sizeAt(look: Look, presence: number): number {
	const [min, max] = look.sizePx;
	return min + (max - min) * presence;
}

/**
 * Seal units from the viewer to the ring center. The portal's CSS perspective is
 * in canvas pixels and its ring radius is one seal unit, so their ratio is the
 * same camera the drawn paper is under.
 */
export function viewDistanceFor(portal: Portal): number {
	return PORTAL.perspectivePx / Math.max(portal.radiusX, 1);
}

/**
 * The size and brightness cue depth buys. `projectSeal` is orthographic, so this
 * is the only perspective in the frame, which is why it stays gentle: a parcel
 * on the far rim reads about a tenth smaller than one on the near rim.
 */
export function depthAttenuation(depth: number, viewDistance: number): number {
	const distance = Math.max(viewDistance + depth, PAINT.nearPlane);
	return clamp(viewDistance / distance, PAINT.attenuation.min, PAINT.attenuation.max);
}

/** Painter order: farthest first, so a near parcel covers the one behind it. */
export function farthestFirst(a: { depth: number }, b: { depth: number }): number {
	return b.depth - a.depth;
}

/** One parcel resolved into everything the blit needs, in screen space. */
interface PaintedParcel {
	look: Look;
	x: number;
	y: number;
	depth: number;
	/** Screen px across. */
	size: number;
	alpha: number;
	/** Radians, along the projected velocity. */
	angle: number;
	/** Screen px per second along that angle. */
	speedPxPerS: number;
}

function resolve(parcel: Parcel, look: Look, portal: Portal, viewDistance: number): PaintedParcel {
	const at = projectSeal(portal, parcel.at);
	// The projection is linear, so one second of velocity projects to the screen
	// velocity without a second camera.
	const ahead = projectSeal(portal, {
		x: parcel.at.x + parcel.velocity.x,
		y: parcel.at.y + parcel.velocity.y,
		z: parcel.at.z + parcel.velocity.z
	});
	const travel = { x: ahead.x - at.x, y: ahead.y - at.y };
	const presence = presenceAt(look, lifeProgress(parcel));
	const attenuation = depthAttenuation(at.depth, viewDistance);

	return {
		look,
		x: at.x,
		y: at.y,
		depth: at.depth,
		size: sizeAt(look, presence) * attenuation,
		alpha: presence * PAINT.headAlpha * Math.min(1, attenuation),
		angle: Math.atan2(travel.y, travel.x),
		speedPxPerS: Math.hypot(travel.x, travel.y)
	};
}

/** Sprite width over height once the look's velocity stretch is applied. */
function stretchedAspect(painted: PaintedParcel, sprite: Sprite): number {
	const speed = Math.min(1, painted.speedPxPerS / PAINT.fullStretchPxPerS);
	return sprite.aspect * (1 + painted.look.stretch * speed);
}

/**
 * One parcel and its trail, drawn in the parcel's own frame: after the rotate,
 * "back along the velocity" is simply negative x.
 */
function drawParcel(ctx: CanvasRenderingContext2D, painted: PaintedParcel): void {
	const { look } = painted;
	const sprite = spriteFor(look);
	const height = painted.size;
	const width = height * stretchedAspect(painted, sprite);

	ctx.save();
	ctx.globalCompositeOperation = look.blend;
	ctx.translate(painted.x, painted.y);
	ctx.rotate(painted.angle);

	const trail = look.trail;
	if (trail) {
		for (let ghost = trail.frames; ghost >= 1; ghost -= 1) {
			const taper = 1 - ghost / (trail.frames + 1);
			const ghostHeight = height * trail.widthScale * taper;
			const ghostWidth = width * trail.widthScale * taper;
			const back = painted.speedPxPerS * PAINT.trailStepS * ghost;
			ctx.globalAlpha = painted.alpha * taper * taper;
			ctx.drawImage(
				sprite.image,
				-back - ghostWidth / 2,
				-ghostHeight / 2,
				ghostWidth,
				ghostHeight
			);
		}
	}

	ctx.globalAlpha = painted.alpha;
	ctx.drawImage(sprite.image, -width / 2, -height / 2, width, height);
	ctx.restore();
}

/**
 * Every parcel of one cast, painted onto the portal. The parcel array is read
 * and never reordered: the sim's own order is part of its replay contract.
 */
export function paintCast(
	ctx: CanvasRenderingContext2D,
	portal: Portal,
	parcels: readonly Parcel[],
	key: LookKey
): void {
	const row = lookRow(key);
	const viewDistance = viewDistanceFor(portal);
	const painted = parcels
		.map((parcel) => resolve(parcel, row[parcel.look], portal, viewDistance))
		.sort(farthestFirst);
	for (const parcel of painted) {
		drawParcel(ctx, parcel);
	}
}
