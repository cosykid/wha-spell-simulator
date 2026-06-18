-- Canonicalise the Aeroform sample id. Historical submissions used a mix of
-- aeriform/aeriforms/aeroforms spellings; the dictionary and UI now use the
-- singular id 'aeroform' and display label 'Aeroform'.
--
-- Idempotent: once rows are normalised, these updates match nothing.
update labelled_samples
	set sign_id = 'aeroform'
	where lower(sign_id) in ('aeriform', 'aeriforms', 'aeroform', 'aeroforms')
		and sign_id <> 'aeroform';

update labelled_samples
	set label = jsonb_set(label, '{signId}', '"aeroform"'::jsonb)
	where lower(label->>'signId') in ('aeriform', 'aeriforms', 'aeroform', 'aeroforms')
		and label->>'signId' <> 'aeroform';
