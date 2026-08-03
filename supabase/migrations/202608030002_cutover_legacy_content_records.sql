-- 202608030002_cutover_legacy_content_records.sql
-- Run only after:
-- 1. The app release reads app_content.published_records_v1.
-- 2. The website admin publishes through app_content.publish_record.
-- 3. app.apostolicguide.com/admin no longer writes official content.

begin;

-- Verify the additive migration copied every row before changing the old table.
do $$
declare
  legacy_count bigint;
  projection_count bigint;
  mismatch_count bigint;
begin
  select count(*) into legacy_count
  from public.content_records;

  select count(*) into projection_count
  from app_content.records
  where legacy_content_record_id is not null;

  if legacy_count <> projection_count then
    raise exception
      'Cutover blocked: legacy rows % do not match migrated rows %',
      legacy_count,
      projection_count;
  end if;

  select count(*)
  into mismatch_count
  from public.content_records legacy
  join app_content.records projected
    on projected.legacy_content_record_id = legacy.id
  where legacy.entity_type <> projected.entity_type
     or legacy.entity_id <> projected.entity_id
     or legacy.status <> projected.status
     or legacy.payload <> projected.payload;

  if mismatch_count <> 0 then
    raise exception
      'Cutover blocked: % migrated records do not match legacy payloads',
      mismatch_count;
  end if;
end;
$$;

-- Stop legacy writes.
revoke insert, update, delete on public.content_records from authenticated;

drop policy if exists "admins insert official content" on public.content_records;
drop policy if exists "admins update official content" on public.content_records;
drop policy if exists "admins archive official content" on public.content_records;

drop trigger if exists sync_legacy_content_record on public.content_records;

alter table public.content_records
rename to content_records_legacy;

-- Preserve read compatibility for an older app release or emergency rollback.
create view public.content_records
with (security_invoker = true)
as
select
  legacy_content_record_id as id,
  entity_type,
  entity_id,
  status,
  payload,
  created_by,
  created_at,
  updated_at
from app_content.records;

grant select on public.content_records to anon, authenticated;

comment on view public.content_records is
'Read-only compatibility view. New writes must use app_content.publish_record.';

commit;
