/**
 * The skin's fast paths against what they replaced. The look baselines were
 * recorded through three's `MarchingCubes` and a 27-cell cohesion walk, so
 * the replacements have to find the same company, build the same field and
 * emit the same triangles in the same order, bit for bit, while touching only
 * what a paint reached.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

import { Cohesion } from '../src/lib/cast/volume/cohesion.js';
import { MarchingField } from '../src/lib/cast/volume/marchingField.js';
import { Polygonizer } from '../src/lib/cast/volume/polygonize.js';
import { depositSheet } from '../src/lib/cast/volume/sheetDeposit.js';
import { SPAN, VOLUME } from '../src/lib/cast/volume/tuning.js';
import { mulberry32 } from '../src/lib/cast/rng.js';

const RES = VOLUME.res;
const ISOLATION = VOLUME.isolation;

interface Ball {
	x: number;
	y: number;
	z: number;
	strength: number;
}

/**
 * Deposits shaped like a cast's: a dense column of smeared pairs at the
 * skin's working strengths, plus strays near the walls where the kernels clamp.
 */
function castLikeBalls(seed: number, count = 600): Ball[] {
	const rng = mulberry32(seed);
	const balls: Ball[] = [];
	for (let i = 0; i < count; i += 1) {
		const stray = i % 50 === 0;
		const x = stray ? rng() : 0.5 + (rng() - 0.5) * 0.3;
		const y = stray ? rng() : 0.5 + (rng() - 0.5) * 0.3;
		const z = stray ? rng() : 0.05 + rng() * 0.5;
		const strength = VOLUME.strength * 0.6 * (0.6 + rng()) * (VOLUME.cutoff + rng() * 0.8);
		balls.push({ x, y, z, strength });
	}
	return balls;
}

function referenceMesh(): MarchingCubes {
	return new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 120000);
}

/** The whole-grid smoothing the skin ran before its passes were bounded. */
function smoothWholeGrid(field: Float32Array, intensity: number): void {
	const n = RES;
	const n2 = n * n;
	const c = field.slice();
	for (let z = 1; z < n - 1; z += 1) {
		for (let y = 1; y < n - 1; y += 1) {
			let i = n2 * z + n * y + 1;
			for (let x = 1; x < n - 1; x += 1, i += 1) {
				const nb = c[i - 1] + c[i + 1] + c[i - n] + c[i + n] + c[i - n2] + c[i + n2];
				field[i] = c[i] + intensity * (nb / 6 - c[i]);
			}
		}
	}
}

function assertSameFloats(actual: Float32Array, expected: Float32Array, what: string): void {
	assert.equal(actual.length, expected.length, `${what}: length`);
	for (let i = 0; i < expected.length; i += 1) {
		if (!Object.is(actual[i], expected[i])) {
			assert.fail(`${what}: index ${i} is ${actual[i]}, three wrote ${expected[i]}`);
		}
	}
}

test('a ball lands in the field exactly where three puts it', () => {
	const field = new MarchingField(RES);
	const mesh = referenceMesh();
	mesh.reset();
	for (const ball of castLikeBalls(7)) {
		field.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
		mesh.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
	}
	assertSameFloats(field.values, mesh.field, 'field');
});

test('bounded smoothing writes what a whole-grid pass writes', () => {
	const field = new MarchingField(RES);
	for (const ball of castLikeBalls(11)) {
		field.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
	}
	const expected = field.values.slice();
	for (const intensity of [0.5, 0.35]) {
		field.smooth(intensity);
		smoothWholeGrid(expected, intensity);
	}
	assertSameFloats(field.values, expected, 'smoothed field');
});

test("the polygonizer emits three's triangles, in three's order", () => {
	for (const [seed, passes] of [
		[3, 0],
		[5, 2]
	] as const) {
		const field = new MarchingField(RES);
		for (const ball of castLikeBalls(seed)) {
			field.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
		}
		for (let k = 0; k < passes; k += 1) field.smooth(0.5);
		const polygonizer = new Polygonizer(RES, 120000);
		const vertices = polygonizer.run(field, ISOLATION);

		const mesh = referenceMesh();
		mesh.reset();
		(mesh.field as Float32Array).set(field.values);
		mesh.isolation = ISOLATION;
		mesh.update();

		assert.ok(vertices > 1000, `seed ${seed} should skin a real surface, got ${vertices}`);
		assert.equal(vertices, mesh.count, `seed ${seed}: vertex count`);
		const used = vertices * 3;
		assertSameFloats(
			polygonizer.positions.subarray(0, used),
			mesh.positionArray.subarray(0, used),
			`seed ${seed} positions`
		);
		assertSameFloats(
			polygonizer.normals.subarray(0, used),
			mesh.normalArray.subarray(0, used),
			`seed ${seed} normals`
		);
	}
});

