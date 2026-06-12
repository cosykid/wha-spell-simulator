-- Add active cosmetic selection columns to existing gacha_profiles tables.
alter table gacha_profiles
	add column if not exists active_ink_color_id text,
	add column if not exists active_effect_id text;
