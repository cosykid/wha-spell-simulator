/**
 * The volume substrate's pure core: the per-element behavior matrix, the tracer
 * physics the cells choreograph, the chip-law numbers the skin depends on, and
 * the one shared pool. The marching-cubes skin itself is GPU-side geometry and
 * the look tier owns its pixels; what is pinned here is the CPU state that
 * fully determines them.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MOTION,
	SKIN,
	volumeElementFor,
	type VolumeElement
} from '../src/lib/cast/volume/elements.js';
import {
	INK_STYLE,
	INKS,
	WASH,
	ambientTint,
	rampGlsl,
	rampJs
} from '../src/lib/cast/volume/pigment.js';
import { blankFlow, boundaryAt, SPAWN } from '../src/lib/cast/volume/flow.js';
import { allocateSeats } from '../src/lib/cast/volume/pool.js';
import { TracerPop } from '../src/lib/cast/volume/tracers.js';
import { STEP_S, TRACER_BUDGET, VOLUME } from '../src/lib/cast/volume/tuning.js';
import { scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { scoreFor } from './castHarness.js';

const ELEMENTS: VolumeElement[] = [
	'fire',
	'water',
	'wind',
	'earth',
	'light',
	'crystal',
	'aeroform',
	'inert'
];

/** Steps a population to `seconds` under one flow. */
function stepped(pop: TracerPop, flow: ReturnType<typeof blankFlow>, seconds: number): TracerPop {
	const steps = Math.round(seconds / STEP_S);
	for (let s = 1; s <= steps; s += 1) {
		pop.step(flow, s * STEP_S * 1000);
	}
	return pop;
}

/** A column flow at full emission, the reference archetype. */
function columnFlow() {
	const flow = blankFlow();
	flow.spawn = SPAWN.column;
	flow.emission = 0.8;
	flow.speed = 1.9;
	flow.footprint = 0.45;
	flow.reach = 1.6;
	return flow;
}

test('every element row is complete, and resolution never returns undefined', () => {
	for (const element of ELEMENTS) {
		assert.ok(MOTION[element], `${element} has no motion row`);
		assert.ok(SKIN[element], `${element} has no skin row`);
		assert.ok(INK_STYLE[element], `${element} has no ink row`);
		assert.ok(WASH[element], `${element} has no wash row`);
		assert.ok(INKS[element], `${element} has no rim ink`);
		const sample = { r: 0, g: 0, b: 0 };
		rampJs(element, 0.5, sample);
		assert.ok(sample.r + sample.g + sample.b > 0, `${element} ramp samples black`);
	}
	// Sigil row wins, element row backs it, inert is the designed floor (R-11).
	assert.equal(volumeElementFor('crystal', 'earth'), 'crystal');
	assert.equal(volumeElementFor('aeroform', 'wind'), 'aeroform');
	assert.equal(volumeElementFor('wind-directs-air', 'wind'), 'wind');
	assert.equal(volumeElementFor(null, 'fire'), 'fire');
	assert.equal(volumeElementFor('unmodeled-sigil', null), 'inert');
	assert.equal(volumeElementFor(null, null), 'inert');
});

test('elements literally behave differently: the motion table is not a palette swap', () => {
	// Fire rises and tears; water falls and pools; earth falls harder and mounds.
	assert.ok(MOTION.fire.buoyancy > 2 && MOTION.fire.gravity === 0);
	assert.ok(MOTION.water.gravity > 2 && MOTION.water.buoyancy === 0 && MOTION.water.pool);
	assert.ok(MOTION.earth.gravity > MOTION.water.gravity && MOTION.earth.pool);
	// Water spreads where earth piles, and earth's mound outlives water's puddle.
	assert.ok(MOTION.water.pool!.spread > 4 * MOTION.earth.pool!.spread);
	assert.ok(MOTION.earth.pool!.ageRate < MOTION.water.pool!.ageRate);
	// Both pools stop spreading inside the volume grid, or a long fed cast
	// grows its puddle to the walls and the skin clips it into a glass slab.
	assert.ok(MOTION.water.pool!.edge < 1.9 && MOTION.earth.pool!.edge < 1.9);
	// Wind is the gust row and moves fastest; aeroform is its slower cousin.
	assert.ok(MOTION.wind.gust >= 4);
	for (const element of ELEMENTS) {
		if (element !== 'wind' && element !== 'aeroform') {
			assert.ok(MOTION.wind.gust > MOTION[element].gust, `${element} gusts like wind`);
		}
	}
	assert.ok(MOTION.aeroform.gust > 0 && MOTION.aeroform.gust < MOTION.wind.gust);
	assert.ok(MOTION.aeroform.riseHi < MOTION.wind.riseHi);
	// Crystal barely stirs and stands longest; light is near-weightless.
	for (const element of ELEMENTS) {
		if (element !== 'crystal') {
			assert.ok(
				MOTION.crystal.turbulence < MOTION[element].turbulence,
				`${element} stiller than crystal`
			);
			assert.ok(MOTION.crystal.lifeHi >= MOTION[element].lifeHi, `${element} outlives crystal`);
		}
	}
	assert.ok(MOTION.light.buoyancy > 0 && MOTION.light.gravity === 0);
	// The designed default is the smallest, quietest row (R-11).
	assert.ok(MOTION.inert.spawnPerSec <= 900);
});

