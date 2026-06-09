-- schema_version is no longer recorded; drop it from any database created by an
-- earlier version of 002. Idempotent so the run-every-file migrator stays safe.
alter table labelled_samples drop column if exists schema_version;
