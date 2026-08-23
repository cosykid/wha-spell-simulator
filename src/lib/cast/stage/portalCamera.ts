/**
 * @file The one owner of camera numbers, the way `portal/portal.ts` is the one
 * owner of portal numbers. Nothing else under `stage/` may position a camera,
 * set a frustum, or convert a seal unit to a pixel.
 *
 * The paper stays CSS-tilted DOM and only the effect canvas is WebGL, so the
 * whole job here is one identity: **a seal-space point must land on the same
 * canvas pixel the camera puts it on as `projectSeal` puts it on.** Everything
 * else the app draws on that paper (the glyph overlay, the seal guides, the
 * portal ellipse itself) is placed by `projectSeal`, so the camera reproduces it
 * rather than out-perspectiving it. `tests/portalCamera.test.ts` pins the
 * agreement in pixels.
 *
 * The camera follows from the portal's own identity: a ground circle squashes to
 * `scaleY`, so the viewer's elevation is `asin(scaleY)`, and the pitch, the
 * frustum shift and the scale all fall out of that one angle.
 *
 * @example
 * const camera = createPortalCamera();
 * const portal = aimPortalCamera(camera, { canvas, ring, portalFit });
 */

import * as THREE from 'three';
import { activePortalPlane, portalScaledRing, type Portal } from '../../portal/portal.js';
import { clamp } from '../../utils/geometry.js';
import type { RingInfo } from '../../types.js';

export const PORTAL_CAMERA = {
	/**
	 * How far the camera stands from the ring center, in seal units.
	 *
	 * `projectSeal` is orthographic: it scales x by `radiusX` and y by `radiusY`
	 * with no divide, and `PORTAL.scaleY` was fitted to the drawn ellipse under
	 * that assumption. A perspective camera at the CSS `perspective()` distance
	 * (about three seal units) would divide, and the far rim of the seal would
	 * slide tens of pixels off the ring the paper actually draws. So the frustum
	 * is a long lens: far enough that the residual divide is under a hundredth of
	 * a pixel across the scene, close enough that view-space z stays exact in the
	 * float32 the shaders get. This is the one dial that trades the identity for
	 * foreshortening, and until the portal's own fit becomes projective it stays
	 * pinned here.
	 */
	viewDistanceUnits: 20000,
	/** Seal units of scene the frustum has to hold, measured from the ring center. */
	sceneRadiusUnits: 8
} as const;

/** What the camera is aimed from, and what the painter read for the same job. */
export interface PortalCameraInput {
	/** Only the backing store size is read, in the pixels `projectSeal` returns. */
	canvas: HTMLCanvasElement;
	ring: RingInfo;
	/** Fraction of canvas height on screen. Defaults to 1, as the portal does. */
	portalFit?: number;
}

/** An unaimed camera. {@link aimPortalCamera} gives it every number it has. */
export function createPortalCamera(): THREE.PerspectiveCamera {
	const camera = new THREE.PerspectiveCamera();
	camera.name = 'portal-camera';
	return camera;
}

/**
 * The viewer's elevation above the seal plane, in radians. The portal states the
 * identity and this reads it back off the ellipse: a ground circle squashes to
 * `sin(elevation)`, so `scaleY` is that sine.
 */
export function portalElevation(portal: Portal): number {
	return Math.asin(clamp(portal.scaleY));
}

/**
 * Aims `camera` at the portal this ring makes on this canvas, and returns that
 * portal so a caller does not project it a second time.
 *
 * Three numbers, all from the elevation. The camera stands at that angle above
 * the seal plane on the viewer's side, which is what makes the seal an ellipse
 * of the right squash. The frustum is sheared so the camera axis lands on the
 * portal center rather than the canvas center, which is what puts an off-center
 * ring where the CSS puts it. And the field of view is chosen so one seal unit
 * at the ring's own distance measures exactly `radiusX` pixels.
 */
export function aimPortalCamera(camera: THREE.PerspectiveCamera, input: PortalCameraInput): Portal {
	const { canvas, ring } = input;
	const portalFit = input.portalFit ?? 1;
	const portal = activePortalPlane(canvas, portalScaledRing(ring, canvas, portalFit), portalFit);

	const width = Math.max(1, canvas.width);
	const height = Math.max(1, canvas.height);
	const pixelsPerUnit = Math.max(portal.radiusX, 1e-6);
	const distance = PORTAL_CAMERA.viewDistanceUnits;
	const elevation = portalElevation(portal);
	const sin = Math.sin(elevation);
	const cos = Math.cos(elevation);

	// Seal (0, cos, sin) scaled by distance, in world axes: the viewer sits on the
	// near side of the paper (seal +y) and above it (seal +z).
	camera.position.set(0, distance * sin, distance * cos);
	camera.up.set(0, cos, -sin);
	camera.lookAt(0, 0, 0);

	camera.aspect = width / height;
	camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * distance * pixelsPerUnit)));
	camera.near = distance - PORTAL_CAMERA.sceneRadiusUnits;
	camera.far = distance + PORTAL_CAMERA.sceneRadiusUnits;
	// A symmetric frustum would put the camera axis on the canvas center. The
	// portal center is wherever the ring was drawn, so the frustum is sheared
	// until the axis lands there. The offset runs against the shift because it
	// names the corner of the full image the viewport is cut from, not where the
	// image goes.
	camera.setViewOffset(
		width,
		height,
		width / 2 - portal.center.x,
		height / 2 - portal.center.y,
		width,
		height
	);
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld(true);
	return portal;
}
