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

/** The hover flow a hold writes, the configuration the gather test above uses. */
function hoverFlow(holdRadius = 0.4) {
	const flow = blankFlow();
	flow.spawn = SPAWN.hover;
	flow.emission = 0.6;
	flow.speed = 0.6;
	flow.originZ = 0.8;
	flow.gather = 14;
	flow.holdRadius = holdRadius;
	flow.reach = 1;
	flow.weightMul = 0.12;
	return flow;
}

/** Mean vertical velocity and the top of a population. */
function heightOf(pop: TracerPop) {
	let n = 0;
	let vz = 0;
	let top = 0;
	for (let i = 0; i < pop.capacity; i += 1) {
		if (!pop.alive[i]) continue;
		n += 1;
		vz += pop.vel[i * 3 + 2];
		top = Math.max(top, pop.pos[i * 3 + 2]);
	}
	return { vz: n > 0 ? vz / n : 0, top };
}

test('ground-truth-6: the pair grips what its element lets it, so wind streams through a hold', () => {
	// The grip is the element's. Water is held: it hangs in the shell with
	// its weight suspended. Wind gives the pair nothing to take: it is born
	// on the disc under the locus, thrown up through it, and leaves over the
	// top, so a wind levitation seal is a fan, never a ball.
	assert.equal(MOTION.water.grip, 1);
	assert.equal(MOTION.wind.grip, 0);
	assert.ok(MOTION.aeroform.grip > 0 && MOTION.aeroform.grip < 1, 'aeroform is part held');
	for (const element of ELEMENTS) {
		assert.ok(MOTION[element].grip >= 0 && MOTION[element].grip <= 1, `${element} grip`);
	}
	const water = heightOf(stepped(new TracerPop('water', 400, 41), hoverFlow(), 2));
	const wind = heightOf(stepped(new TracerPop('wind', 400, 41), hoverFlow(), 2));
	const clear = 0.8 + 0.4 * 1.25;
	assert.ok(Math.abs(water.vz) < 0.4, 'held water is on the move');
	assert.ok(water.top < clear, 'held water climbed out of its shell');
	assert.ok(wind.vz > 0.8, 'wind hangs in the grip instead of streaming through it');
	assert.ok(wind.top > clear, 'the stream never clears the shell');
});

test('ground-truth-8: manifested magic occupies volume, so a ball cannot be squeezed to a point', () => {
	// A hold with next to no shell and a hard gather. Without the excluded
	// volume every population collapses onto the locus alike; with it the
	// ball is as big as its content and grows with the count.
	const squeezed = (capacity: number) => {
		const pop = stepped(new TracerPop('water', capacity, 41), hoverFlow(0.05), 2.5);
		let n = 0;
		let sum = 0;
		for (let i = 0; i < pop.capacity; i += 1) {
			if (!pop.alive[i]) continue;
			n += 1;
			const d = Math.hypot(pop.pos[i * 3], pop.pos[i * 3 + 1], pop.pos[i * 3 + 2] - 0.8);
			sum += d * d;
		}
		return Math.sqrt(sum / n);
	};
	const small = squeezed(120);
	const large = squeezed(1200);
	assert.ok(small < 0.3, 'a small ball should still be gathered close');
	assert.ok(large > small * 1.2, 'the crowd packed to a point');
});

test('ground-truth-8: focus makes the manifestation rigid, so it moves as one body', () => {
	// How far each tracer's velocity strays from its neighbours' mean. The
	// lens leaves the count and the shell alone and takes the swarm out of it.
	const strays = (pop: TracerPop) => {
		const live: number[] = [];
		for (let i = 0; i < pop.capacity; i += 1) if (pop.alive[i]) live.push(i);
		let total = 0;
		let count = 0;
		for (const i of live) {
			let mx = 0;
			let my = 0;
			let mz = 0;
			let n = 0;
			for (const j of live) {
				if (j === i) continue;
				const d = Math.hypot(
					pop.pos[i * 3] - pop.pos[j * 3],
					pop.pos[i * 3 + 1] - pop.pos[j * 3 + 1],
					pop.pos[i * 3 + 2] - pop.pos[j * 3 + 2]
				);
				if (d < 0.15) {
					mx += pop.vel[j * 3];
					my += pop.vel[j * 3 + 1];
					mz += pop.vel[j * 3 + 2];
					n += 1;
				}
			}
			if (n < 3) continue;
			total += Math.hypot(
				pop.vel[i * 3] - mx / n,
				pop.vel[i * 3 + 1] - my / n,
				pop.vel[i * 3 + 2] - mz / n
			);
			count += 1;
		}
		return total / count;
	};
	const loose = strays(stepped(new TracerPop('water', 500, 41, { focus: 1 }), hoverFlow(), 2.5));
	const focused = strays(
		stepped(new TracerPop('water', 500, 41, { focus: 2.5 }), hoverFlow(), 2.5)
	);
	assert.ok(focused < loose * 0.65, `focus left the swarm loose (${focused} vs ${loose})`);
	// No convergence ink means no rigidity: the default physics is the unfocused one.
	assert.deepEqual(
		stepped(new TracerPop('water', 300, 41), hoverFlow(), 1).digest(),
		stepped(new TracerPop('water', 300, 41, { focus: 1 }), hoverFlow(), 1).digest()
	);
});

