/**
 * `EffectStyle` narrowing. Preference loading does no schema validation of its
 * own, so this helper is the only thing standing between stored JSON (or a URL)
 * and a style the app cannot build an engine for.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	DEFAULT_EFFECT_STYLE,
	EFFECT_STYLES,
	effectStyleFrom,
	effectStyleFromSearch
} from '../src/lib/structures/effectStyle.js';

test('every declared style narrows to itself', () => {
	for (const style of EFFECT_STYLES) {
		assert.equal(effectStyleFrom(style), style);
	}
});

test('anything else falls back to the default', () => {
	for (const value of ['', 'field', 'cast', 'STAGE', null, undefined]) {
		assert.equal(effectStyleFrom(value), DEFAULT_EFFECT_STYLE);
	}
});

test('the stage is the default, so an existing caster sees no change', () => {
	assert.equal(DEFAULT_EFFECT_STYLE, 'stage');
});

test('a page that did not ask for a style gets null rather than the default', () => {
	assert.equal(effectStyleFromSearch(''), null);
	assert.equal(effectStyleFromSearch('?preset=none'), null);
	assert.equal(effectStyleFromSearch('?engine=parcel'), null);
});

test('a page that asked gets what it asked for', () => {
	assert.equal(effectStyleFromSearch('?engine=classic'), 'classic');
	assert.equal(effectStyleFromSearch('?preset=none&engine=stage'), 'stage');
});
