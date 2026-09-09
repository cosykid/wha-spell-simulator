/** R-23: creative elemental currents move, release and replay as one continuous band. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileScore } from '../src/lib/cast/score/compileScore.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import { advanceTo, castFor, disposeCast, reportOf, reportsOf } from './castHarness.js';
import { ribbonNormal, ribbonPoint } from '../src/lib/cast/volume/ribbon.js';
import { WEAVE_CURRENTS } from '../src/lib/cast/score/tracks/weaveCurrents.js';

const SIGILS = ['water', 'fire', 'wind-directs-air', 'aeroform', 'light'] as const;
const scoreFor = (sigil: string) =>
	compileScore(resolvePlan(readPresetSeal(presetById('weave').signs, sigil)), {
		signature: `creative-weave:${sigil}`,
		duration: 5
	});

test('[R-01, R-23] each current opens from silence, keeps moving, then releases', () => {
	const shapes = new Set<string>();
	for (const sigil of SIGILS) {
		const cast = castFor(scoreFor(sigil));
		const channel = cast.substrate.channels.find((c) => c.kind === 'weave')!;
		advanceTo(cast, 850);
		assert.equal(channel.born, 0, sigil);
		advanceTo(cast, 1150);
		const strike = reportOf(cast, 'weave');
		advanceTo(cast, 2200);
		const body = reportOf(cast, 'weave');
		assert.equal(body.detail.targets, 1);
		assert.ok(body.marks > 500, `${sigil} lost its continuous body`);
		assert.ok(body.detail.length > strike.detail.length);
		const before = channel.tracers.digest();
		advanceTo(cast, 3200);
		assert.notDeepEqual(channel.tracers.digest(), before, `${sigil} became a static recolor`);
		shapes.add(JSON.stringify(channel.tracers.digest()));
		advanceTo(cast, 4300);
		assert.equal(channel.flow.emission, 0);
		assert.ok(reportOf(cast, 'weave').detail.attachment < 0.6);
		const born = channel.born;
		advanceTo(cast, 5000);
		assert.equal(channel.born, born, 'release never spawns more material');
		assert.ok(channel.flow.deposit < 0.03);
		disposeCast(cast);
		assert.equal(channel.live, 0);
	}
	assert.equal(shapes.size, SIGILS.length, 'each medium has distinct motion');
});

test('[R-23] fluid material yields to gravity while the light loop fades in place', () => {
	const water = castFor(scoreFor('water'));
	const light = castFor(scoreFor('light'));
	for (const cast of [water, light]) advanceTo(cast, 3800);
	const waterBody = reportOf(water, 'weave').at.z;
	for (const cast of [water, light]) advanceTo(cast, 4550);
	assert.ok(reportOf(water, 'weave').at.z < waterBody - 0.1, 'water should fall out of its arch');
	assert.ok(reportOf(light, 'weave').ink < 0.01, 'light extinguishes by the end of release');
	disposeCast(water);
	disposeCast(light);
});

test('[R-23] creative current replay is independent of display frame batching', () => {
	for (const sigil of SIGILS) {
		const a = castFor(scoreFor(sigil)),
			b = castFor(scoreFor(sigil));
		advanceTo(a, 3200);
		for (let t = 50; t <= 3200; t += 50) advanceTo(b, t);
		assert.deepEqual(reportsOf(a), reportsOf(b), sigil);
		assert.deepEqual(
			a.substrate.channels.map((c) => c.tracers.digest()),
			b.substrate.channels.map((c) => c.tracers.digest())
		);
		disposeCast(a);
		disposeCast(b);
	}
});

test('[R-23] authored currents stay within the stage and have stable surface normals', () => {
	const point = { x: 0, y: 0, z: 0 },
		normal = { ...point };
	for (const style of Object.values(WEAVE_CURRENTS)) {
		for (const phase of [0, 1, 3, 6]) {
			const ribbon = {
				length: 3.4,
				width: style.width,
				stretch: 1,
				materialCount: 750,
				current: { ...style.current, phase, open: 1, attachment: 1 }
			};
			for (let i = 0; i <= 100; i++) {
				for (const side of [-1, 1]) {
					ribbonPoint(ribbon, i / 100, side, 0, point);
					assert.ok(Math.hypot(point.x, point.y) < 2.1);
					assert.ok(point.z >= 0 && point.z < 3.5);
				}
				ribbonNormal(ribbon, i / 100, normal);
				assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-6);
			}
		}
	}
});
