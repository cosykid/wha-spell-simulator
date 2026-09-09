/** R-22: Stretch deforms a finite solid sample, with no invented ribbon emitters. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { compileScore, scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { planDigest } from '../src/lib/compiler/plan/planDigest.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { readPresetSeal } from '../src/lib/ui/spellEffectLab.js';
import { presetById } from '../src/lib/ui/spellEffectLabPresets.js';
import { weaveHint } from '../src/lib/ui/weaveHint.js';
import { ribbonNormal, ribbonPoint, type RibbonFlow } from '../src/lib/cast/volume/ribbon.js';
import { depositSheet } from '../src/lib/cast/volume/sheetDeposit.js';
import { advanceTo, castFor, disposeCast, reportOf, reportsOf } from './castHarness.js';

const SOURCE = { signature: 'weave-law', duration: 5 };
const reading = (sigil = 'earth') => readPresetSeal(presetById('weave').signs, sigil);
const score = (sigil = 'earth') => compileScore(resolvePlan(reading(sigil)), SOURCE);

test('[R-22] earth and crystal stretch a solid instead of emitting a default plume', () => {
	for (const [sigil, material] of [
		['earth', 'stone'],
		['crystal', 'crystal']
	]) {
		const plan = resolvePlan(reading(sigil));
		assert.deepEqual(plan.weave, { material });
		assert.equal(plan.budget, 0, 'stretch ink does not also amplify a burst');
		assert.ok(plan.notes.includes('weave-solid-demo'));
		const tracks = scoreTracks(compileScore(plan, SOURCE));
		assert.equal(tracks.filter(({ kind }) => kind === 'weave').length, 1);
		assert.ok(!tracks.some(({ id }) => id === 'jet-default'));
		assert.match(weaveHint(plan), /sample.*pulled/);
	}
});

test('[R-23] every non-solid sigil receives one explicitly creative current', () => {
	for (const sigil of [
		'water',
		'fire',
		'wind-directs-air',
		'wind-underfoot',
		'aeroform',
		'light'
	]) {
		const plan = resolvePlan(reading(sigil));
		assert.ok(plan.weave, sigil);
		assert.ok(plan.notes.includes('weave-imagined'));
		assert.ok(!plan.notes.includes('weave-needs-solid'));
		const tracks = scoreTracks(compileScore(plan, SOURCE));
		const currents = tracks.filter((track) => track.kind === 'weave');
		assert.equal(currents.length, 1);
		assert.ok(currents[0].params.current);
		assert.ok(!tracks.some((track) => track.id === 'jet-default'));
		assert.match(weaveHint(plan), /^Creative extension:/);
	}
});

test('[R-22] sign count, placement and inversion do not invent extra ribbons or pulling directions', () => {
	const seal = reading();
	const plan = resolvePlan(seal);
	for (const signs of [
		[...seal.signs, ...seal.signs],
		seal.signs.map((s) => ({ ...s, at: { x: 0.7, y: 0 } })),
		seal.signs.map((s) => ({ ...s, facing: { x: -s.facing.x, y: -s.facing.y } })),
		seal.signs.map((s) => ({ ...s, length: s.length * 3 }))
	]) {
		const changed = resolvePlan({ ...seal, signs });
		assert.equal(planDigest(plan), planDigest(changed));
		assert.deepEqual(
			scoreTracks(compileScore(plan, SOURCE)),
			scoreTracks(compileScore(changed, SOURCE))
		);
	}
});

test('[R-13, R-22] a gripping hold can constrain the solid demonstration', () => {
	const signs = [...presetById('weave').signs, ...presetById('column-levitation').signs];
	const tracks = scoreTracks(compileScore(resolvePlan(readPresetSeal(signs, 'earth')), SOURCE));
	assert.equal(
		tracks.find((t) => t.kind === 'weave')?.capturedBy,
		tracks.find((t) => t.kind === 'hold')?.id
	);
});

test('[R-01, R-22] one contact sample stretches with no new material and stays in shape', () => {
	for (const sigil of ['earth', 'crystal']) {
		const cast = castFor(score(sigil));
		const channel = cast.substrate.channels.find((c) => c.kind === 'weave')!;
		advanceTo(cast, 850);
		assert.equal(reportOf(cast, 'weave').born, 0);
		advanceTo(cast, 1150);
		const contact = reportOf(cast, 'weave');
		assert.equal(contact.detail.targets, 1);
		assert.equal(contact.detail.stretch, 0);
		assert.ok(contact.marks >= 500, `${sigil}: a complete solid sample appears at contact`);
		advanceTo(cast, 2200);
		const pulled = reportOf(cast, 'weave');
		assert.ok(pulled.detail.length > 2);
		assert.ok(pulled.tip.z > contact.tip.z + 1.5);
		assert.equal(pulled.born, contact.born);
		assert.equal(pulled.marks, contact.marks);
		advanceTo(cast, 2600);
		const settled = reportOf(cast, 'weave');
		advanceTo(cast, 4300);
		assert.deepEqual(reportOf(cast, 'weave').tip, settled.tip);
		assert.equal(channel.born, contact.born);
		assert.equal(channel.live, contact.marks);
		assert.equal(channel.flow.emission, 0);
		advanceTo(cast, 5000);
		assert.ok(channel.flow.deposit < 0.03, 'the preview ends without unraveling the solid');
		disposeCast(cast);
		assert.equal(channel.live, 0);
	}
});

test('[R-22] long casts keep the original solid rather than refilling dying particles', () => {
	const cast = castFor(compileScore(resolvePlan(reading()), { ...SOURCE, duration: 12 }));
	advanceTo(cast, 1600);
	const initial = reportOf(cast, 'weave');
	advanceTo(cast, 9000);
	const sustained = reportOf(cast, 'weave');
	assert.equal(sustained.born, initial.born);
	assert.equal(sustained.marks, initial.marks);
	disposeCast(cast);
});

test('[R-22] deformation replay is identical fresh or in display frames', () => {
	const a = castFor(score());
	const b = castFor(score());
	advanceTo(a, 2600);
	for (let t = 50; t <= 2600; t += 50) advanceTo(b, t);
	assert.deepEqual(reportsOf(a), reportsOf(b));
	assert.deepEqual(
		a.substrate.channels.map((c) => c.tracers.digest()),
		b.substrate.channels.map((c) => c.tracers.digest())
	);
	disposeCast(a);
	disposeCast(b);
});

test('[R-22] stretching makes the solid longer and thinner with a continuous broad face', () => {
	const flow: RibbonFlow = { length: 3, width: 0.65, stretch: 0, materialCount: 650 };
	const a = { x: 0, y: 0, z: 0 },
		b = { ...a },
		normal = { ...a };
	ribbonPoint(flow, 0.5, 0, -1, a);
	ribbonPoint(flow, 0.5, 0, 1, b);
	const initialThickness = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
	flow.stretch = 1;
	ribbonPoint(flow, 0.5, 0, -1, a);
	ribbonPoint(flow, 0.5, 0, 1, b);
	assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < initialThickness / 3);
	for (const u of [0, 0.25, 0.5, 0.75, 1]) {
		ribbonPoint(flow, u, -1, 0, a);
		ribbonPoint(flow, u, 1, 0, b);
		assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.6);
		ribbonNormal(flow, u, normal);
		assert.ok(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-6);
	}
});

test('[R-22] the shared volume preserves a broad face with a thin edge', () => {
	const size = 56;
	const field = new Float32Array(size ** 3);
	depositSheet(field, size, 0.5, 0.5, 0.5, 0, 0, 1, 0.04, 12);
	const at = (x: number, y: number, z: number) => field[(z * size + y) * size + x];
	assert.ok(at(30, 28, 28) > 0);
	assert.equal(at(28, 28, 30), 0);
});
