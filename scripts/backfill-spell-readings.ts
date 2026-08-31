#!/usr/bin/env node
/**
 * Give saved spells that predate the Reading and Plan layers a reading and a
 * plan, so the library stops re-reading them on every visit.
 *
 * A row saved before those layers landed stores scalars and nothing else. The
 * stage engine performs a plan, so `ui/library/reviveSpell.ts` re-classifies the
 * whole drawing in the browser before such a card can preview, every session,
 * for every visitor. The drawing does not change and neither does the reading it
 * yields, so the work belongs in the row, once.
 *
 * The reading has to be computed in a browser: the ML pass is what reads a sign's
 * rotation, and it needs WebGPU and a canvas. So this drives a headless Chromium
 * against a running dev server and calls the same `reviveSpellIr` the library
 * calls, then writes the reading and plan it returns back onto the stored IR.
 * Nothing else about the row is touched, `updated_at` included, so a backfill
 * cannot reshuffle anyone's grimoire.
 *
 * Rows saved since the layers landed already carry both and are skipped, so this
 * is a one-shot: there is no ongoing source of rows that need it.
 *
 * Usage:
 *   npm run dev                                                     # in another terminal
 *   node --import tsx scripts/backfill-spell-readings.ts            # dry run, changes nothing
 *   node --import tsx scripts/backfill-spell-readings.ts --write
 *
 *   --base-url <url>   where the dev server is (default http://127.0.0.1:5173)
 *   --limit <n>        stop after n rows, for a careful first pass
 *   --id <spell:...>   one row only; repeatable
 *   --headless         run without a window; see the WebGPU note below
 *   --allow-reread     also write rows whose re-read names a different sigil
 *
 * Check which database `DATABASE_URL_VPS` names before writing. The script
 * prints the host it is about to touch and will not write without `--write`.
 *
 * The window is not decoration: headless Chromium exposes no WebGPU adapter, so
 * ONNX falls back to its wasm backend and every row takes several times longer.
 * That is why the run is headed by default, and why it says which backend it got.
 */
import { chromium, type Page } from '@playwright/test';
import pg from 'pg';

import { loadDotEnv } from './load-env.js';
import { MAX_PREVIEW_IR_BYTES } from '../src/lib/structures/savedSpell.js';
import {
	normalizePostgresConnectionString,
	sslFor
} from '../src/lib/server/storage/postgresConnection.js';
import type { NavigatorWithGpu } from '../src/lib/parser/ml/types.js';
import type { SpellPresetData } from '../src/lib/structures/spellPreset.js';
import type { SpellIR } from '../src/lib/types.js';

/** A legacy row and what the browser made of it. */
interface StaleSpell {
	id: string;
	name: string;
	data: SpellPresetData;
	previewIr: SpellIR;
}

interface Options {
	write: boolean;
	baseUrl: string;
	limit: number | null;
	ids: string[];
	headless: boolean;
	allowReread: boolean;
}

/** Longest one row may take to classify before it is left for a later run. */
const REVIVE_TIMEOUT_MS = 60_000;

function parseOptions(argv: string[]): Options {
	const options: Options = {
		write: false,
		baseUrl: 'http://127.0.0.1:5173',
		limit: null,
		ids: [],
		headless: false,
		allowReread: false
	};
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag === '--write') options.write = true;
		else if (flag === '--headless') options.headless = true;
		else if (flag === '--allow-reread') options.allowReread = true;
		else if (flag === '--base-url') options.baseUrl = argv[(index += 1)];
		else if (flag === '--limit') options.limit = Number(argv[(index += 1)]);
		else if (flag === '--id') options.ids.push(argv[(index += 1)]);
		else throw new Error(`unknown argument ${flag}`);
	}
	if (options.limit !== null && !Number.isFinite(options.limit)) {
		throw new Error('--limit needs a number');
	}
	return options;
}

/** The database host, for the line printed before anything is written. */
function describeTarget(connectionString: string): string {
	try {
		const url = new URL(connectionString);
		return `${url.host}${url.pathname}`;
	} catch {
		return 'an unparseable connection string';
	}
}

