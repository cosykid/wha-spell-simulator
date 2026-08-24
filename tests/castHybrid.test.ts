/**
 * The hybrid substrate's pure core: the flow field both populations ride, the
 * pigment ramp both of them read, the pool they share, and the brush population
 * the CPU half owns.
 *
 * These are the laws `docs/animation-hybrid.md` states. The GPU half is not
 * testable here and does not need to be: it is a transcription of the same
 * arithmetic, and the look tier owns its pixels.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SPAWN,
	blankShape,
	boundaryRadius,
	flowAccel,
	massDensity,
	silhouetteRadius,
	type FlowSample
} from '../src/lib/cast/hybrid/flow.js';
import { MASS_CEILING, pigment, rampTexels, RAMP_TEXELS } from '../src/lib/cast/hybrid/palette.js';
import { materialInk, pigmentsFor } from '../src/lib/cast/hybrid/pigments.js';
import { allocatePool, rowChannelMap } from '../src/lib/cast/hybrid/pool.js';
import {
	MAX_CHANNELS,
	PARAM_SLOT,
	packShape,
	newParamBuffer
} from '../src/lib/cast/hybrid/params.js';
import { MarkPool } from '../src/lib/cast/hybrid/markPool.js';
import { MARK, SIM_SIZE } from '../src/lib/cast/hybrid/tuning.js';
import { punchAt, sootAt, burnAt } from '../src/lib/cast/cells/arc.js';
import { lookRow } from '../src/lib/cast/looks/table.js';
import { scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { scoreFor } from './castHarness.js';
import type { CellFrame } from '../src/lib/cast/cells/cell.js';
import type { FlowShape } from '../src/lib/cast/hybrid/flow.js';

const sample: FlowSample = { x: 0, y: 0, z: 0, outward: 0 };

/** An upright column with a mouth and a reach, the shape every kind starts from. */
function column(overrides: Partial<FlowShape> = {}): FlowShape {
	return Object.assign(blankShape(), {
		footprint: 0.45,
		reach: 1.6,
		speed: 2.4,
		buoyancy: 3.6,
		converge: 0.6,
		emission: 0.8,
		...overrides
	});
}

function frame(beat: CellFrame['beat'], beatT: number): CellFrame {
	return { tMs: 0, beat, beatT, emission: 0, drive: 0, dtMs: 1000 / 120 };
}

test('the field is a pure function of its shape and its point', () => {
	const shape = column();
	flowAccel(sample, shape, 0.3, 0.1, 0.8, 1.4, 0.4);
	const first = { x: sample.x, y: sample.y, z: sample.z };
	flowAccel(sample, shape, 0.3, 0.1, 0.8, 1.4, 0.4);
	assert.deepEqual({ x: sample.x, y: sample.y, z: sample.z }, first);
});

test('drive runs along the shape own axis, wherever that axis points', () => {
	const upright = column();
	flowAccel(sample, upright, 0, 0, 0.2, 0, 0);
	assert.ok(sample.z > 1, 'an upright column should lift');

	const leaning = column({ axisX: 1, axisY: 0, axisZ: 0, converge: 0 });
	flowAccel(sample, leaning, 0.2, 0, 0, 0, 0);
	assert.ok(sample.x > 1, 'a lateral column should push along x');
});

test('the pinch pulls a point outside the boundary back toward the axis', () => {
	const shape = column({ turbulence: 0, buoyancy: 0 });
	const edge = boundaryRadius(shape, 0, 0.5, 0);
	flowAccel(sample, shape, edge * 3, 0, 0.5, 0, 0.5);
	assert.ok(sample.x < -1, 'a point well outside the boundary should be drawn in');
	assert.ok(sample.outward < 0, 'and the tear score should read that as no tearing');
});

test('the boundary is lobed and wandering, so no frame reads as a cone', () => {
	const shape = column();
	const radii = Array.from({ length: 24 }, (_, i) =>
		boundaryRadius(shape, (i / 24) * Math.PI * 2, 0.6, 1.2)
	);
	const spread = Math.max(...radii) / Math.min(...radii);
	assert.ok(spread > 1.4, `the boundary is too round: widest/narrowest was ${spread.toFixed(2)}`);
	// And it shears with height, so the shoulders are not a fixed silhouette.
	const low = boundaryRadius(shape, 1, 0.2, 1.2);
	const high = boundaryRadius(shape, 1, 1.4, 1.2);
	assert.notEqual(low.toFixed(4), high.toFixed(4));
});

test('the drawn edge stands outside the surface the field aims at', () => {
	const shape = column();
	assert.ok(silhouetteRadius(shape, 0.4, 0.8, 0) > boundaryRadius(shape, 0.4, 0.8, 0));
});

