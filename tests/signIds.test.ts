import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizeSignId } from '../src/lib/dictionary/signIds.js';

test('canonicalizes legacy Aeroform sample ids', () => {
	for (const signId of [
		'aeroform',
		'Aeroform',
		'aeroforms',
		'Aeroforms',
		'aeriform',
		'aeriforms'
	]) {
		assert.equal(canonicalizeSignId(signId), 'aeroform');
	}

	assert.equal(canonicalizeSignId('wind-underfoot'), 'wind-underfoot');
});
