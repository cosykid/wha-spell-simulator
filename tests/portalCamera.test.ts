/**
 * The portal identity: the cell stage's camera must put a seal-space point on
 * the same canvas pixel `portal/projectSeal` puts it on.
 *
 * The paper stays CSS-tilted DOM and only the effect canvas is WebGL, so this
 * agreement is the whole of what keeps the spell on the paper it was cast from.
 * Everything else drawn on that paper (the glyph overlay, the seal guides, the
 * portal ellipse) is placed by `projectSeal`, so the camera reproduces it rather
 * than out-perspectiving it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
	HEIGHT_FORESHORTENING,
	PORTAL,
	activePortalPlane,
	portalScaledRing,
	projectSeal
} from '../src/lib/portal/portal.js';
import {
	PORTAL_CAMERA,
	aimPortalCamera,
	createPortalCamera,
	portalElevation
} from '../src/lib/cast/stage/portalCamera.js';
import { createSealRoot } from '../src/lib/cast/stage/sealRoot.js';
import type { RingInfo, Vec3 } from '../src/lib/types.js';

/**
 * The residual the long-lens frustum leaves behind, in canvas pixels. It is the
 * perspective divide `projectSeal` does not do, and `PORTAL_CAMERA.viewDistanceUnits`
 * is what holds it here. The worst probe below, out at seal radius 4, measures
 * 0.019px; the bound is set a little above that so a canvas or ring bigger than
 * these cases still has room.
 */
const EPSILON_PX = 0.05;

/** The portal only reads the backing store size off the canvas. */
function canvasOf(width: number, height: number): HTMLCanvasElement {
	return { width, height } as unknown as HTMLCanvasElement;
}

function ringOf(x: number, y: number, radius: number): RingInfo {
	return { found: true, complete: true, center: { x, y }, radius } as unknown as RingInfo;
}

/** On-plane probes first, then elevated ones, then one out at the scene bound. */
const PROBES: Vec3[] = [
	{ x: 0, y: 0, z: 0 },
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0.7, y: -0.7, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 1.2, y: 0.4, z: 0.9 },
	{ x: -0.6, y: 0.9, z: 1.4 },
	{ x: 2.4, y: -2.2, z: 2.6 }
];

interface PortalCase {
	label: string;
	canvas: HTMLCanvasElement;
	ring: RingInfo;
	portalFit: number;
}

const CASES: PortalCase[] = [
	{
		label: 'lab canvas, centered ring',
		canvas: canvasOf(900, 700),
		ring: ringOf(450, 392, 210),
		portalFit: 1
	},
	{
		label: 'square canvas, off-center ring, measured fit',
		canvas: canvasOf(1024, 1024),
		ring: ringOf(600, 430, 300),
		portalFit: 0.72
	},
	{
		label: 'wide canvas, small ring near the corner',
		canvas: canvasOf(1600, 900),
		ring: ringOf(300, 700, 120),
		portalFit: 1
	}
];

const sealRoot = createSealRoot();

/** A seal-space point through the seal root and the camera, in canvas pixels. */
function screenPointFor(camera: THREE.Camera, canvas: HTMLCanvasElement, seal: Vec3) {
	const ndc = new THREE.Vector3(seal.x, seal.y, seal.z)
		.applyMatrix4(sealRoot.matrixWorld)
		.project(camera);
	return { x: ((ndc.x + 1) / 2) * canvas.width, y: ((1 - ndc.y) / 2) * canvas.height };
}

for (const testCase of CASES) {
	test(`portal camera reproduces projectSeal: ${testCase.label}`, () => {
		const camera = createPortalCamera();
		const portal = aimPortalCamera(camera, testCase);

		for (const seal of PROBES) {
			const expected = projectSeal(portal, seal);
			const actual = screenPointFor(camera, testCase.canvas, seal);
			assert.ok(
				Math.abs(actual.x - expected.x) < EPSILON_PX &&
					Math.abs(actual.y - expected.y) < EPSILON_PX,
				`seal ${JSON.stringify(seal)}: camera (${actual.x}, ${actual.y}) vs portal (${expected.x}, ${expected.y})`
			);
		}
	});
}

test('aiming returns the same portal the painter would have projected through', () => {
	const { canvas, ring, portalFit } = CASES[1];
	const camera = createPortalCamera();
	const aimed = aimPortalCamera(camera, CASES[1]);
	assert.deepEqual(
		aimed,
		activePortalPlane(canvas, portalScaledRing(ring, canvas, portalFit), portalFit)
	);
});

test('the camera pitch is the portal ellipse own elevation, asin(scaleY)', () => {
	const camera = createPortalCamera();
	const portal = aimPortalCamera(camera, CASES[0]);
	const elevation = portalElevation(portal);

	assert.equal(elevation, Math.asin(PORTAL.scaleY));
	// The portal derives ground distance from sin and height from cos of the same
	// angle, so the camera has to sit on that same pair or the two fall apart.
	assert.ok(Math.abs(Math.cos(elevation) - HEIGHT_FORESHORTENING) < 1e-12);
	assert.ok(
		Math.abs(camera.position.length() - PORTAL_CAMERA.viewDistanceUnits) < 1e-6,
		'the camera stands at the frustum distance from the ring center'
	);
	assert.ok(
		Math.abs(Math.asin(camera.position.y / camera.position.length()) - elevation) < 1e-12,
		'and at that elevation above the seal plane'
	);
});

test('the seal unit circle lands on the drawn portal ellipse', () => {
	const { canvas } = CASES[0];
	const camera = createPortalCamera();
	const portal = aimPortalCamera(camera, CASES[0]);

	const right = screenPointFor(camera, canvas, { x: 1, y: 0, z: 0 });
	const far = screenPointFor(camera, canvas, { x: 0, y: -1, z: 0 });
	assert.ok(Math.abs(right.x - portal.center.x - portal.radiusX) < EPSILON_PX);
	assert.ok(Math.abs(portal.center.y - far.y - portal.radiusY) < EPSILON_PX);
});