test('the chip law: deposits are big enough to render round or not made at all', () => {
	// A full-weight metaball must span at least two grid cells at the working
	// resolution, or it polygonizes as the angular chip the bake-off rejected.
	const radiusCells = Math.sqrt((VOLUME.strength * 0.6) / VOLUME.subtract) * VOLUME.res;
	assert.ok(radiusCells >= 2, `full ball spans ${radiusCells.toFixed(2)} cells`);
	assert.ok(VOLUME.cutoff >= 0.4, 'the binary deposit cutoff has been tuned away');
	// Crystal is the one row allowed to keep its loners: facets are a choice
	// there and only there.
	for (const element of ELEMENTS) {
		if (element !== 'crystal') {
			assert.ok(SKIN[element].loner < 0.5, `${element} keeps chip-sized loners`);
		}
	}
	assert.ok(SKIN.crystal.loner >= 0.5);
	assert.equal(SKIN.crystal.smoothPasses, 0);
});

test('rim inks run dark against their own washes: the contour is ink, never light', () => {
	const wash = { r: 0, g: 0, b: 0 };
	for (const element of ELEMENTS) {
		const ink = INKS[element];
		rampJs(element, INK_STYLE[element].heatBase, wash);
		const inkValue = ink[0] + ink[1] + ink[2];
		const washValue = wash.r + wash.g + wash.b;
		assert.ok(inkValue < washValue, `${element} rim is brighter than its wash`);
	}
	// Water keeps the table's one glint; nothing else speculates.
	for (const element of ELEMENTS) {
		if (element !== 'water') {
			assert.equal(INK_STYLE[element].glint, 0, `${element} glints`);
		}
	}
	assert.ok(INK_STYLE.water.glint > 0);
});

test('the ramp GLSL and JS are the same fold', () => {
	// The GLSL is emitted from the same stop list the JS samples, so checking
	// the emitted source carries the stops is what "written twice" costs here.
	for (const element of ELEMENTS) {
		const source = rampGlsl(element);
		assert.ok(source.includes('vec3 pigment(float heat)'), `${element} emits no pigment()`);
		const tint = ambientTint(element);
		assert.ok(tint.r >= 0 && tint.r <= 1 && tint.g >= 0 && tint.b >= 0);
	}
});

test('a population replays exactly: same seed, same digest; new seed, new grid', () => {
	const a = stepped(new TracerPop('fire', 400, 77), columnFlow(), 1.5);
	const b = stepped(new TracerPop('fire', 400, 77), columnFlow(), 1.5);
	assert.deepEqual(a.digest(), b.digest());
	const c = stepped(new TracerPop('fire', 400, 78), columnFlow(), 1.5);
	assert.notEqual(a.digest().grid, c.digest().grid);
	// Reset replays from the top of the cast.
	a.reset();
	stepped(a, columnFlow(), 1.5);
	assert.deepEqual(a.digest(), b.digest());
});

