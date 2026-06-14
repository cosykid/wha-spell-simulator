import assert from 'node:assert/strict';
import test from 'node:test';

import {
	normalizePostgresConnectionString,
	sslFor
} from '../src/lib/server/storage/postgresConnection.js';

test('normalizes libpq system trust-store URLs for node-postgres', () => {
	const normalized = normalizePostgresConnectionString(
		'postgresql://user:pass@example.com/db?sslrootcert=system'
	);
	const url = new URL(normalized);

	assert.equal(url.searchParams.get('sslrootcert'), null);
	assert.equal(url.searchParams.get('sslmode'), 'verify-full');
	assert.deepEqual(sslFor(normalized), { rejectUnauthorized: true });
});

test('preserves explicit sslmode when dropping sslrootcert=system', () => {
	const normalized = normalizePostgresConnectionString(
		'postgresql://user:pass@example.com/db?sslmode=require&sslrootcert=system'
	);
	const url = new URL(normalized);

	assert.equal(url.searchParams.get('sslrootcert'), null);
	assert.equal(url.searchParams.get('sslmode'), 'require');
	assert.deepEqual(sslFor(normalized), { rejectUnauthorized: false });
});