async function staleSpells(client: pg.Client, options: Options): Promise<StaleSpell[]> {
	const filters = [
		"(preview_ir->>'valid')::boolean is true",
		"(preview_ir->'plan' is null or preview_ir->'reading' is null)"
	];
	const params: string[][] = [];
	if (options.ids.length) {
		filters.push('id = any($1)');
		params.push(options.ids);
	}
	const limit = options.limit === null ? '' : ` limit ${Math.max(0, Math.floor(options.limit))}`;
	const result = await client.query(
		`select id, name, data, preview_ir
		 from spells
		 where ${filters.join(' and ')}
		 order by published_at desc nulls last, id${limit}`,
		params
	);
	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		data: row.data as SpellPresetData,
		previewIr: row.preview_ir as SpellIR
	}));
}

/** The four fields a revival adds to a legacy row. */
interface RevivedFields {
	reading: SpellIR['reading'] | null;
	plan: SpellIR['plan'] | null;
	sigil: SpellIR['sigil'];
	element: SpellIR['element'];
}

/**
 * The reading and plan the library would derive for this row, read out of a real
 * browser.
 *
 * `reviveSpellIr` memoizes on the stored signature, and a legacy signature
 * predates `planDigest`, so two different drawings can share one. The row id
 * stands in for it here to keep each row's classification its own. Only the four
 * fields a revival adds are taken back; the stored row supplies the rest.
 *
 * The ML wait is raised well past the card's own, because the card may settle
 * for the template pass and a row being written down may not: a facing the
 * model never got to read would be stored as though it had.
 */
async function reviveInBrowser(page: Page, spell: StaleSpell): Promise<RevivedFields> {
	return page.evaluate(
		async ({ data, previewIr, cacheKey, modulePath, mlWaitMs }): Promise<RevivedFields> => {
			const module = (await import(/* @vite-ignore */ modulePath)) as {
				reviveSpellIr: (
					data: unknown,
					stored: unknown,
					options: { mlWaitMs: number }
				) => Promise<Partial<SpellIR> | undefined>;
			};
			const revived = await module.reviveSpellIr(
				data,
				{ ...previewIr, signature: cacheKey },
				{ mlWaitMs }
			);
			return {
				reading: revived?.reading ?? null,
				plan: revived?.plan ?? null,
				sigil: revived?.sigil ?? null,
				element: revived?.element ?? null
			};
		},
		{
			data: spell.data,
			previewIr: spell.previewIr,
			cacheKey: spell.id,
			modulePath: '/src/lib/ui/library/reviveSpell.ts',
			mlWaitMs: REVIVE_TIMEOUT_MS
		}
	);
}

loadDotEnv();

const options = parseOptions(process.argv.slice(2));
const connectionString = process.env.DATABASE_URL_VPS;
if (!connectionString) {
	throw new Error('Set DATABASE_URL_VPS before running the backfill.');
}
const normalized = normalizePostgresConnectionString(connectionString);

/**
 * Runs one turn at the database on its own connection.
 *
 * Reading and writing are separate turns with the whole browser pass between
 * them, and a pooled Postgres drops a connection left idle that long, so the
 * script never holds one across the classification.
 */
async function withDatabase<T>(job: (client: pg.Client) => Promise<T>): Promise<T> {
	const client = new pg.Client({ connectionString: normalized, ssl: sslFor(normalized) });
	await client.connect();
	try {
		return await job(client);
	} finally {
		await client.end();
	}
}

const stale = await withDatabase((client) => staleSpells(client, options));
console.log(`${options.write ? 'WRITING TO' : 'dry run against'} ${describeTarget(normalized)}`);
console.log(`${stale.length} spell${stale.length === 1 ? '' : 's'} with no plan\n`);

if (!stale.length) {
	process.exit(0);
}

