/**
 * @file The portal: the tilted paper an activated spell is cast on, and the one
 * owner of its numbers. CSS draws the tilt (see `styles/canvas.css`) from the
 * custom properties {@link portalCssVariables} hands it, and effects place
 * themselves on that same paper through {@link projectSeal}. Both read the
 * constants below, so the drawn portal and the spell on it cannot drift apart.
 *
 * Seal space (spec R-03): origin at the ring center, one unit = the ring radius,
 * x right, y screen-down, z out of the paper. World space lays that seal flat
 * with +Y up, so `(x, y, z)` in seal is `(X, Z, Y)` in world.
 */

import { clamp, normalizeVector } from '../utils/geometry.js';
import type { RingInfo, Vec3, Vector } from '../types.js';

/**
 * Every number the portal is made of. The CSS transform, the projection, and the
 * renderer's tilt hold all derive from this one table.
 */
export const PORTAL = {
	/** `scale()` on the activated paper. */
	shrink: 0.45,

	/** `rotateX()` on the activated paper. */
	tiltDeg: 62,

	/** `perspective()` distance, in px. */
	perspectivePx: 850,

	/**
	 * How far a ground circle squashes vertically on screen, which is what fixes
	 * the viewer's elevation. Perspective and the off-center pivot make the drawn
	 * paper flatter than `cos(tiltDeg)` would predict, so this is fitted to the
	 * rendered ellipse rather than derived from the tilt, and everything else is
	 * derived from it.
	 */
	scaleY: 0.44,

	/** `transform-origin` pivot below center, in percent of canvas height. */
	originShiftPct: 14,

	/** `translateY()` on the activated paper, in percent of canvas height. */
	liftPct: 10,

	/**
	 * Milliseconds the paper takes to tilt in. This is the spec's charge beat
	 * (R-01): the renderer holds all emission back for exactly this long, so the
	 * canvas visibly tilts before the spell erupts.
	 */
	tiltMs: 980
} as const;

/**
 * The viewer's elevation above the seal plane, the single angle the projection
 * turns on. The ellipse the CSS draws fixes it: a ground circle squashes to
 * `sin(elevation)`, so `scaleY` is that sine and the whole camera follows.
 */
function elevationRad(scaleY: number): number {
	return Math.asin(clamp(scaleY));
}

/** Screen distance per seal unit of height above the paper, `cos(elevation)`. */
function heightForeshortening(scaleY: number): number {
	return Math.cos(elevationRad(scaleY));
}

/** Screen distance per seal unit measured along the ground, `sin(elevation)`. */
export const GROUND_FORESHORTENING = PORTAL.scaleY;

/** Screen distance per seal unit of height above the paper, `cos(elevation)`. */
export const HEIGHT_FORESHORTENING = heightForeshortening(PORTAL.scaleY);

/**
 * The portal's numbers as CSS custom properties, applied once to a page-level
 * element so the stylesheet never repeats them.
 *
 * @example
 * ```svelte
 * <div class="app-content" style={portalCssVariables()}>
 * ```
 */
export function portalCssVariables(): string {
	return [
		`--portal-shrink: ${PORTAL.shrink}`,
		`--portal-tilt: ${PORTAL.tiltDeg}deg`,
		`--portal-perspective: ${PORTAL.perspectivePx}px`,
		`--portal-origin-shift: ${PORTAL.originShiftPct}%`,
		`--portal-lift: ${PORTAL.liftPct}%`,
		`--portal-tilt-duration: ${PORTAL.tiltMs}ms`
	].join('; ');
}

// ---------------------------------------------------------------------------
// The on-screen portal
// ---------------------------------------------------------------------------

/** The activated paper as a screen-space ellipse: where seal space lands in canvas pixels. */
export interface Portal {
	center: Vector;
	radiusX: number;
	radiusY: number;
	scaleY: number;
}

