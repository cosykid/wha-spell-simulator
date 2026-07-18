create table if not exists spell_upvotes (
	spell_id text not null references spells(id) on delete cascade,
	user_id text not null references users(id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (spell_id, user_id)
);
