/**
 * Law tests for the sound layer's pure core: how a voice row is resolved, and
 * what a sound score says about time. The rulings are cited by id from
 * `docs/animation-spec.md`. Every sound is scheduled off this score, so what is
 * pinned here is when a cast is heard, never how it sounds: the synth needs a
 * browser and is measured by an offline render, not asserted on.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSoundScore, gainAt, SAMPLE_MS } from '../src/lib/cast/sound/cues.js';
import type { SoundLayer, SoundScore } from '../src/lib/cast/sound/cues.js';
import {
	AEROFORM_VOICE,
	CRYSTAL_VOICE,
	EARTH_VOICE,
	INERT_VOICE,
	VOICES,
	WIND_VOICE,
	voiceRow
} from '../src/lib/cast/sound/voices.js';
import type { VoiceTable } from '../src/lib/cast/sound/voice.js';
import { bodyMsFor, TOTAL_MS_RANGE } from '../src/lib/cast/score/beats.js';
import { scoreTracks } from '../src/lib/cast/score/compileScore.js';
import { SIGIL_OPTIONS } from '../src/lib/ui/spellEffectLab.js';
import { LAB_PRESETS } from '../src/lib/ui/spellEffectLabPresets.js';
import { scoreFor } from './castHarness.js';
import type { ElementId } from '../src/lib/types.js';

const SOURCE = { signature: 'test-sound', duration: 4 };

function soundFor(presetId: string, sigil = 'fire', source = SOURCE): SoundScore {
	return compileSoundScore(scoreFor(presetId, sigil, source));
}

/** The layers the seal itself performs: everything but the charge swell and the medium. */
function manifested(sound: SoundScore): SoundLayer[] {
	return sound.layers.filter((layer) => layer.kind !== 'charge' && layer.kind !== 'shimmer');
}

function layerById(sound: SoundScore, id: string): SoundLayer {
	const layer = sound.layers.find((candidate) => candidate.id === id);
	assert.ok(layer, `expected a ${id} layer`);
	return layer;
}

const EVERY_ELEMENT: Record<ElementId, true> = {
	fire: true,
	water: true,
	wind: true,
	earth: true,
	light: true
};

test('every element has a row, and every lab sigil resolves to one', () => {
	for (const element of Object.keys(EVERY_ELEMENT) as ElementId[]) {
		assert.ok(VOICES[element], `${element} has no voice row`);
	}
	for (const option of SIGIL_OPTIONS) {
		assert.ok(voiceRow({ sigil: option.id, element: option.element }));
	}
});

test('resolution falls sigil, then element, then inert, and never returns undefined', () => {
	assert.equal(voiceRow({ sigil: 'crystal', element: 'earth' }), CRYSTAL_VOICE);
	assert.equal(voiceRow({ sigil: 'wind-underfoot', element: 'wind' }), WIND_VOICE);
	assert.equal(voiceRow({ sigil: null, element: null }), INERT_VOICE);
	assert.equal(voiceRow({ sigil: 'unknown', element: null }), INERT_VOICE);
	const withRow: VoiceTable = { ...VOICES, 'wind-underfoot': AEROFORM_VOICE };
	assert.equal(voiceRow({ sigil: 'wind-underfoot', element: 'wind' }, withRow), AEROFORM_VOICE);
});

test('crystal is not earth and aeroform is not wind, in sound as in paint', () => {
	assert.notDeepEqual(CRYSTAL_VOICE, EARTH_VOICE);
	assert.notDeepEqual(AEROFORM_VOICE, WIND_VOICE);
	assert.notEqual(CRYSTAL_VOICE.tone.baseHz, EARTH_VOICE.tone.baseHz);
	assert.notEqual(AEROFORM_VOICE.body.centerHz, WIND_VOICE.body.centerHz);
});

test('every lab preset under every sigil compiles to a charge, the medium, and the spell', () => {
	for (const preset of LAB_PRESETS) {
		for (const option of SIGIL_OPTIONS) {
			const sound = soundFor(preset.id, option.id);
			assert.equal(sound.layers[0].kind, 'charge');
			assert.equal(sound.layers[1].kind, 'shimmer');
			assert.ok(manifested(sound).length >= 1, `${preset.id} manifests nothing audible`);
		}
	}
});

test('R-01: nothing the seal manifests is heard before the strike', () => {
	for (const preset of LAB_PRESETS) {
		const sound = soundFor(preset.id);
		const strikeMs = sound.beats.strike.startMs;
		assert.equal(sound.strike.atMs, strikeMs);
		for (const layer of manifested(sound)) {
			for (let tMs = 0; tMs < strikeMs; tMs += SAMPLE_MS) {
				assert.equal(gainAt(layer, tMs), 0, `${layer.id} is heard at ${tMs}ms`);
			}
		}
		for (const grain of sound.grains) {
			assert.ok(grain.atMs >= strikeMs, `a grain at ${grain.atMs}ms precedes the strike`);
		}
	}
});

