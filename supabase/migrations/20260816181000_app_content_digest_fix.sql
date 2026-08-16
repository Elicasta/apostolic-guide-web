-- app_content.prepare_record runs with an empty search_path for safety.
-- pgcrypto lives in Supabase's extensions schema, so digest must be qualified.

create or replace function app_content.prepare_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.entity_type,
    new.entity_id,
    new.schema_version,
    new.status,
    new.payload
  ) is distinct from (
    old.entity_type,
    old.entity_id,
    old.schema_version,
    old.status,
    old.payload
  ) then
    new.record_version = nextval('app_content.content_version_seq');
  end if;
  new.checksum = encode(extensions.digest(new.payload::text, 'sha256'), 'hex');
  new.updated_at = now();
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
