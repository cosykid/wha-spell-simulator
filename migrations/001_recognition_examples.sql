create table if not exists recognition_examples (
	id text primary key,
	kind text not null check (kind in ('sigil', 'sign')),
	symbol_id text not null,
	strokes jsonb not null,
	source text not null,
	rotation_invariant boolean not null default false,
	allowed_rotations_deg int[],
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists recognition_examples_lookup_idx
	on recognition_examples (active, kind, symbol_id, source);
