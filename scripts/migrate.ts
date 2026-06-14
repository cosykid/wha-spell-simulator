import { readFileSync, readdirSync } from 'node:fs';

import { Client } from 'pg';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadDotEnv } from './load-env.js';
import {
	normalizePostgresConnectionString,
	sslFor
} from '../src/lib/server/storage/postgresConnection.js';

loadDotEnv();

const connectionString = process.env.DATABASE_URL_VPS;

if (!connectionString) {
	throw new Error('Set DATABASE_URL_VPS before running migrations.');
}

const normalizedConnectionString = normalizePostgresConnectionString(connectionString);

const client = new Client({
	connectionString: normalizedConnectionString,
	ssl: sslFor(normalizedConnectionString)
});
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