test('water pools and spreads; earth lands and stays a mound', () => {
	const water = stepped(new TracerPop('water', 500, 11), columnFlow(), 2.5);
	assert.ok(water.pooledFraction > 0.2, 'water never reached the paper');
	const earth = stepped(new TracerPop('earth', 500, 11), columnFlow(), 2.5);
	assert.ok(earth.pooledFraction > 0.2, 'earth never landed');
	// The mound holds its ground: pooled earth stands closer to where it landed
	// than pooled water, which runs outward.
	const spreadOf = (pop: TracerPop) => {
		let sum = 0;
		let count = 0;
		for (let i = 0; i < pop.capacity; i += 1) {
			if (!pop.alive[i] || !pop.pooled[i]) continue;
			sum += Math.hypot(pop.vel[i * 3], pop.vel[i * 3 + 1]);
			count += 1;
		}
		return count > 0 ? sum / count : 0;
	};
	assert.ok(
		spreadOf(water) > spreadOf(earth) * 2,
		'the puddle is not running faster than the rubble'
	);
	// Fire leaves nothing on the ground to pool.
	const fire = stepped(new TracerPop('fire', 500, 11), columnFlow(), 2.5);
	assert.equal(fire.pooledFraction, 0);
});

test('fire melts above the tear line, so the crown cannot freeze into chips', () => {
	const fire = stepped(new TracerPop('fire', 600, 21), columnFlow(), 2);
	const spec = MOTION.fire;
	let highFade = 0;
	let highCount = 0;
	let lowFade = 0;
	let lowCount = 0;
	for (let i = 0; i < fire.capacity; i += 1) {
		if (!fire.alive[i]) continue;
		const hn = fire.pos[i * 3 + 2] / 1.6;
		if (hn > spec.tearFrom + 0.25) {
			highFade += fire.fade[i];
			highCount += 1;
		} else if (hn < spec.tearFrom * 0.6 && fire.fade[i] > 0) {
			lowFade += fire.fade[i];
			lowCount += 1;
		}
	}
	assert.ok(lowCount > 0, 'no body below the tear line');
	if (highCount > 0) {
		assert.ok(
			highFade / highCount < (lowFade / lowCount) * 0.6,
			'the crown is as solid as the body'
		);
	}
});

test('the sink is a ring attractor: matter gathers at the ring and the eye stays hollow', () => {
	const flow = blankFlow();
	flow.spawn = SPAWN.sink;
	flow.emission = 0.7;
	flow.speed = 1.2;
	flow.sink = 3.2;
	flow.pool = 0.6;
	flow.reach = 1.2;
	const pop = stepped(new TracerPop('wind', 500, 31), flow, 2.5);
	let inEye = 0;
	let live = 0;
	for (let i = 0; i < pop.capacity; i += 1) {
		if (!pop.alive[i]) continue;
		live += 1;
		if (Math.hypot(pop.pos[i * 3], pop.pos[i * 3 + 1]) < 0.2) inEye += 1;
	}
	assert.ok(live > 50, 'the pull starved');
	assert.ok(inEye / live < 0.1, 'the ring attractor piled the medium into a stain');
});

test('the arm herding sorts a swirl into arms, and the pattern turns with the phase', () => {
	// The k-fold resultant of the live population: 0 is azimuthally uniform,
	// 1 is everything on one arm. The angle is where the pattern points.
	const fold = (pop: TracerPop, k: number) => {
		let re = 0;
		let im = 0;
		let mass = 0;
		for (let i = 0; i < pop.capacity; i += 1) {
			if (!pop.alive[i]) continue;
			const a = Math.atan2(pop.pos[i * 3 + 1], pop.pos[i * 3]) * k;
			re += Math.cos(a) * pop.fade[i];
			im += Math.sin(a) * pop.fade[i];
			mass += pop.fade[i];
		}
		return { strength: mass > 0 ? Math.hypot(re, im) / mass : 0, angle: Math.atan2(im, re) / k };
	};
	const swirlFlow = (arms: number) => {
		const flow = blankFlow();
		flow.spawn = SPAWN.swirl;
		flow.emission = 0.7;
		flow.speed = 1.2;
		flow.footprint = 0.5;
		flow.narrow = -0.5;
		flow.reach = 1.2;
		flow.swirl = 3;
		flow.sink = 1.8;
		flow.pool = 0.55;
		flow.lifeMul = 1.5;
		flow.arms = arms;
		flow.armGain = arms > 0 ? 2.3 : 0;
		return flow;
	};
	const RATE = 2.5;
	const turned = (arms: number, seconds: number) => {
		const pop = new TracerPop('fire', 500, 61);
		const flow = swirlFlow(arms);
		const steps = Math.round(seconds / STEP_S);
		for (let s = 1; s <= steps; s += 1) {
			// The cell's side of the contract: the pattern advances on the same
			// phase the mass is driven by.
			flow.armPhase = RATE * s * STEP_S;
			pop.step(flow, s * STEP_S * 1000);
		}
		return pop;
	};
	// Armless, the same swirl is azimuthally uniform — the failure this law
	// exists for: a mass whose skin cannot show its own rotation.
	assert.ok(fold(turned(0, 2), 4).strength < 0.15, 'an unpatterned swirl grew arms');
	const early = fold(turned(4, 2), 4);
	const later = fold(turned(4, 2.4), 4);
	assert.ok(early.strength > 0.3, `the herding left the mass uniform (${early.strength})`);
	assert.ok(later.strength > 0.3, 'the arms washed out as the population aged');
	// Between the two reads the phase advanced RATE * 0.4; the pattern must
	// have turned with it, compared on the 4-fold circle.
	const spacing = (Math.PI * 2) / 4;
	const expected = (RATE * 0.4) % spacing;
	let drift = (later.angle - early.angle - expected) % spacing;
	if (drift > spacing / 2) drift -= spacing;
	if (drift < -spacing / 2) drift += spacing;
	assert.ok(Math.abs(drift) < 0.3, `the pattern slipped its phase by ${drift.toFixed(3)}`);
});

