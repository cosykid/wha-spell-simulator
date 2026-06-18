-- Normalise the legacy plural Aeriform sigil id to the canonical Aeroform id.
-- Some samples were captured under 'aeriforms'; current code uses 'aeroform'.
--
-- Idempotent: the migration runner re-applies every file on each run, and these
-- updates match nothing once the data is already normalised.
update labelled_samples
	set sign_id = 'aeroform'
	where sign_id = 'aeriforms';

update labelled_samples
	set label = jsonb_set(label, '{signId}', '"aeroform"'::jsonb)
	where label->>'signId' = 'aeriforms';
