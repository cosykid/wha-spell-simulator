-- The polylines a library plate draws, built when the spell is stored so the
-- feed never reads the drawing behind it. Backfill existing rows with
-- `npm run spells:backfill-thumbnails`, which needs the baking code and so
-- cannot run here.
alter table spells
	add column if not exists thumbnail jsonb;
