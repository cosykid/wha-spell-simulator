create table if not exists users (
	id text primary key,
	username text not null,
	password_hash text not null,
	created_at timestamptz not null default now()
);

create unique index if not exists users_username_lower_key
	on users (lower(username));
