/**
 * @file Orthographic camera that projects the sim's world frame (seal plane =
 * xz, up = +y, seal units) onto the on-screen portal ellipse the CSS tilt
 * produces. Matching the 2D effects' portal math keeps both effect layers
 * anchored to the same ring.
 */
import * as THREE from 'three';
import type { Portal } from '../../renderer/effects/effectUtils.js';

/**
 * The portal ellipse squashes a ground circle to `scaleY` of its width; an
 * orthographic camera reproduces that exactly when its elevation angle is
 * asin(scaleY) — ground depth foreshortens by sin(e), height by cos(e).
 */
const CAMERA_DISTANCE = 14; // beyond KILL_DIST so nothing pops at the frustum

export function createPortalCamera(): THREE.OrthographicCamera {
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 3);
	return camera;
}

/**
 * Re-aims the camera so seal-space geometry lands on the portal: world origin
 * projects to the portal center pixel and one seal unit spans radiusX pixels.
 * The frustum is asymmetric — offsetting it is what pins the origin to an
 * arbitrary canvas point without moving the camera off its axis.
 */
export function updatePortalCamera(
	camera: THREE.OrthographicCamera,
	portal: Portal,
	canvasWidth: number,
	canvasHeight: number
): void {
	const elevation = Math.asin(Math.min(1, Math.max(0.05, portal.scaleY)));
	const pixelsPerUnit = Math.max(1, portal.radiusX);

	camera.position.set(
		0,
		CAMERA_DISTANCE * Math.sin(elevation),
		CAMERA_DISTANCE * Math.cos(elevation)
	);
	camera.up.set(0, 1, 0);
	camera.lookAt(0, 0, 0);

	camera.left = -portal.center.x / pixelsPerUnit;
	camera.right = (canvasWidth - portal.center.x) / pixelsPerUnit;
	camera.top = portal.center.y / pixelsPerUnit;
	camera.bottom = -(canvasHeight - portal.center.y) / pixelsPerUnit;
	camera.updateProjectionMatrix();
}
