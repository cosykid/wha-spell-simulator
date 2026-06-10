-- Keyset (seek) pagination on the sample listing orders by (captured_at desc, id desc)
-- and seeks past a cursor with a row-value comparison. This index lets Postgres jump
-- straight to the cursor position instead of sorting the whole table for every page,
-- keeping deep infinite-scroll loads O(log n + page) as the table grows.
create index if not exists labelled_samples_captured_idx
	on labelled_samples (captured_at desc, id desc);
