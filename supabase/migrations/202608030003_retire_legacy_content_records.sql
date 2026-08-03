-- 202608030003_retire_legacy_content_records.sql
-- Manual migration. Do not run automatically.
-- Run after at least 30 days with no reads of public.content_records and after
-- the app fallback to the legacy relation has been removed.

begin;

drop view if exists public.content_records;
drop table if exists public.content_records_legacy;

drop function if exists content.sync_legacy_content_record();

-- Keep content.import_legacy_record until the migration has been independently
-- backed up and verified. Remove it in a later maintenance migration if desired.

commit;
