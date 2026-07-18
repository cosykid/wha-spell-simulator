import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fallbackPasswordHash,
	hashPassword,
	verifyPassword
} from '../src/lib/server/auth/password.js';

test('hashes verify their own password and reject others', async () => {
	const stored = await hashPassword('correct horse battery');
	assert.equal(await verifyPassword('correct horse battery', stored), true);
	assert.equal(await verifyPassword('correct horse battery!', stored), false);
	assert.equal(await verifyPassword('', stored), false);
});

test('stored hashes are self-describing and salted', async () => {
	const first = await hashPassword('same password');
	const second = await hashPassword('same password');
	assert.notEqual(first, second);
	const parts = first.split('$');
	assert.equal(parts.length, 6);
	assert.equal(parts[0], 'scrypt');
	assert.ok(Number(parts[1]) > 0);
});

test('verify tolerates malformed stored values', async () => {
	assert.equal(await verifyPassword('anything', ''), false);
	assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
	assert.equal(await verifyPassword('anything', 'scrypt$x$y$z$!!$!!'), false);
	assert.equal(await verifyPassword('anything', 'bcrypt$1$2$3$aaaa$bbbb'), false);
});

test('fallback hash never verifies real input and is computed once', async () => {
	const [first, second] = await Promise.all([fallbackPasswordHash(), fallbackPasswordHash()]);
	assert.equal(first, second);
	assert.equal(await verifyPassword('any guess at all', first), false);
});
