-- Normalise the Billowing sign id to 'billowing' everywhere. The earlier Sample
-- Maker labelled this sign 'billow' (in SAMPLE_SYMBOLS, the svg, and stored
-- samples), while the dictionary already used 'billowing'. Bring stored data in
-- line so signId matches the dictionary and the reference svg (billowing.svg).
--
-- Idempotent: the migration runner re-applies every file on each run, and these
-- updates match nothing once the data is already normalised.
update labelled_samples
	set sign_id = 'billowing'
	where sign_id = 'billow';

update labelled_samples
	set label = jsonb_set(label, '{signId}', '"billowing"'::jsonb)
	where label->>'signId' = 'billow';