const browser = await chromium.launch({ headless: options.headless });
const page = await browser.newPage();
/** Row id to the encoded IR that replaces its stored one, and the element column to match it. */
const pending = new Map<string, { encoded: string; element: SpellIR['element'] }>();
let rewritten = 0;
let skipped = 0;

try {
	await page.goto(options.baseUrl, { waitUntil: 'load' });
	// The dev server serves the app's own modules, which is what this borrows.
	await page.waitForFunction(() => Boolean(document.querySelector('canvas')), null, {
		timeout: REVIVE_TIMEOUT_MS
	});

	const webGpu = await page.evaluate(async () => {
		try {
			return Boolean(await (navigator as NavigatorWithGpu).gpu?.requestAdapter?.());
		} catch {
			return false;
		}
	});
	console.log(
		webGpu
			? 'reading through WebGPU\n'
			: 'no WebGPU adapter here, so inference falls back to wasm and each row takes several times longer\n'
	);

	for (const spell of stale) {
		const label = `${spell.id.slice(0, 14)}… ${spell.name.slice(0, 24).padEnd(26)}`;
		let revived;
		try {
			revived = await reviveInBrowser(page, spell);
		} catch (error) {
			console.log(`${label} FAILED  ${error instanceof Error ? error.message : String(error)}`);
			skipped += 1;
			continue;
		}
		if (!revived.reading || !revived.plan) {
			console.log(`${label} no reading came back, left alone`);
			skipped += 1;
			continue;
		}

		const nextIr: SpellIR = {
			...spell.previewIr,
			reading: revived.reading,
			plan: revived.plan,
			sigil: revived.sigil ?? spell.previewIr.sigil,
			element: revived.element ?? spell.previewIr.element
		};
		const encoded = JSON.stringify(nextIr);
		if (encoded.length > MAX_PREVIEW_IR_BYTES) {
			console.log(`${label} ${encoded.length}B over the ${MAX_PREVIEW_IR_BYTES}B cap, left alone`);
			skipped += 1;
			continue;
		}

		// A re-read can name a different sigil than the row was saved with. The
		// library already shows that re-reading today, but writing it makes it the
		// row, and the author named the spell after what they drew: a "Light spell"
		// that comes back as fire is a recognizer disagreement, not a correction.
		// Those rows stay legacy and keep re-reading, exactly as they do now, until
		// someone looks at them.
		if (revived.sigil !== spell.previewIr.sigil || revived.element !== spell.previewIr.element) {
			rewritten += 1;
			console.log(
				`${label} REREAD as ${revived.element ?? '?'}/${revived.sigil ?? '?'}, was ${spell.previewIr.element ?? '?'}/${spell.previewIr.sigil ?? '?'}` +
					(options.allowReread ? '' : ' — left alone')
			);
			if (!options.allowReread) {
				skipped += 1;
				continue;
			}
		}
		const couplings = revived.plan.couplings.length;
		console.log(
			`${label} ${String(revived.element ?? '?').padEnd(7)} ${String(revived.sigil ?? '?').padEnd(18)} ${revived.plan.mode.padEnd(9)} ${couplings} coupling${couplings === 1 ? '' : 's'}  ${encoded.length}B`
		);

		pending.set(spell.id, { encoded, element: nextIr.element });
	}
} finally {
	await browser.close();
}

if (options.write && pending.size) {
	await withDatabase(async (client) => {
		for (const [id, row] of pending) {
			// The card's label reads the element column, not the IR, so the two move
			// together or a re-read spell would be labelled one thing and cast
			// another. updated_at is deliberately left alone: this changes what the
			// row already meant, not when its owner last touched it.
			await client.query('update spells set preview_ir = $2, element = $3 where id = $1', [
				id,
				row.encoded,
				row.element
			]);
		}
	});
}

console.log(
	`\n${options.write ? 'wrote' : 'would write'} ${pending.size}, left ${skipped} alone` +
		`, ${rewritten} re-read to a different sigil or element` +
		(rewritten && !options.allowReread
			? ' (skipped; pass --allow-reread to take the new reading)'
			: '') +
		(options.write ? '' : '\nrun again with --write to apply')
);