test('the anti-confetti law: coverage falls away outside the mass and with emission', () => {
	const shape = column();
	const inside = massDensity(shape, 0.1, 0, 0.6, 0);
	const outside = massDensity(shape, 3, 0, 0.6, 0);
	assert.ok(inside > 0.5, 'the middle of a column should be covered');
	assert.equal(outside, 0, 'nothing covers a point three radii out');
	// A channel that has stopped emitting licenses nothing.
	const spent = massDensity(column({ emission: 0 }), 0.1, 0, 0.6, 0);
	assert.ok(spent < inside * 0.2, 'a spent channel still licenses marks');
});

test('the sink is a ring attractor, so nothing piles into the seal origin', () => {
	const shape = column({ buoyancy: 0, converge: 0, turbulence: 0, sink: 1, pool: 0.6 });
	flowAccel(sample, shape, 1.5, 0, 0.1, 0, 0.5);
	assert.ok(sample.x < 0, 'matter outside the pool should be drawn in');
	flowAccel(sample, shape, 0.15, 0, 0.1, 0, 0.5);
	assert.ok(sample.x > 0, 'and matter inside it pushed gently back out');
});

test('a negative sink is the same term reversed, not a second code path', () => {
	const inward = column({ buoyancy: 0, converge: 0, turbulence: 0, sink: 1, pool: 0.6 });
	const outward = column({ buoyancy: 0, converge: 0, turbulence: 0, sink: -1, pool: 0.6 });
	flowAccel(sample, inward, 1.5, 0, 0.1, 0, 0.5);
	const pulled = sample.x;
	flowAccel(sample, outward, 1.5, 0, 0.1, 0, 0.5);
	assert.ok(Math.abs(pulled + sample.x) < 1e-9, 'the push is not the pull mirrored');
});

test('containment draws mass back onto a hold locus and leaves the inside alone', () => {
	const shape = column({
		buoyancy: 0,
		converge: 0,
		turbulence: 0,
		originZ: 0.8,
		gather: 2,
		holdRadius: 0.3
	});
	flowAccel(sample, shape, 1.2, 0, 0.8, 0, 0.5);
	assert.ok(sample.x < -1, 'a parcel outside the shell should be gathered');
	flowAccel(sample, shape, 0.1, 0, 0.8, 0, 0.5);
	assert.ok(Math.abs(sample.x) < 1e-9, 'and one inside it left alone');
});

test('the pigment ramp runs cold to hot and the GPU reads the same fold', () => {
	const palette = pigmentsFor(
		{ sigil: 'fire', element: 'fire' },
		lookRow({ sigil: 'fire', element: 'fire' })
	);
	const cold = { r: 0, g: 0, b: 0 };
	const hot = { r: 0, g: 0, b: 0 };
	pigment(palette.stops, 0, cold);
	pigment(palette.stops, 1, hot);
	assert.ok(hot.r + hot.g + hot.b > cold.r + cold.g + cold.b, 'the ramp does not warm');
	assert.ok(MASS_CEILING < 1, 'the mass may reach the white band');

	const texels = rampTexels(palette.stops);
	assert.equal(texels.length, RAMP_TEXELS * 4);
	const middle = { r: 0, g: 0, b: 0 };
	pigment(palette.stops, (63 + 0.5) / RAMP_TEXELS, middle);
	// Float32 texels, so the agreement is to the texture's own precision.
	assert.ok(Math.abs(texels[63 * 4] - middle.r) < 1e-6, 'the baked ramp differs from the fold');
});

test('every look row derives a distinct palette, and fire keeps its authored one', () => {
	const rows = ['fire', 'water', 'wind', 'earth', 'light', 'crystal', 'aeroform'];
	const seen = new Set<string>();
	for (const sigil of rows) {
		const row = lookRow({ sigil, element: null });
		const palette = pigmentsFor({ sigil, element: null }, row);
		assert.equal(palette.stops.length, 9, sigil);
		const tint = { r: 0, g: 0, b: 0 };
		pigment(palette.stops, 0.67, tint);
		seen.add([tint.r, tint.g, tint.b].map((c) => c.toFixed(3)).join(','));
		// The manga's black is off the heat axis and darker than anything on it.
		const cold = { r: 0, g: 0, b: 0 };
		pigment(palette.stops, 0, cold);
		assert.ok(palette.ink[0] + palette.ink[1] + palette.ink[2] < cold.r + cold.g + cold.b, sigil);
	}
	assert.equal(seen.size, rows.length, 'two rows paint the same body colour');
	// Fire's stop list is the hand-authored reference the prototype was approved on.
	const fire = pigmentsFor(
		{ sigil: 'fire', element: null },
		lookRow({ sigil: 'fire', element: null })
	);
	assert.deepEqual(fire.stops[8].rgb, [1, 0.941, 0.804]);
});

test('a material profile only ever multiplies a dial, never invents one', () => {
	for (const sigil of ['fire', 'water', 'earth', 'crystal', 'inert']) {
		const ink = materialInk(lookRow({ sigil, element: null }));
		for (const [name, value] of Object.entries(ink)) {
			assert.ok(Number.isFinite(value) && value > 0, `${sigil}.${name} is ${value}`);
		}
		assert.ok(ink.ceiling <= MASS_CEILING, `${sigil} may burn past the mass ceiling`);
	}
});