test('a wiped field skins the next paint as if it were fresh', () => {
	const reused = new MarchingField(RES);
	for (const ball of castLikeBalls(13)) {
		reused.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
	}
	reused.smooth(0.5);
	reused.wipe();
	assert.ok(reused.empty);
	assert.ok(reused.values.every((value) => value === 0));

	const fresh = new MarchingField(RES);
	const reusedPolygonizer = new Polygonizer(RES, 120000);
	const freshPolygonizer = new Polygonizer(RES, 120000);
	reusedPolygonizer.run(reused, ISOLATION);
	for (const field of [reused, fresh]) {
		for (const ball of castLikeBalls(17)) {
			field.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
		}
	}
	const vertices = reusedPolygonizer.run(reused, ISOLATION);
	assert.equal(vertices, freshPolygonizer.run(fresh, ISOLATION));
	assertSameFloats(
		reusedPolygonizer.normals.subarray(0, vertices * 3),
		freshPolygonizer.normals.subarray(0, vertices * 3),
		'normals after reuse'
	);
});

test("the weave's sheet deposit stays inside the box it reports", () => {
	const field = new MarchingField(RES);
	field.addSheet(0.5, 0.5, 0.3, 0, 0, 1, 0.04, VOLUME.subtract);
	const reference = new Float32Array(RES ** 3);
	depositSheet(reference, RES, 0.5, 0.5, 0.3, 0, 0, 1, 0.04, VOLUME.subtract);
	assertSameFloats(field.values, reference, 'sheet');
	const { box } = field;
	for (let i = 0; i < reference.length; i += 1) {
		if (reference[i] === 0) continue;
		const x = i % RES;
		const y = Math.floor(i / RES) % RES;
		const z = Math.floor(i / (RES * RES));
		assert.ok(
			x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 && z >= box.z0 && z <= box.z1
		);
	}
});

test('a paint that outgrows the buffer stops at it rather than past it', () => {
	const field = new MarchingField(RES);
	for (const ball of castLikeBalls(19)) {
		field.addBall(ball.x, ball.y, ball.z, ball.strength, VOLUME.subtract);
	}
	const polygonizer = new Polygonizer(RES, 100);
	const vertices = polygonizer.run(field, ISOLATION);
	assert.ok(vertices <= 300 && vertices > 0);
	assert.equal(vertices % 3, 0);
});

/** The 27-cell linked-list walk the skin ran before, kept as the oracle. */
function referenceCompany(cand: Float32Array, count: number) {
	const rN = VOLUME.cohesionR / SPAN;
	const gn = Math.min(40, Math.max(1, Math.floor(1 / rN)));
	const head = new Int32Array(gn ** 3).fill(-1);
	const next = new Int32Array(count);
	const cell = (v: number) => Math.min(gn - 1, (v * gn) | 0);
	for (let j = 0; j < count; j += 1) {
		const c = (cell(cand[j * 3 + 2]) * gn + cell(cand[j * 3 + 1])) * gn + cell(cand[j * 3]);
		next[j] = head[c];
		head[c] = j;
	}
	const company = new Int32Array(count);
	const sum = new Float64Array(count * 3);
	for (let j = 0; j < count; j += 1) {
		const [x, y, z] = [cand[j * 3], cand[j * 3 + 1], cand[j * 3 + 2]];
		const [cx, cy, cz] = [cell(x), cell(y), cell(z)];
		let [k, mx, my, mz] = [0, 0, 0, 0];
		for (let zc = cz - 1; zc <= cz + 1; zc += 1) {
			for (let yc = cy - 1; yc <= cy + 1; yc += 1) {
				for (let xc = cx - 1; xc <= cx + 1; xc += 1) {
					if (xc < 0 || yc < 0 || zc < 0 || xc >= gn || yc >= gn || zc >= gn) continue;
					for (let o = head[(zc * gn + yc) * gn + xc]; o !== -1; o = next[o]) {
						const ex = cand[o * 3] - x;
						const ey = cand[o * 3 + 1] - y;
						const ez = cand[o * 3 + 2] - z;
						if (ex * ex + ey * ey + ez * ez > rN * rN) continue;
						k += 1;
						mx += cand[o * 3];
						my += cand[o * 3 + 1];
						mz += cand[o * 3 + 2];
					}
				}
			}
		}
		company[j] = k;
		sum.set([mx, my, mz], j * 3);
	}
	return { company, sum };
}