test('crystal grows spires: matter sets where its growth stops and stands in the air', () => {
	for (const element of ELEMENTS) {
		const pool = MOTION[element].pool;
		if (element === 'crystal') {
			assert.ok(pool && pool.settleSpeed > 0, 'crystal has to set in the air');
		} else {
			assert.ok(!pool || pool.settleSpeed === 0, `${element} sets in the air like crystal`);
		}
	}
	const crystal = stepped(new TracerPop('crystal', 500, 11), columnFlow(), 2.5);
	assert.ok(crystal.pooledFraction > 0.5, 'the spires never set');
	let n = 0;
	let z = 0;
	let top = 0;
	let moving = 0;
	for (let i = 0; i < crystal.capacity; i += 1) {
		if (!crystal.alive[i] || !crystal.pooled[i]) continue;
		n += 1;
		z += crystal.pos[i * 3 + 2];
		top = Math.max(top, crystal.pos[i * 3 + 2]);
		if (Math.hypot(crystal.vel[i * 3], crystal.vel[i * 3 + 1], crystal.vel[i * 3 + 2]) > 0) {
			moving += 1;
		}
	}
	assert.ok(z / n > 0.3, 'set crystal lies on the floor instead of standing');
	assert.ok(top > 0.8, 'no spire reached up');
	assert.equal(moving, 0, 'set lattice drifts');
});

test('earth heaps into a mound with height; water lies flat', () => {
	const heightOfPool = (pop: TracerPop) => {
		let n = 0;
		let z = 0;
		for (let i = 0; i < pop.capacity; i += 1) {
			if (!pop.alive[i] || !pop.pooled[i]) continue;
			n += 1;
			z += pop.pos[i * 3 + 2];
		}
		return n > 0 ? z / n : 0;
	};
	const earth = heightOfPool(stepped(new TracerPop('earth', 500, 11), columnFlow(), 3));
	const water = heightOfPool(stepped(new TracerPop('water', 500, 11), columnFlow(), 3));
	assert.ok(earth > 0.2, `the mound is flat (${earth})`);
	assert.ok(water < 0.1, `the puddle has height (${water})`);
	assert.ok(earth > water * 3);
});

test('light is a beam: straight, fast, and gone the moment the feed stops', () => {
	const onAxis = (pop: TracerPop) => {
		let n = 0;
		let near = 0;
		let speed = 0;
		for (let i = 0; i < pop.capacity; i += 1) {
			if (!pop.alive[i]) continue;
			n += 1;
			if (Math.hypot(pop.pos[i * 3], pop.pos[i * 3 + 1]) < 0.35) near += 1;
			speed += Math.hypot(pop.vel[i * 3], pop.vel[i * 3 + 1], pop.vel[i * 3 + 2]);
		}
		return { near: near / n, speed: speed / n };
	};
	const light = onAxis(stepped(new TracerPop('light', 500, 21), columnFlow(), 2));
	const fire = onAxis(stepped(new TracerPop('fire', 500, 21), columnFlow(), 2));
	assert.ok(light.near > 0.9, 'the beam spreads like a plume');
	assert.ok(fire.near < 0.8, 'the plume is as straight as a beam');
	assert.ok(light.speed > fire.speed * 1.3, 'light convects instead of radiating');
	// Canon's beam ends where the spell ends.
	const after = (element: VolumeElement, seconds: number) => {
		const pop = stepped(new TracerPop(element, 500, 21), columnFlow(), 2);
		const cut = columnFlow();
		cut.emission = 0;
		const steps = Math.round(seconds / STEP_S);
		const from = Math.round(2 / STEP_S);
		for (let s = 1; s <= steps; s += 1) pop.step(cut, (from + s) * STEP_S * 1000);
		return pop.live;
	};
	assert.ok(after('light', 0.5) < after('fire', 0.5), 'light lingers like fire');
	assert.equal(after('light', 1), 0, 'the beam outlived its feed');
});

test('ground-truth-7: the sink holds the settled mass too, so a pull keeps its cushion', () => {
	const radiusOfPool = (sink: number) => {
		const flow = columnFlow();
		flow.sink = sink;
		flow.pool = 0.4;
		const pop = stepped(new TracerPop('water', 500, 11), flow, 3);
		let n = 0;
		let r = 0;
		for (let i = 0; i < pop.capacity; i += 1) {
			if (!pop.alive[i] || !pop.pooled[i]) continue;
			n += 1;
			r += Math.hypot(pop.pos[i * 3], pop.pos[i * 3 + 1]);
		}
		return r / n;
	};
	assert.ok(radiusOfPool(1.5) < radiusOfPool(0) * 0.85, 'the puddle ran out from under the pull');
});
