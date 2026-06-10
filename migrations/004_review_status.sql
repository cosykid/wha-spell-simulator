-- Manual QA verdict for the Sample Reviewer. NULL review_status means the sample
-- has not been reviewed yet ("pending"). Rejected samples are kept, never deleted,
-- so bad data stays inspectable and verdicts can be undone.
alter table labelled_samples
	add column if not exists review_status text
		constraint labelled_samples_review_status_check
		check (review_status in ('approved', 'rejected'));

alter table labelled_samples
	add column if not exists reviewed_at timestamptz;
