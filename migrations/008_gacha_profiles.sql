-- Per-user gacha state, keyed by Discord username (case-insensitive).
-- Stores currency, spell-symbol inventory, cosmetic inventory, the
-- last free-pull date for both portals independently, and the active
-- cosmetic selections (ink color and drawing effect).
create table if not exists gacha_profiles (
	discord_username text primary key,
	currency integer not null default 0,
	inventory jsonb not null default '{}',
	cosmetic_inventory jsonb not null default '{}',
	free_pull_date text,
	cosmetic_free_pull_date text,
	active_ink_color_id text,
	active_effect_id text,
	updated_at timestamptz not null default now()
);
