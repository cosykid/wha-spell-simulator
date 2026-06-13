import { readFileSync, readdirSync } from 'node:fs';

import { Client } from 'pg';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadDotEnv } from './load-env.js';

loadDotEnv();

const connectionString = process.env.DATABASE_URL_VPS;

if (!connectionString) {
	throw new Error('Set DATABASE_URL_VPS before running migrations.');
}

/** Resolve TLS from the URL's `sslmode`; mirrors src/lib/server/storage/db.ts. */
function sslFor(url: string) {
	const sslmode = url.match(/[?&]sslmode=([^&]+)/)?.[1];
	if (!sslmode || sslmode === 'disable') {
		return undefined;
	}
	return sslmode === 'verify-ca' || sslmode === 'verify-full'
		? { rejectUnauthorized: true }
		: { rejectUnauthorized: false };
}

const client = new Client({ connectionString, ssl: sslFor(connectionString) });
await client.connect();

try {
	const migrationDir = fileURLToPath(new URL('../migrations', import.meta.url));
	const files = readdirSync(migrationDir)
		.filter((file) => file.endsWith('.sql'))
		.sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

	for (const file of files) {
		const body = readFileSync(join(migrationDir, file), 'utf8').trim();
		if (!body) {
			continue;
		}
		const statements = body
			.split(/;\s*(?:\n|$)/)
			.map((statement) => statement.trim())
			.filter(Boolean);
		for (const statement of statements) {
			await client.query(statement);
		}
		console.log(`applied ${file}`);
	}
} finally {
	await client.end();
}
