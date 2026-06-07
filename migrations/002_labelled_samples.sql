create table if not exists labelled_samples (
	id text primary key,
	sign_id text not null,
	schema_version int not null,
	data jsonb not null,
	label jsonb not null,
	meta jsonb not null,
	data_hash text generated always as (md5(data::text)) stored,
	captured_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	constraint labelled_samples_data_hash_key unique (data_hash)
);

create index if not exists labelled_samples_sign_idx
	on labelled_samples (sign_id, captured_at desc);
