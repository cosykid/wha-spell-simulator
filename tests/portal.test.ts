import assert from 'node:assert/strict';
import test from 'node:test';

import {
	GROUND_FORESHORTENING,
	HEIGHT_FORESHORTENING,
	PORTAL,
	activePortalPlane,
	portalCssVariables,
	portalScaledRing,
	projectSeal,
	projectSealDirection,
	projectWorld,
	sealToWorld,
	worldToSeal
} from '../src/lib/portal/portal.js';
import type { RingInfo } from '../src/lib/types.js';

// The portal only reads the backing store size off the canvas.
const canvas = { width: 1000, height: 1000 } as unknown as HTMLCanvasElement;

function assertClose(actual: number, expected: number, epsilon = 1e-9): void {
	assert.ok(
		Math.abs(actual - expected) < epsilon,
		`expected ${actual} to be within ${epsilon} of ${expected}`
	);
}

function centeredRing(radius = 300): RingInfo {
	return { found: true, center: { x: 500, y: 500 }, radius } as unknown as RingInfo;
}

function portalOf(ring: RingInfo = centeredRing(), portalFit = 1) {
	return activePortalPlane(canvas, portalScaledRing(ring, canvas, portalFit), portalFit);
}

test('ground and height foreshortening come from one elevation', () => {
	// The ellipse the CSS draws fixes the camera: sin(elevation) squashes the
	// ground, cos(elevation) lifts a height off it.
	const elevation = Math.asin(PORTAL.scaleY);
	assert.equal(GROUND_FORESHORTENING, PORTAL.scaleY);
	assertClose(HEIGHT_FORESHORTENING, Math.cos(elevation));
	assertClose(HEIGHT_FORESHORTENING, 0.898, 0.001);
});

test('the ring center is the seal origin', () => {
	const portal = portalOf();
	const origin = projectSeal(portal, { x: 0, y: 0, z: 0 });

	assertClose(origin.x, portal.center.x);
	assertClose(origin.y, portal.center.y);
	assertClose(origin.depth, 0);
});

test('one seal unit spans the ring radius across and the squashed radius into the page', () => {
	const portal = portalOf();
	const across = projectSeal(portal, { x: 1, y: 0, z: 0 });
	const along = projectSeal(portal, { x: 0, y: 1, z: 0 });

	assertClose(across.x - portal.center.x, portal.radiusX);
	assertClose(along.y - portal.center.y, portal.radiusY);
	assertClose(portal.radiusY / portal.radiusX, PORTAL.scaleY);
});

test('height rises by cos(elevation), not by the full radius', () => {
	const portal = portalOf();
	const lifted = projectSeal(portal, { x: 0, y: 0, z: 1 });

	assertClose(portal.center.y - lifted.y, portal.radiusX * HEIGHT_FORESHORTENING);
});

test('depth grows away from the viewer and orders parcels for painting', () => {
	const portal = portalOf();
	const near = projectSeal(portal, { x: 0, y: 1, z: 0 });
	const far = projectSeal(portal, { x: 0, y: -1, z: 0 });
	const raised = projectSeal(portal, { x: 0, y: 0, z: 1 });

	// Screen-down on the tilted paper is toward the viewer, so it is the nearest.
	assert.ok(far.depth > near.depth);
	assert.ok(near.depth < 0);
	// Height leans toward the viewer too, by the complementary factor.
	assertClose(raised.depth, -PORTAL.scaleY);
});

test('a direction on the paper is projected onto the same plane', () => {
	const forward = projectSealDirection({ x: 0, y: -1, z: 0 });
	const outOfPaper = projectSealDirection({ x: 0, y: 0, z: 1 });
	const sideways = projectSealDirection({ x: 1, y: 0, z: 0 });

	// Both the away-along-the-paper and out-of-the-paper directions read as "up
	// the screen", which is why the effect needs the depth scalar to tell them
	// apart, and both stay unit length.
	assertClose(forward.y, -1);
	assertClose(outOfPaper.y, -1);
	assertClose(Math.hypot(sideways.x, sideways.y), 1);
});

test('seal space maps to world space with +Y up (R-03)', () => {
	const seal = { x: 0.25, y: 0.5, z: 0.75 };
	const world = sealToWorld(seal);

	assert.deepEqual(world, { x: 0.25, y: 0.75, z: 0.5 });
	assert.deepEqual(worldToSeal(world), seal);

	// One camera: a world point lands where its seal twin does.
	const portal = portalOf();
	assert.deepEqual(projectWorld(portal, world), projectSeal(portal, seal));
});

test('portalFit keeps the pivot and the lift on screen', () => {
	const ring = centeredRing();
	const full = portalOf(ring, 1);
	const half = portalOf(ring, 0.5);

	// A canvas taller than the viewport pivots and lifts less, so the tilt stays
	// inside the visible area instead of sliding below it.
	assert.ok(half.center.y < full.center.y);
	assert.equal(half.radiusX, full.radiusX);
});

test('the CSS variables carry the same numbers the projection uses', () => {
	const variables = portalCssVariables();

	assert.match(variables, new RegExp(`--portal-shrink: ${PORTAL.shrink}(;|$)`));
	assert.match(variables, new RegExp(`--portal-tilt: ${PORTAL.tiltDeg}deg(;|$)`));
	assert.match(variables, new RegExp(`--portal-lift: ${PORTAL.liftPct}%(;|$)`));
	assert.match(variables, new RegExp(`--portal-origin-shift: ${PORTAL.originShiftPct}%(;|$)`));
	// The charge beat and the CSS tilt animation are the same 980ms (R-01).
	assert.match(variables, new RegExp(`--portal-tilt-duration: ${PORTAL.tiltMs}ms(;|$)`));
});