test('R-01: the charge is content, a swell that peaks as the strike lands', () => {
	const sound = soundFor('column-balanced');
	const charge = layerById(sound, 'charge');
	const strikeMs = sound.beats.strike.startMs;
	assert.equal(gainAt(charge, 0), 0);
	let previous = 0;
	for (let tMs = SAMPLE_MS; tMs < strikeMs; tMs += SAMPLE_MS) {
		const value = gainAt(charge, tMs);
		assert.ok(value >= previous, `the charge falls at ${tMs}ms`);
		previous = value;
	}
	assert.ok(gainAt(charge, strikeMs - SAMPLE_MS) > 0.5);
	assert.equal(gainAt(charge, sound.totalMs), 0);
});

test('R-02: a longer spell buys body time and nothing else', () => {
	const short = soundFor('column-levitation', 'fire', { ...SOURCE, duration: 3.5 });
	const long = soundFor('column-levitation', 'fire', { ...SOURCE, duration: 8 });
	const stretch = bodyMsFor(long.totalMs) - bodyMsFor(short.totalMs);
	assert.ok(stretch > 0);
	assert.deepEqual(layerById(short, 'charge'), layerById(long, 'charge'));
	assert.equal(long.strike.atMs, short.strike.atMs);
	for (const layer of short.layers) {
		const stretched = layerById(long, layer.id);
		assert.equal(stretched.startMs, layer.startMs);
		assert.equal(stretched.endMs - layer.endMs, layer.kind === 'charge' ? 0 : stretch);
	}
});

test('every layer is silent by the end of the cast, and never louder than one', () => {
	for (const duration of [TOTAL_MS_RANGE.min / 1000, 5, TOTAL_MS_RANGE.max / 1000]) {
		for (const preset of LAB_PRESETS) {
			const sound = soundFor(preset.id, 'water', { ...SOURCE, duration });
			for (const layer of sound.layers) {
				assert.ok(layer.endMs <= sound.totalMs, `${layer.id} outlives the cast`);
				assert.equal(layer.gain[layer.gain.length - 1], 0);
				for (const value of layer.gain) {
					assert.ok(value >= 0 && value <= 1);
				}
			}
			for (const grain of sound.grains) {
				assert.ok(grain.atMs < sound.beats.afterglow.startMs);
			}
		}
	}
});

test('the same score sounds the same twice, and another signature scatters other grains', () => {
	const score = scoreFor('column-balanced', 'fire', SOURCE);
	assert.deepEqual(compileSoundScore(score), compileSoundScore(score));
	const other = soundFor('column-balanced', 'fire', { ...SOURCE, signature: 'another' });
	assert.ok(other.grains.length > 0, 'fire crackles');
	assert.notDeepEqual(
		other.grains.map((grain) => grain.atMs),
		soundFor('column-balanced').grains.map((grain) => grain.atMs)
	);
});

test('a grain is only thrown while the manifestation is loud', () => {
	for (const sigil of ['fire', 'water', 'earth', 'light', 'crystal']) {
		const sound = soundFor('column-balanced', sigil);
		assert.ok(sound.grains.length > 0, `${sigil} throws nothing off`);
		for (const grain of sound.grains) {
			const loudness = Math.max(...manifested(sound).map((layer) => gainAt(layer, grain.atMs)));
			assert.ok(loudness > 0, `${sigil} threw a grain at ${grain.atMs}ms into silence`);
		}
	}
	for (const sigil of ['wind-directs-air', 'aeroform']) {
		assert.equal(
			soundFor('column-balanced', sigil).grains.length,
			0,
			`${sigil} throws nothing off`
		);
	}
});

test('R-05: a jet is heard where it aims', () => {
	const score = scoreFor('column-unbalanced', 'fire', SOURCE);
	const jet = scoreTracks(score).find((track) => track.kind === 'jet');
	assert.ok(jet && jet.kind === 'jet');
	assert.ok(Math.abs(jet.params.axis.x) > 0.1, 'the fixture leans');
	const layer = layerById(compileSoundScore(score), jet.id);
	assert.equal(Math.sign(layer.motion.pan), Math.sign(jet.params.axis.x));
});

test('R-15: a cancelled seal strikes exactly as an unmarked ring', () => {
	assert.equal(soundFor('column-cancelled').strike.strength, soundFor('none').strike.strength);
	assert.ok(soundFor('column-balanced').strike.strength > soundFor('none').strike.strength);
});

test('a held mass hums and breathes where a beam pushes', () => {
	const hold = layerById(soundFor('levitation', 'fire'), 'hold-levitation');
	const jet = layerById(soundFor('column-balanced', 'fire'), 'jet-aim');
	assert.ok((hold.motion.toneMix ?? 0) > 0.5);
	assert.ok(hold.motion.tremoloHz > 0);
	assert.equal(jet.motion.toneMix, null);
	assert.ok(jet.motion.sweep.to > jet.motion.sweep.from);
});
