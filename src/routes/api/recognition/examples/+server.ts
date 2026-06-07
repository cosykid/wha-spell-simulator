import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

import {
	deactivateRecognitionExample,
	getRecognitionExample,
	queryRecognitionExamples,
	upsertRecognitionExamples,
	type RecognitionExampleQuery
} from '$lib/server/storage/recognitionExampleStore.js';
import { normalizeStrokesForShape } from '$lib/parser/shapeMatcher.js';
import type { Point, RecognitionKind } from '$lib/types.js';
import type { RecognitionExample } from '$lib/parser/shapeMatcher.js';

export const prerender = false;

function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	const [scheme, token] = header.split(/\s+/, 2);
	return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Guards every method of this endpoint with the shared bearer token. Returns a
 * Response to short-circuit the handler when access is denied, or null to allow
 * it. The whole API (reads included) is off until TRAINING_DATA_API_TOKEN is set.
 */
function requireToken(request: Request): Response | null {
	const apiToken = env.TRAINING_DATA_API_TOKEN;
	if (!apiToken) {
		return json(
			{
				ok: false,
				error: 'Training data API is disabled. Set TRAINING_DATA_API_TOKEN to enable it.'
			},
			{ status: 503 }
		);
	}
	if (bearerToken(request) !== apiToken) {
		return json({ ok: false, error: 'Missing or invalid bearer token.' }, { status: 401 });
	}
	return null;
}

function isPoint(value: unknown): value is Point {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Point).x === 'number' &&
		typeof (value as Point).y === 'number'
	);
}

function isStrokeSet(value: unknown): value is Point[][] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every(
			(stroke) =>
				Array.isArray(stroke) && stroke.length > 0 && stroke.every((point) => isPoint(point))
		)
	);
}

function asKind(value: unknown): Exclude<RecognitionKind, 'unknown'> | null {
	return value === 'sigil' || value === 'sign' ? value : null;
}

function roundCoordinate(value: number): number {
	return Number(value.toFixed(6));
}

function canonicalizeStrokeSet(strokes: Point[][]): Point[][] {
	return normalizeStrokesForShape(strokes).strokes.map((stroke) =>
		stroke.map((point) => ({
			x: roundCoordinate(point.x),
			y: roundCoordinate(point.y)
		}))
	);
}

function bodyToExample(body: unknown): RecognitionExample {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Expected a JSON object.');
	}
	const record = body as Record<string, unknown>;
	const kind = asKind(record.kind);
	if (!kind) {
		throw new Error('kind must be "sigil" or "sign".');
	}
	if (typeof record.symbolId !== 'string' || !record.symbolId.trim()) {
		throw new Error('symbolId is required.');
	}
	if (!isStrokeSet(record.strokes)) {
		throw new Error('strokes must be a non-empty Point[][].');
	}

	return {
		id:
			typeof record.id === 'string' && record.id.trim()
				? record.id
				: `user:${kind}:${record.symbolId}:${randomUUID()}`,
		kind,
		symbolId: record.symbolId,
		strokes: canonicalizeStrokeSet(record.strokes),
		source: typeof record.source === 'string' && record.source.trim() ? record.source : 'user',
		rotationInvariant:
			typeof record.rotationInvariant === 'boolean' ? record.rotationInvariant : kind === 'sigil',
		allowedRotationsDeg: Array.isArray(record.allowedRotationsDeg)
			? record.allowedRotationsDeg.filter((value): value is number => typeof value === 'number')
			: undefined
	};
}

function serverError(error: unknown, fallback: string): Response {
	return json(
		{ ok: false, error: error instanceof Error ? error.message : fallback },
		{ status: 500 }
	);
}

/**
 * Reads the corpus. `?id=` fetches one example; otherwise lists all examples,
 * narrowed by the optional `kind`, `symbolId`, `source`, and `active` filters.
 * Inactive (soft-deleted) rows are included unless `active=true` is passed.
 */
export async function GET({ request, url }) {
	const denied = requireToken(request);
	if (denied) {
		return denied;
	}

	try {
		const id = url.searchParams.get('id');
		if (id) {
			const example = await getRecognitionExample(id);
			if (!example) {
				return json({ ok: false, error: `No example with id "${id}".` }, { status: 404 });
			}
			return json({ ok: true, example });
		}

		const query: RecognitionExampleQuery = {};
		const kind = asKind(url.searchParams.get('kind'));
		if (kind) {
			query.kind = kind;
		}
		const symbolId = url.searchParams.get('symbolId');
		if (symbolId) {
			query.symbolId = symbolId;
		}
		const source = url.searchParams.get('source');
		if (source) {
			query.source = source;
		}
		const active = url.searchParams.get('active');
		if (active === 'true') {
			query.active = true;
		} else if (active === 'false') {
			query.active = false;
		}

		const examples = await queryRecognitionExamples(query);
		return json({ ok: true, count: examples.length, examples });
	} catch (error) {
		return serverError(error, 'Failed to read recognition examples.');
	}
}

/** Inserts or updates one example (upsert by id). */
export async function POST({ request }) {
	const denied = requireToken(request);
	if (denied) {
		return denied;
	}

	try {
		const example = bodyToExample(await request.json());
		await upsertRecognitionExamples([example]);

		return json({ ok: true, example });
	} catch (error) {
		return json(
			{ ok: false, error: error instanceof Error ? error.message : 'Invalid recognition example.' },
			{ status: 400 }
		);
	}
}

/** Soft-deletes an example (`?id=`) by marking it inactive; the row is retained. */
export async function DELETE({ request, url }) {
	const denied = requireToken(request);
	if (denied) {
		return denied;
	}

	const id = url.searchParams.get('id');
	if (!id) {
		return json({ ok: false, error: 'An "id" query parameter is required.' }, { status: 400 });
	}

	try {
		const deactivated = await deactivateRecognitionExample(id);
		if (!deactivated) {
			return json({ ok: false, error: `No example with id "${id}".` }, { status: 404 });
		}
		return json({ ok: true, id, active: false });
	} catch (error) {
		return serverError(error, 'Failed to deactivate recognition example.');
	}
}
