-- Run after 202608030001_shared_content_foundation.sql.
do $$
declare
  legacy_count bigint;
  projection_count bigint;
  mismatch_count bigint;
  website_leak_count bigint;
begin
  select count(*) into legacy_count from public.content_records;
  select count(*) into projection_count
  from app_content.records
  where legacy_content_record_id is not null;

  if legacy_count <> projection_count then
    raise exception 'Legacy count % differs from projection count %',
      legacy_count, projection_count;
  end if;

  select count(*) into mismatch_count
  from public.content_records legacy
  join app_content.records projected
    on projected.legacy_content_record_id = legacy.id
  where legacy.entity_type <> projected.entity_type
     or legacy.entity_id <> projected.entity_id
     or legacy.status <> projected.status
     or legacy.payload <> projected.payload;

  if mismatch_count <> 0 then
    raise exception '% migrated payloads differ', mismatch_count;
  end if;

  select count(*) into website_leak_count
  from content.items item
  join content.publications publication
    on publication.content_item_id = item.id
  where item.source_system = 'legacy_app'
    and publication.channel = 'website'
    and publication.status = 'published';

  if website_leak_count <> 0 then
    raise exception '% imported app records leaked to website', website_leak_count;
  end if;
end;
$$;