/** A seal-space point placed on the portal. */
export interface ProjectedPoint {
	/** Canvas pixels. */
	x: number;
	y: number;
	/**
	 * Distance from the viewer along the view axis, in seal units and relative to
	 * the ring center. Larger is farther, so painter order draws descending and
	 * size attenuation shrinks with it.
	 */
	depth: number;
}

// The tilt's vertical pivot in canvas pixels. Written as an offset from center
// scaled by portalFit so it tracks the CSS transform-origin, which scales the
// same way: a canvas taller than the viewport would otherwise pivot off screen.
function pivotY(canvas: HTMLCanvasElement, portalFit: number): number {
	return canvas.height * (0.5 + (PORTAL.originShiftPct / 100) * portalFit);
}

/**
 * Shrinks a ring toward the tilt pivot by `PORTAL.shrink`, mirroring the
 * `scale()` the CSS applies to the activated paper. Effects are anchored to the
 * ring in canvas space, so feeding them the scaled ring moves the whole effect,
 * base ellipse and every radius-derived size at once, onto the smaller portal.
 */
export function portalScaledRing(
	ring: RingInfo,
	canvas: HTMLCanvasElement,
	portalFit: number = 1
): RingInfo {
	const originX = canvas.width / 2;
	const originY = pivotY(canvas, portalFit);
	return {
		...ring,
		center: {
			x: originX + (ring.center.x - originX) * PORTAL.shrink,
			y: originY + (ring.center.y - originY) * PORTAL.shrink
		},
		radius: ring.radius * PORTAL.shrink
	};
}

/**
 * Projects a completed ring into the tilted ellipse the activated paper shows,
 * which is the plane every effect emits from.
 *
 * @example
 * ```ts
 * const portal = activePortalPlane(ctx.canvas, portalScaledRing(ring, ctx.canvas));
 * ```
 */
export function activePortalPlane(
	canvas: HTMLCanvasElement,
	ring: RingInfo,
	portalFit: number = 1
): Portal {
	const originY = pivotY(canvas, portalFit);
	const liftY = ((canvas.height * PORTAL.liftPct) / 100) * portalFit;
	return {
		center: {
			x: ring.center.x,
			y: originY + (ring.center.y - originY) * PORTAL.scaleY + liftY
		},
		radiusX: ring.radius,
		radiusY: ring.radius * PORTAL.scaleY,
		scaleY: PORTAL.scaleY
	};
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Places a seal-space point on the portal. Ground distance and height come from
 * the same elevation, so a particle rising off the paper and the paper it rose
 * from stay in one perspective.
 */
export function projectSeal(portal: Portal, seal: Vec3): ProjectedPoint {
	const height = heightForeshortening(portal.scaleY);
	return {
		x: portal.center.x + seal.x * portal.radiusX,
		y: portal.center.y + seal.y * portal.radiusY - seal.z * portal.radiusX * height,
		depth: -(seal.y * height + seal.z * portal.scaleY)
	};
}

/** Places a world-space point on the portal, through the same camera as {@link projectSeal}. */
export function projectWorld(portal: Portal, world: Vec3): ProjectedPoint {
	return projectSeal(portal, worldToSeal(world));
}

/**
 * Projects a seal-space direction onto the screen, so an effect aimed on the
 * paper travels along the tilted plane instead of across a flat one.
 */
export function projectSealDirection(seal: Vec3): Vector {
	return normalizeVector({
		x: seal.x,
		y: seal.y * GROUND_FORESHORTENING - seal.z * HEIGHT_FORESHORTENING
	});
}

// ---------------------------------------------------------------------------
// Seal space and world space (R-03)
// ---------------------------------------------------------------------------

/** Seal space to world space: the seal plane is the ground and +Y is up. */
export function sealToWorld(seal: Vec3): Vec3 {
	return { x: seal.x, y: seal.z, z: seal.y };
}

/** World space back to seal space. The axis swap is its own inverse. */
export function worldToSeal(world: Vec3): Vec3 {
	return { x: world.x, y: world.z, z: world.y };
}