test('the pool is divided once, covers every row, and starves nothing', () => {
	const built = scoreFor('column-levitation', 'fire', {
		signature: 'test-hybrid',
		duration: 4
	});
	const tracks = scoreTracks(built);
	const slices = allocatePool(tracks);
	assert.equal(slices.length, tracks.length);
	assert.equal(
		slices.reduce((sum, slice) => sum + slice.rowCount, 0),
		SIM_SIZE,
		'the pool is not fully handed out'
	);
	for (const slice of slices) {
		assert.ok(slice.rowCount > 0, 'a channel was starved out');
		assert.ok(slice.marks >= 40, 'a channel got no brush at all');
	}
	assert.ok(
		slices.reduce((sum, slice) => sum + slice.marks, 0) <= MARK.pool * 1.5,
		'the brush budget is not shared'
	);

	const map = rowChannelMap(slices);
	assert.equal(map.length, SIM_SIZE);
	const owners = new Set(Array.from(map));
	assert.equal(owners.size, slices.length, 'a channel owns no rows of its own');
});

test('a shape packs into its own row of the params texture and nowhere else', () => {
	const data = newParamBuffer();
	const shape = column({ originX: 0.25, footprint: 0.4, spawn: SPAWN.swirl, siteCount: 2 });
	packShape(data, 3, shape);
	const row = 3 * (data.length / MAX_CHANNELS);
	// Float32 texels, so a packed dial agrees to the texture's own precision.
	const packed = (slot: number, lane: number) => data[row + slot * 4 + lane];
	assert.ok(Math.abs(packed(PARAM_SLOT.origin, 0) - 0.25) < 1e-6);
	assert.ok(Math.abs(packed(PARAM_SLOT.origin, 3) - 0.4) < 1e-6);
	assert.equal(packed(PARAM_SLOT.life, 2), SPAWN.swirl);
	assert.equal(packed(PARAM_SLOT.life, 3), 2);
	// Nothing outside its own row moved.
	assert.ok(data.slice(0, row).every((value) => value === 0));
});

test('the brush population is deterministic and lays marks only where mass is', () => {
	const palette = pigmentsFor(
		{ sigil: 'fire', element: null },
		lookRow({ sigil: 'fire', element: null })
	);
	const arc = {
		drive: 1,
		punch: 0,
		soot: 0,
		alpha: 1,
		size: 1,
		ceiling: MASS_CEILING,
		life: 1,
		rate: 400,
		inkShare: 0.1,
		crownShare: 1,
		tongueShare: 0.22
	};
	const run = () => {
		const pool = new MarkPool(120, 0x51a1e, palette);
		const shape = column();
		for (let step = 1; step <= 60; step += 1) {
			pool.step(shape, arc, (step * 1000) / 120, 1 / 120);
		}
		const out = { laid: [], added: [] };
		pool.collect(out, shape, arc, 500);
		return { live: pool.live, born: pool.born, quads: out.laid.length + out.added.length };
	};
	const first = run();
	assert.deepEqual(run(), first, 'the same seed laid a different hand');
	assert.ok(first.born > 0, 'nothing was laid at all');
	assert.ok(first.quads > 0, 'nothing survived the coverage gate');

	// A channel with no mass under it licenses no mark, whatever its rate says.
	// Smoke is the one exception and it is deliberate — it carries on above the
	// body, because that is where smoke goes — so the gate is read on an archetype
	// that leaves none.
	const smokeless = { ...arc, crownShare: 0 };
	const bare = new MarkPool(120, 0x51a1e, palette);
	const empty = column({ emission: 0 });
	for (let step = 1; step <= 60; step += 1) {
		bare.step(empty, smokeless, (step * 1000) / 120, 1 / 120);
	}
	const out = { laid: [], added: [] };
	bare.collect(out, empty, smokeless, 500);
	assert.equal(out.laid.length + out.added.length, 0, 'a spent channel still painted');
});

test('the arc reads the beats and holds no state of its own', () => {
	assert.equal(punchAt(frame('charge', 0.9)), 0);
	assert.equal(punchAt(frame('body', 0.1)), 0);
	assert.ok(punchAt(frame('strike', 0.1)) > 0.5, 'the strike should land hard and early');
	assert.ok(punchAt(frame('strike', 0.7)) < 0.1, 'and be over well inside its own beat');

	assert.equal(sootAt(frame('strike', 0.5)), 0);
	assert.ok(sootAt(frame('afterglow', 1)) > sootAt(frame('body', 1)), 'smoke is the last beat');
	assert.equal(burnAt(frame('body', 0.5)), 1);
	assert.ok(burnAt(frame('release', 1)) > 1, 'the release should burn what is left through');
});
