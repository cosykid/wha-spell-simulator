-- Optional contributor attribution from the Sample Maker. The username is also
-- carried inside the `meta` jsonb blob (so it round-trips with the sample), but we
-- mirror it into a dedicated column — the way `sign_id` is — so the Sample Reviewer
-- can search by it without reaching into jsonb. NULL means the contributor left it
-- blank. Small table, so a plain scan backs the case-insensitive search; no index.
alter table labelled_samples
	add column if not exists discord_username text;