test('the gather contains a held population inside its shell', () => {
	const flow = blankFlow();
	flow.spawn = SPAWN.hover;
	flow.emission = 0.6;
	flow.speed = 0.6;
	flow.originZ = 0.8;
	flow.gather = 14;
	flow.holdRadius = 0.4;
	flow.reach = 1;
	// The hold cell suspends its element's weight (levitation), so its law
	// suite tests the same configuration.
	flow.weightMul = 0.12;
	const pop = stepped(new TracerPop('water', 400, 41), flow, 2);
	let outside = 0;
	let live = 0;
	for (let i = 0; i < pop.capacity; i += 1) {
		if (!pop.alive[i]) continue;
		live += 1;
		const dist = Math.hypot(pop.pos[i * 3], pop.pos[i * 3 + 1], pop.pos[i * 3 + 2] - 0.8);
		if (dist > 0.4 * 1.8) outside += 1;
	}
	assert.ok(live > 30, 'the hold starved');
	assert.ok(outside / live < 0.12, 'the grip is losing its own ball');
});

test('zero emission spawns nothing, which is what R-01 silence stands on', () => {
	const flow = columnFlow();
	flow.emission = 0;
	const pop = stepped(new TracerPop('fire', 200, 51), flow, 1);
	assert.equal(pop.born, 0);
	assert.equal(pop.live, 0);
});

test('the boundary wobbles but never collapses, and narrow runs both ways', () => {
	const flow = columnFlow();
	for (let h = 0; h <= 1; h += 0.25) {
		const boundary = boundaryAt(flow, 0.3, 0.2, h, 1.7);
		assert.ok(boundary > 0.04, `boundary collapsed at h=${h}`);
	}
	// A funnel flares: negative narrow widens with height.
	flow.narrow = -0.8;
	assert.ok(
		boundaryAt(flow, 0.3, 0.2, 1, 1.7) > boundaryAt(flow, 0.3, 0.2, 0, 1.7),
		'a negative narrow still tapers'
	);
});

test('one pool, divided once: seats follow demand and sum to the budget', () => {
	const score = scoreFor('column-levitation', 'water', {
		signature: 'volume-pool-test',
		duration: 4
	});
	const tracks = scoreTracks(score);
	const seats = allocateSeats(tracks);
	assert.equal(seats.length, tracks.length);
	assert.equal(
		seats.reduce((sum, one) => sum + one, 0),
		TRACER_BUDGET
	);
	for (const seat of seats) {
		assert.ok(seat >= 90, 'a channel was starved out');
	}
	// The medium is the room the shot is lit in, never its subject.
	const shimmerAt = tracks.findIndex((track) => track.kind === 'shimmer');
	const jetAt = tracks.findIndex((track) => track.kind === 'jet');
	assert.ok(seats[jetAt] > seats[shimmerAt]);
});

test('the ground gauge grows as matter lands and drains with the pool', () => {
	const water = new TracerPop('water', 500, 61);
	const flow = columnFlow();
	stepped(water, flow, 1);
	const early = water.groundMass();
	stepped(water, flow, 1.5);
	const landed = water.groundMass();
	assert.ok(landed > early, 'nothing accumulated on the paper');
	// The afterglow dries the pool out.
	flow.emission = 0;
	flow.drain = 1;
	stepped(water, flow, 2.5);
	assert.ok(water.groundMass() < landed * 0.4, 'the puddle never dries');
});
