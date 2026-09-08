/**
 * @file Fills in the `thumbnail` column for spells stored before it existed.
 *
 * Migration 014 adds the column; the polylines in it can only be built by the
 * baking code, so they are written from here. Idempotent: rows that already
 * carry a thumbnail are left alone unless `--all` asks for a rebuild, which is
 * what to run after changing how a thumbnail is built.
 *
 * @example
 * ```sh
 * npm run spells:backfill-thumbnails          # rows missing a thumbnail
 * npm run spells:backfill-thumbnails -- --all # every row, rebuilt
 * ```
 */
import { Client } from 'pg';

import { buildSpellThumbnail } from '../src/lib/structures/spellThumbnail.js';
import {
	normalizePostgresConnectionString,
	sslFor
} from '../src/lib/server/storage/postgresConnection.js';
import type { SpellPresetData } from '../src/lib/structures/spellPreset.js';
import { loadDotEnv } from './load-env.js';

loadDotEnv();

const connectionString = process.env.DATABASE_URL_VPS;
if (!connectionString) {
	throw new Error('Set DATABASE_URL_VPS before backfilling thumbnails.');
}

const rebuildAll = process.argv.includes('--all');
const normalized = normalizePostgresConnectionString(connectionString);
const client = new Client({ connectionString: normalized, ssl: sslFor(normalized) });
await client.connect();

try {
	const { rows } = await client.query<{ id: string; data: SpellPresetData }>(
		`select id, data from spells ${rebuildAll ? '' : 'where thumbnail is null'} order by id`
	);
	console.log(`${rows.length} spell${rows.length === 1 ? '' : 's'} to build`);

	let empty = 0;
	for (const row of rows) {
		const thumbnail = buildSpellThumbnail(row.data);
		if (thumbnail.length === 0) {
			// Worth naming: a seal that draws as bare paper is a row whose preset
			// no longer reads, not a row this script skipped.
			empty += 1;
			console.warn(`  ${row.id} produced no polylines`);
		}
		await client.query('update spells set thumbnail = $2 where id = $1', [
			row.id,
			JSON.stringify(thumbnail)
		]);
	}
	console.log(`done: ${rows.length - empty} drawn, ${empty} empty`);
} finally {
	await client.end();
}
