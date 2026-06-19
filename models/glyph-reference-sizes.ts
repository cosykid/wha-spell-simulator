#!/usr/bin/env node
/**
 * Dumps, per glyph class, how big contributors actually draw it — so the
 * `referenceSizeNorm` baselines for both sigils and signs in the dictionary can
 * be seeded from data instead of guessed.
 *
 * The signal is each labelled sample's `label.scale_x/scale_y`, defined as
 * `renderedSizePx / referenceSizePx` (see `structures/labelledSample.ts`). We
 * reduce the two axes to a single drawn extent with `greatest(scale_x, scale_y)`
 * to mirror the recognizer's `sizeNorm = max(width, height) / ringDiameter`, then
 * take per-class percentiles. The median is the "regular" drawn size for that
 * glyph, in units of its own reference art.
 *
 * IMPORTANT — this is a seed, not ground truth. The labelled samples are isolated
 * single-glyph captures with NO ring, so the measure lives in a reference-SVG
 * frame, not the ring-relative frame `referenceSizeNorm` actually uses. The
 * suggested values below convert by *anchoring*: the mean of the per-sigil medians
 * is mapped to `renderer.effectSize.defaultReferenceSizeNorm`, so the population
 * keeps today's average effect scale while each glyph's value reflects how big it
 * is drawn relative to the others. Signs reuse the same sigil-anchored conversion
 * (a `scale` of 1.0 means the same reference-pixel size for both), so sign and
 * sigil baselines stay comparable. Treat the numbers as a starting point to review
 * by eye, not a finished tuning.
 *
 * Usage:
 *   npm run glyphs:reference-sizes
 *   npm run glyphs:reference-sizes -- --review-status all
 *   npm run glyphs:reference-sizes -- --anchor 0.3
 *
 * Requires DATABASE_URL_VPS (read from .env / .env.local, like db:migrate).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { Client } from 'pg';

import { CONFIG } from '../src/lib/config.js';
import {
	normalizePostgresConnectionString,
	sslFor
} from '../src/lib/server/storage/postgresConnection.js';
import { loadDotEnv } from '../scripts/load-env.js';

interface ClassStats {
	signId: string;
	n: number;
	p25: number;
	median: number;
	p75: number;
}

interface Args {
	reviewStatus: 'approved' | 'all';
	anchor: number;
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		reviewStatus: 'approved',
		anchor: CONFIG.renderer.effectSize.defaultReferenceSizeNorm
	};
	for (let i = 0; i < argv.length; i += 1) {
		const flag = argv[i];
		if (flag === '--review-status') {
			const value = argv[(i += 1)];
			if (value !== 'approved' && value !== 'all') {
				throw new Error(`--review-status must be 'approved' or 'all', got '${value}'`);
			}
			args.reviewStatus = value;
		} else if (flag === '--anchor') {
			const value = Number(argv[(i += 1)]);
			if (!Number.isFinite(value) || value <= 0) {
				throw new Error(`--anchor must be a positive number, got '${argv[i]}'`);
			}
			args.anchor = value;
		} else {
			throw new Error(`Unknown argument '${flag}'`);
		}
	}
	return args;
}

/** Ids of the dictionary glyphs under sigils/ or signs/; both kinds get a `referenceSizeNorm`. */
function loadGlyphIds(subdir: 'sigils' | 'signs'): Set<string> {
	const dir = fileURLToPath(new URL(`../src/lib/dictionary/${subdir}`, import.meta.url));
	const ids = new Set<string>();
	for (const file of readdirSync(dir)) {
		if (!file.endsWith('.json')) {
			continue;
		}
		const entry = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { id?: string };
		if (entry.id) {
			ids.add(entry.id);
		}
	}
	return ids;
}

