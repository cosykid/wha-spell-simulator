import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';

import { dictionary, sigilRegistry, signRegistry } from '../src/lib/dictionary/dictionaryLoader.js';

// Symbol modules are registered through the generated folder indexes; these
// tests catch a stale index (a module added to the folder but not regenerated
// into it) or a module renamed away from its id.
const STALE_INDEX_HINT = 'Run `npm run gen:dictionary` to regenerate the folder indexes.';

function idsFromFilenames(folder: string): string[] {
	return readdirSync(new URL(`../src/lib/dictionary/${folder}/`, import.meta.url))
		.filter((fileName) => fileName.endsWith('.ts') && fileName !== 'index.ts')
		.map((fileName) => fileName.replace(/^\d+-/, '').replace(/\.ts$/, ''));
}

test('every sigil module is registered under its filename id', () => {
	assert.deepEqual(sigilRegistry.ids().sort(), idsFromFilenames('sigils').sort(), STALE_INDEX_HINT);
});

test('every sign module is registered under its filename id', () => {
	assert.deepEqual(signRegistry.ids().sort(), idsFromFilenames('signs').sort(), STALE_INDEX_HINT);
});

test('entry kinds match their folders', () => {
	for (const entry of sigilRegistry.all()) {
		assert.equal(entry.kind, 'sigil', `sigils/${entry.id} must declare kind: 'sigil'`);
	}
	for (const entry of signRegistry.all()) {
		assert.equal(entry.kind, 'sign', `signs/${entry.id} must declare kind: 'sign'`);
	}
});

test('dictionary views expose the registries', () => {
	assert.deepEqual(
		dictionary.sigils.map((entry) => entry.id),
		sigilRegistry.ids()
	);
	assert.deepEqual(
		dictionary.signs.map((entry) => entry.id),
		signRegistry.ids()
	);
});

test('registry lookups resolve ids and reject unknowns', () => {
	assert.equal(sigilRegistry.require('fire').displayName, 'Fire');
	assert.equal(signRegistry.require('convergence').displayName, 'Convergence');
	assert.equal(sigilRegistry.get('not-a-sigil'), undefined);
	assert.throws(() => sigilRegistry.require('not-a-sigil'), /Unknown dictionary symbol id/);
});