test('cohesion finds the company the 27-cell walk found, to the last bit', () => {
	const rng = mulberry32(23);
	const cases: Array<[string, (i: number) => [number, number, number]]> = [
		['a column', () => [0.5 + (rng() - 0.5) * 0.3, 0.5 + (rng() - 0.5) * 0.3, rng() * 0.6]],
		// A held ball: nearly every deposit inside every other's radius.
		[
			'a held ball',
			() => [0.5 + (rng() - 0.5) * 0.08, 0.48 + (rng() - 0.5) * 0.08, 0.3 + (rng() - 0.5) * 0.08]
		],
		['strays to the walls', () => [rng(), rng(), rng()]]
	];
	for (const [name, place] of cases) {
		const count = 1600;
		const cand = new Float32Array(count * 3);
		for (let i = 0; i < count; i += 1) cand.set(place(i), i * 3);
		const cohesion = new Cohesion(count, VOLUME.cohesionR / SPAN);
		cohesion.gather(cand, count);
		const reference = referenceCompany(cand, count);
		assert.deepEqual(cohesion.company.subarray(0, count), reference.company, `${name}: company`);
		for (let i = 0; i < count * 3; i += 1) {
			if (!Object.is(cohesion.sum[i], reference.sum[i])) {
				assert.fail(`${name}: sum ${i} is ${cohesion.sum[i]}, the walk found ${reference.sum[i]}`);
			}
		}
	}
});

/** The sheet kernel before its rows were trimmed, kept as the oracle. */
function referenceSheet(
	field: Float32Array,
	x: number,
	y: number,
	z: number,
	n: [number, number, number],
	strength: number
): void {
	const size = RES;
	const radius = size * Math.sqrt(strength / VOLUME.subtract);
	const lo = (v: number) => Math.max(1, Math.floor(v * size - radius));
	const hi = (v: number) => Math.min(size - 1, Math.ceil(v * size + radius));
	for (let iz = lo(z); iz < hi(z); iz++) {
		const dz = iz / size - z;
		for (let iy = lo(y); iy < hi(y); iy++) {
			const dy = iy / size - y;
			for (let ix = lo(x); ix < hi(x); ix++) {
				const dx = ix / size - x;
				const normal = dx * n[0] + dy * n[1] + dz * n[2];
				const distance = dx * dx + dy * dy + dz * dz + 31 * normal * normal;
				const value = strength / (0.000001 + distance) - VOLUME.subtract;
				if (value > 0) field[(iz * size + iy) * size + ix] += value;
			}
		}
	}
}

test('trimmed ball and sheet rows write every cell the whole box wrote', () => {
	const rng = mulberry32(29);
	const sheets = new Float32Array(RES ** 3);
	const reference = new Float32Array(RES ** 3);
	for (let i = 0; i < 300; i += 1) {
		const theta = rng() * Math.PI * 2;
		const phi = Math.acos(rng() * 2 - 1);
		const n: [number, number, number] = [
			Math.sin(phi) * Math.cos(theta),
			Math.sin(phi) * Math.sin(theta),
			Math.cos(phi)
		];
		const at = [0.2 + rng() * 0.6, 0.2 + rng() * 0.6, rng() * 0.7] as const;
		const strength = VOLUME.strength * 1.2 * (0.4 + rng());
		depositSheet(sheets, RES, at[0], at[1], at[2], n[0], n[1], n[2], strength, VOLUME.subtract);
		referenceSheet(reference, at[0], at[1], at[2], n, strength);
	}
	assertSameFloats(sheets, reference, 'sheets');
	// The ball's trim is pinned against three by the first test. The
	// axis-aligned sheet is the degenerate quadratic, so it is pinned on its own.
	const flat = new Float32Array(RES ** 3);
	const flatReference = new Float32Array(RES ** 3);
	depositSheet(flat, RES, 0.5, 0.5, 0.5, 0, 0, 1, 0.04, VOLUME.subtract);
	referenceSheet(flatReference, 0.5, 0.5, 0.5, [0, 0, 1], 0.04);
	assertSameFloats(flat, flatReference, 'flat sheet');
});
