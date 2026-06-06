import { buildExamplesFromDictionary, type RecognitionExample } from '../../parser/shapeMatcher.js';
import type { Dictionary, Point, RecognitionKind } from '../../types.js';
import { getNeonSql, type NeonSql } from './neon.js';

interface RecognitionExampleRow {
	id: string;
	kind: RecognitionKind;
	symbol_id: string;
	strokes: Point[][];
	source: string;
	rotation_invariant: boolean;
	allowed_rotations_deg: number[] | null;
}

function rowToExample(row: RecognitionExampleRow): RecognitionExample {
	if (row.kind !== 'sigil' && row.kind !== 'sign') {
		throw new Error(`Unsupported recognition example kind: ${row.kind}`);
	}

	return {
		id: row.id,
		kind: row.kind,
		symbolId: row.symbol_id,
		strokes: row.strokes,
		source: row.source,
		rotationInvariant: row.rotation_invariant,
		allowedRotationsDeg: row.allowed_rotations_deg ?? undefined
	};
}

export async function listRecognitionExamples(
	sql: NeonSql = getNeonSql()
): Promise<RecognitionExample[]> {
	const rows = (await sql.query(
		`
			select id,
			       kind,
			       symbol_id,
			       strokes,
			       source,
			       rotation_invariant,
			       allowed_rotations_deg
			from recognition_examples
			where active = true
			order by source, kind, symbol_id, id
		`
	)) as RecognitionExampleRow[];

	return rows.map(rowToExample);
}

export async function upsertRecognitionExamples(
	examples: RecognitionExample[],
	sql: NeonSql = getNeonSql()
): Promise<void> {
	for (const example of examples) {
		await sql.query(
			`
				insert into recognition_examples (
					id,
					kind,
					symbol_id,
					strokes,
					source,
					rotation_invariant,
					allowed_rotations_deg,
					active
				)
				values ($1, $2, $3, $4::jsonb, $5, $6, $7::int[], true)
				on conflict (id) do update set
					kind = excluded.kind,
					symbol_id = excluded.symbol_id,
					strokes = excluded.strokes,
					source = excluded.source,
					rotation_invariant = excluded.rotation_invariant,
					allowed_rotations_deg = excluded.allowed_rotations_deg,
					active = true,
					updated_at = now()
			`,
			[
				example.id,
				example.kind,
				example.symbolId,
				JSON.stringify(example.strokes),
				example.source,
				example.rotationInvariant,
				example.allowedRotationsDeg ?? null
			]
		);
	}
}

export async function seedDictionaryRecognitionExamples(
	dictionary: Dictionary,
	sql: NeonSql = getNeonSql()
): Promise<void> {
	await upsertRecognitionExamples(buildExamplesFromDictionary(dictionary), sql);
}
