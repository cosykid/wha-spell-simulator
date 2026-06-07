import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { loadDotEnv } from './load-env.js';

loadDotEnv();

const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;

if (!connectionString) {
	throw new Error('Set DATABASE_URL or NEON_DATABASE_URL before running Neon migrations.');
}

const sql = neon(connectionString);
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
		await sql.query(statement);
	}
	console.log(`applied ${file}`);
}
