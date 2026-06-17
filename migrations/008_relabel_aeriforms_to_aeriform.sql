-- Normalise the Aeriform sigil id to 'aeriform' everywhere. Some samples were
-- captured under the plural 'aeriforms', while the dictionary, the reference svg,
-- and the Sample Maker all use the singular 'aeriform' (07-aeriform.json). Bring
-- stored data in line so signId matches the dictionary and the trained model sees
-- the aeriform sigil's samples under its real class id instead of an orphan class.
--
-- Idempotent: the migration runner re-applies every file on each run, and these
-- updates match nothing once the data is already normalised.
update labelled_samples
	set sign_id = 'aeriform'
	where sign_id = 'aeriforms';

update labelled_samples
	set label = jsonb_set(label, '{signId}', '"aeriform"'::jsonb)
	where label->>'signId' = 'aeriforms';