async function fetchClassStats(
	client: Client,
	reviewStatus: Args['reviewStatus']
): Promise<ClassStats[]> {
	// `greatest(scale_x, scale_y)` is the drawn extent in reference-glyph units,
	// mirroring the recognizer's max(width, height) footprint measure. Guard against
	// missing/garbage label values so a stray row cannot skew the percentiles.
	const filter = reviewStatus === 'approved' ? `WHERE review_status::text = 'approved'` : '';
	const result = await client.query<{
		sign_id: string;
		n: string;
		p25: string;
		median: string;
		p75: string;
	}>(
		`
		SELECT
			sign_id,
			count(*)::int AS n,
			percentile_cont(0.25) WITHIN GROUP (ORDER BY ext) AS p25,
			percentile_cont(0.50) WITHIN GROUP (ORDER BY ext) AS median,
			percentile_cont(0.75) WITHIN GROUP (ORDER BY ext) AS p75
		FROM (
			SELECT
				sign_id,
				greatest((label ->> 'scale_x')::float8, (label ->> 'scale_y')::float8) AS ext
			FROM labelled_samples
			${filter}
		) s
		WHERE ext > 0 AND ext < 100
		GROUP BY sign_id
		ORDER BY sign_id
		`
	);

	return result.rows.map((row) => ({
		signId: row.sign_id,
		n: Number(row.n),
		p25: Number(row.p25),
		median: Number(row.median),
		p75: Number(row.p75)
	}));
}

function pad(value: string, width: number): string {
	return value.padEnd(width);
}

function fmt(value: number): string {
	return value.toFixed(3);
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	loadDotEnv();

	const connectionString = process.env.DATABASE_URL_VPS;
	if (!connectionString) {
		throw new Error('Set DATABASE_URL_VPS before running glyph-reference-sizes.');
	}
	const normalized = normalizePostgresConnectionString(connectionString);
	const client = new Client({ connectionString: normalized, ssl: sslFor(normalized) });
	await client.connect();

	let stats: ClassStats[];
	try {
		stats = await fetchClassStats(client, args.reviewStatus);
	} finally {
		await client.end();
	}

	if (!stats.length) {
		console.log(`No samples found (review-status: ${args.reviewStatus}).`);
		return;
	}

	const sigilIds = loadGlyphIds('sigils');
	const signIds = loadGlyphIds('signs');
	const isGlyph = (id: string): boolean => sigilIds.has(id) || signIds.has(id);
	const kindOf = (id: string): string =>
		sigilIds.has(id) ? 'sigil' : signIds.has(id) ? 'sign' : 'other';
	const sigilStats = stats.filter((row) => sigilIds.has(row.signId));

	// Anchor the mean of the per-sigil medians to the configured default so sigils
	// cluster around today's behavior while keeping their relative differences.
	// Signs reuse this same conversion factor so their baselines stay comparable.
	const meanSigilMedian = sigilStats.length
		? sigilStats.reduce((sum, row) => sum + row.median, 0) / sigilStats.length
		: 0;
	const scaleToRef = meanSigilMedian > 0 ? args.anchor / meanSigilMedian : 0;
	const suggested = (median: number): number => Math.round(scaleToRef * median * 1000) / 1000;

	console.log(`Glyph reference-size report (review-status: ${args.reviewStatus})`);
	console.log(
		`Drawn extent = greatest(scale_x, scale_y), in reference-glyph units. ` +
			`Suggested referenceSizeNorm anchors the mean sigil median to ${fmt(args.anchor)}.`
	);
	console.log('');
	console.log(
		`${pad('glyph', 22)}${pad('kind', 7)}${pad('n', 7)}${pad('p25', 9)}${pad('median', 9)}${pad('p75', 9)}suggestedRef`
	);
	console.log('-'.repeat(78));
	for (const row of stats) {
		console.log(
			`${pad(row.signId, 22)}${pad(kindOf(row.signId), 7)}${pad(String(row.n), 7)}` +
				`${pad(fmt(row.p25), 9)}${pad(fmt(row.median), 9)}${pad(fmt(row.p75), 9)}` +
				`${isGlyph(row.signId) ? fmt(suggested(row.median)) : '-'}`
		);
	}

	// Only dictionary glyphs get a suggestion; sampled-but-undictionaried classes are skipped.
	const refMap = Object.fromEntries(
		stats.filter((row) => isGlyph(row.signId)).map((row) => [row.signId, suggested(row.median)])
	);
	console.log('');
	console.log('Suggested referenceSizeNorm (paste into each sigil/sign JSON, then review):');
	console.log(JSON.stringify(refMap, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
