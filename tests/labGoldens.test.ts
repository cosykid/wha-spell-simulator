/**
 * The look golden tier's URL hook. `readGoldenFrameRequest` decides whether the
 * lab runs its live clock or freezes on one scripted frame, so a URL it reads
 * too loosely costs the lab its animation on every deep link.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	labSigilFrom,
	readGoldenFrameRequest
} from '../src/routes/tools/spell-effect-lab/lab-goldens.js';
import { DEFAULT_SIGIL } from '../src/lib/ui/spellEffectLab.js';

function labUrl(search: string): URL {
	return new URL(`https://example.test/tools/spell-effect-lab${search}`);
}

test('a preset with a frame is a golden request', () => {
	assert.deepEqual(readGoldenFrameRequest(labUrl('?preset=column-balanced&frameMs=1600')), {
		presetId: 'column-balanced',
		frameMs: 1600,
		sigil: DEFAULT_SIGIL
	});
});

test('frame zero is a golden request, not a missing frame', () => {
	assert.equal(readGoldenFrameRequest(labUrl('?preset=column-balanced&frameMs=0'))?.frameMs, 0);
});

test('a preset alone stays on the live clock', () => {
	assert.equal(readGoldenFrameRequest(labUrl('?preset=column-balanced')), null);
});

test('a blank or unreadable frame stays on the live clock', () => {
	for (const search of [
		'?preset=column-balanced&frameMs=',
		'?preset=column-balanced&frameMs=%20',
		'?preset=column-balanced&frameMs=soon',
		'?preset=column-balanced&frameMs=-1',
		'?preset=column-balanced&frameMs=Infinity'
	]) {
		assert.equal(readGoldenFrameRequest(labUrl(search)), null, search);
	}
});

test('a frame without a preset stays on the live clock', () => {
	assert.equal(readGoldenFrameRequest(labUrl('?frameMs=1600')), null);
	assert.equal(readGoldenFrameRequest(labUrl('')), null);
});

test('the sigil is narrowed against the lab list', () => {
	assert.equal(
		readGoldenFrameRequest(labUrl('?preset=column-balanced&frameMs=1600&sigil=crystal'))?.sigil,
		'crystal'
	);
	assert.equal(
		readGoldenFrameRequest(labUrl('?preset=column-balanced&frameMs=1600&sigil=obsidian'))?.sigil,
		DEFAULT_SIGIL
	);
});

test('labSigilFrom falls back for a missing or unknown sigil', () => {
	assert.equal(labSigilFrom('fire'), 'fire');
	assert.equal(labSigilFrom('obsidian'), DEFAULT_SIGIL);
	assert.equal(labSigilFrom(null), DEFAULT_SIGIL);
});
