import assert from 'node:assert/strict';
import test from 'node:test';

import { SESSION_MARKER_COOKIE, hasSessionMarker } from '../src/lib/auth/sessionMarker.js';

const marker = `${SESSION_MARKER_COOKIE}=1`;

test('no cookies at all reads as a guest', () => {
	assert.equal(hasSessionMarker(''), false);
});

test('the marker is found first, last, and in the middle', () => {
	assert.equal(hasSessionMarker(marker), true);
	assert.equal(hasSessionMarker(`${marker}; theme=dark`), true);
	assert.equal(hasSessionMarker(`theme=dark; ${marker}`), true);
	assert.equal(hasSessionMarker(`theme=dark; ${marker}; seen=1`), true);
});

test('a name that merely ends in the marker is not the marker', () => {
	assert.equal(hasSessionMarker(`other_${marker}`), false);
	assert.equal(hasSessionMarker(`theme=dark; other_${marker}`), false);
});

test('the marker named inside another cookie value is not the marker', () => {
	assert.equal(hasSessionMarker(`last_seen=${marker}`), false);
});

test('the session cookie alone reads as a guest', () => {
	// It is httpOnly, so it never reaches document.cookie in the first place.
	// The marker is the only thing the client may decide on.
	assert.equal(hasSessionMarker('wha_session=abc123'), false);
});
