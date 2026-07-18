create table if not exists spells (
	id text primary key,
	user_id text not null references users(id) on delete cascade,
	name text not null,
	data jsonb not null,
	preview_ir jsonb,
	element text,
	published_at timestamptz,
	upvote_count integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists spells_owner_idx
	on spells (user_id, updated_at desc);

create index if not exists spells_library_new_idx
	on spells (published_at desc, id desc)
	where published_at is not null;

create index if not exists spells_library_top_idx
	on spells (upvote_count desc, published_at desc, id desc)
	where published_at is not null;
