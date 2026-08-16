-- Repair the Publishing section's missing editorial/app-content database foundation.
-- This migration is additive and compatible with environments where the older
-- content/app_content schemas were already installed.

begin;

create extension if not exists pgcrypto;
create schema if not exists content;
create schema if not exists app_content;

create table if not exists content.items (
  id uuid primary key default gen_random_uuid(),
  legacy_content_record_id bigint unique,
  kind text not null check (kind in ('topic','article','answer','objection','scripture_entry','pathway','media','series','page')),
  locale text not null default 'en-US',
  translation_group_id uuid,
  source_system text not null default 'website',
  source_key text not null,
  slug text not null,
  title text not null,
  summary text not null default '',
  editorial_status text not null default 'draft' check (editorial_status in ('draft','in_review','approved','archived')),
  visibility text not null default 'private' check (visibility in ('public','unlisted','private')),
  featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_system, source_key)
);

create table if not exists content.publications (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content.items(id) on delete cascade,
  channel text not null check (channel in ('website','app')),
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived','failed')),
  scheduled_for timestamptz,
  published_at timestamptz,
  version bigint not null default 1,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_item_id, channel)
);

create table if not exists content.documents (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  body_json jsonb not null default '{"type":"doc","version":1,"blocks":[]}'::jsonb,
  body_schema_version integer not null default 1 check (body_schema_version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists content.revisions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content.items(id) on delete cascade,
  revision_number integer not null,
  snapshot jsonb not null,
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_item_id, revision_number)
);

create index if not exists content_items_kind_locale_slug_idx
  on content.items(kind, locale, slug) where deleted_at is null;
create unique index if not exists content_items_website_slug_uidx
  on content.items(locale, slug) where source_system = 'website' and deleted_at is null;
create index if not exists content_items_status_idx
  on content.items(editorial_status, kind, locale);
create index if not exists content_publications_channel_status_idx
  on content.publications(channel, status, published_at);
create index if not exists content_revisions_item_idx
  on content.revisions(content_item_id, revision_number desc);

create sequence if not exists app_content.content_version_seq;

create table if not exists app_content.records (
  id uuid primary key default gen_random_uuid(),
  source_content_item_id uuid not null references content.items(id) on delete cascade,
  legacy_content_record_id bigint unique,
  entity_type text not null check (entity_type in ('scripture','pathway','objection','category')),
  entity_id text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  payload jsonb not null,
  record_version bigint not null default nextval('app_content.content_version_seq'),
  checksum text not null default '',
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id),
  unique (source_content_item_id)
);

create index if not exists app_content_records_status_version_idx
  on app_content.records(status, record_version);

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
  new.checksum = encode(digest(new.payload::text, 'sha256'), 'hex');
  new.updated_at = now();
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_app_content_record on app_content.records;
create trigger prepare_app_content_record
before insert or update on app_content.records
for each row execute function app_content.prepare_record();

create or replace view app_content.published_records_v1
with (security_invoker = true)
as
select id, source_content_item_id, entity_type, entity_id, schema_version, status,
       payload, record_version, checksum, published_at, updated_at
from app_content.records
where status = 'published';

create or replace view app_content.manifest_v1
with (security_invoker = true)
as
select 1::integer as schema_version,
       coalesce(max(record_version), 0)::bigint as content_version,
       max(updated_at) as updated_at
from app_content.records;

create or replace function content.item_is_website_visible(item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from content.items i
    join content.publications p on p.content_item_id = i.id and p.channel = 'website'
    where i.id = item_id
      and i.deleted_at is null
      and i.visibility in ('public','unlisted')
      and p.status = 'published'
      and coalesce(p.published_at, now()) <= now()
  );
$$;

create or replace function content.markdown_document(p_body text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'doc',
    'version', 1,
    'blocks', jsonb_build_array(
      jsonb_build_object('type', 'markdown', 'data', jsonb_build_object('text', coalesce(p_body, '')))
    )
  );
$$;

create or replace function content.create_editorial_item(
  p_kind text,
  p_slug text,
  p_title text,
  p_summary text,
  p_body text,
  p_publish_website boolean,
  p_actor_user_id uuid
)
returns content.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item content.items;
begin
  if p_kind not in ('article','answer','topic') then
    raise exception 'Unsupported editorial content kind: %', p_kind;
  end if;

  insert into content.items (
    kind, locale, source_system, source_key, slug, title, summary,
    editorial_status, visibility, created_by, updated_by
  ) values (
    p_kind, 'en-US', 'website', 'website:' || gen_random_uuid()::text,
    p_slug, p_title, p_summary,
    case when p_publish_website then 'approved' else 'draft' end,
    case when p_publish_website then 'public' else 'private' end,
    p_actor_user_id, p_actor_user_id
  ) returning * into v_item;

  insert into content.documents(content_item_id, body_json, body_schema_version)
  values (v_item.id, content.markdown_document(p_body), 1);

  insert into content.publications(
    content_item_id, channel, status, published_at, created_by, updated_by
  ) values (
    v_item.id, 'website',
    case when p_publish_website then 'published' else 'draft' end,
    case when p_publish_website then now() else null end,
    p_actor_user_id, p_actor_user_id
  );

  insert into content.revisions(content_item_id, revision_number, snapshot, change_summary, created_by)
  values (
    v_item.id, 1,
    jsonb_build_object('kind', p_kind, 'slug', p_slug, 'title', p_title, 'summary', p_summary, 'body', p_body, 'publishWebsite', p_publish_website),
    'Created in Website Content', p_actor_user_id
  );

  return v_item;
end;
$$;

create or replace function content.update_editorial_item(
  p_item_id uuid,
  p_slug text,
  p_title text,
  p_summary text,
  p_body text,
  p_publish_website boolean,
  p_actor_user_id uuid
)
returns content.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing content.items;
  v_item content.items;
  v_revision integer;
begin
  select * into v_existing
  from content.items
  where id = p_item_id and source_system = 'website' and deleted_at is null
  for update;
  if not found then raise exception 'Website content item not found'; end if;

  select coalesce(max(revision_number), 0) + 1 into v_revision
  from content.revisions where content_item_id = p_item_id;

  insert into content.revisions(content_item_id, revision_number, snapshot, change_summary, created_by)
  select p_item_id, v_revision,
    jsonb_build_object(
      'kind', v_existing.kind,
      'slug', v_existing.slug,
      'title', v_existing.title,
      'summary', v_existing.summary,
      'body', coalesce(d.body_json #>> '{blocks,0,data,text}', ''),
      'publishWebsite', coalesce(p.status = 'published', false)
    ),
    'Saved before Website Content update', p_actor_user_id
  from content.documents d
  left join content.publications p on p.content_item_id = p_item_id and p.channel = 'website'
  where d.content_item_id = p_item_id;

  update content.items set
    slug = p_slug,
    title = p_title,
    summary = p_summary,
    editorial_status = case when p_publish_website then 'approved' else 'draft' end,
    visibility = case when p_publish_website then 'public' else 'private' end,
    updated_by = p_actor_user_id,
    updated_at = now()
  where id = p_item_id
  returning * into v_item;

  insert into content.documents(content_item_id, body_json, body_schema_version, updated_at)
  values (p_item_id, content.markdown_document(p_body), 1, now())
  on conflict (content_item_id) do update set
    body_json = excluded.body_json,
    body_schema_version = excluded.body_schema_version,
    updated_at = excluded.updated_at;

  insert into content.publications(content_item_id, channel, status, published_at, created_by, updated_by, updated_at)
  values (
    p_item_id, 'website',
    case when p_publish_website then 'published' else 'draft' end,
    case when p_publish_website then now() else null end,
    p_actor_user_id, p_actor_user_id, now()
  )
  on conflict (content_item_id, channel) do update set
    status = excluded.status,
    published_at = case when excluded.status = 'published' then coalesce(content.publications.published_at, now()) else null end,
    updated_by = excluded.updated_by,
    updated_at = now();

  return v_item;
end;
$$;

create or replace function content.archive_editorial_item(
  p_item_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update content.items set
    editorial_status = 'archived', visibility = 'private', deleted_at = now(),
    updated_by = p_actor_user_id, updated_at = now()
  where id = p_item_id and source_system = 'website';
  if not found then raise exception 'Website content item not found'; end if;

  update content.publications set
    status = 'archived', updated_by = p_actor_user_id, updated_at = now()
  where content_item_id = p_item_id and channel = 'website';
end;
$$;

create or replace function app_content.publish_record_admin(
  p_source_content_item_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_schema_version integer,
  p_status text,
  p_payload jsonb,
  p_actor_user_id uuid
)
returns app_content.records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_kind text;
  v_record app_content.records;
begin
  if p_entity_type not in ('scripture','pathway','objection','category') then
    raise exception 'Unsupported app entity type: %', p_entity_type;
  end if;
  if p_status not in ('draft','published','archived') then
    raise exception 'Unsupported app publication status: %', p_status;
  end if;

  select kind into v_source_kind
  from content.items
  where id = p_source_content_item_id and deleted_at is null;
  if v_source_kind is null then raise exception 'Source content item does not exist'; end if;

  if (p_entity_type = 'scripture' and v_source_kind <> 'scripture_entry')
    or (p_entity_type = 'pathway' and v_source_kind <> 'pathway')
    or (p_entity_type = 'objection' and v_source_kind <> 'objection')
    or (p_entity_type = 'category' and v_source_kind <> 'topic') then
    raise exception 'App entity type % does not match source content kind %', p_entity_type, v_source_kind;
  end if;

  insert into app_content.records(
    source_content_item_id, entity_type, entity_id, schema_version, status,
    payload, published_at, created_by, updated_by
  ) values (
    p_source_content_item_id, p_entity_type, p_entity_id, p_schema_version, p_status,
    p_payload, case when p_status = 'published' then now() else null end,
    p_actor_user_id, p_actor_user_id
  )
  on conflict (source_content_item_id) do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    schema_version = excluded.schema_version,
    status = excluded.status,
    payload = excluded.payload,
    published_at = case when excluded.status = 'published' then coalesce(app_content.records.published_at, now()) else null end,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_record;

  insert into content.publications(content_item_id, channel, status, published_at, created_by, updated_by, updated_at)
  values (
    p_source_content_item_id, 'app',
    case when p_status = 'published' then 'published' when p_status = 'archived' then 'archived' else 'draft' end,
    case when p_status = 'published' then now() else null end,
    p_actor_user_id, p_actor_user_id, now()
  )
  on conflict (content_item_id, channel) do update set
    status = excluded.status,
    published_at = case when excluded.status = 'published' then coalesce(content.publications.published_at, now()) else null end,
    updated_by = excluded.updated_by,
    updated_at = now();

  return v_record;
end;
$$;

alter table content.items enable row level security;
alter table content.publications enable row level security;
alter table content.documents enable row level security;
alter table content.revisions enable row level security;
alter table app_content.records enable row level security;

revoke all on schema content from public;
revoke all on schema app_content from public;
grant usage on schema content to anon, authenticated, service_role;
grant usage on schema app_content to anon, authenticated, service_role;

revoke all on content.items from anon, authenticated;
revoke all on content.publications from anon, authenticated;
revoke all on content.documents from anon, authenticated;
revoke all on content.revisions from anon, authenticated;
revoke all on app_content.records from anon, authenticated;

grant select on content.items, content.publications, content.documents to anon, authenticated;
grant select on app_content.records to anon, authenticated;
grant select on app_content.published_records_v1, app_content.manifest_v1 to anon, authenticated;

grant select, insert, update, delete on content.items, content.publications, content.documents, content.revisions to service_role;
grant select, insert, update, delete on app_content.records to service_role;
grant usage, select on sequence app_content.content_version_seq to service_role;

revoke all on function content.create_editorial_item(text,text,text,text,text,boolean,uuid) from public, anon, authenticated;
revoke all on function content.update_editorial_item(uuid,text,text,text,text,boolean,uuid) from public, anon, authenticated;
revoke all on function content.archive_editorial_item(uuid,uuid) from public, anon, authenticated;
revoke all on function app_content.publish_record_admin(uuid,text,text,integer,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function content.create_editorial_item(text,text,text,text,text,boolean,uuid) to service_role;
grant execute on function content.update_editorial_item(uuid,text,text,text,text,boolean,uuid) to service_role;
grant execute on function content.archive_editorial_item(uuid,uuid) to service_role;
grant execute on function app_content.publish_record_admin(uuid,text,text,integer,text,jsonb,uuid) to service_role;

drop policy if exists "public reads visible website items" on content.items;
create policy "public reads visible website items" on content.items
for select to anon, authenticated
using (content.item_is_website_visible(id));

drop policy if exists "public reads visible website publications" on content.publications;
create policy "public reads visible website publications" on content.publications
for select to anon, authenticated
using (channel = 'website' and status = 'published' and content.item_is_website_visible(content_item_id));

drop policy if exists "public reads visible website documents" on content.documents;
create policy "public reads visible website documents" on content.documents
for select to anon, authenticated
using (content.item_is_website_visible(content_item_id));

drop policy if exists "public reads published app records" on app_content.records;
create policy "public reads published app records" on app_content.records
for select to anon, authenticated
using (status = 'published');

-- Preserve every already-exposed schema and append the two schemas that the
-- Publishing section actively queries. This avoids clobbering analytics or any
-- future API schema added to the same project.
do $$
declare
  v_setting text;
  v_schemas text;
  v_parts text[];
begin
  select config into v_setting
  from pg_roles r,
       lateral unnest(coalesce(r.rolconfig, array[]::text[])) as config
  where r.rolname = 'authenticator'
    and config like 'pgrst.db_schemas=%'
  limit 1;

  v_schemas := coalesce(substring(v_setting from length('pgrst.db_schemas=') + 1), 'public');
  v_parts := string_to_array(replace(v_schemas, ' ', ''), ',');
  if not ('content' = any(v_parts)) then v_schemas := v_schemas || ', content'; end if;
  if not ('app_content' = any(v_parts)) then v_schemas := v_schemas || ', app_content'; end if;
  execute format('alter role authenticator set pgrst.db_schemas = %L', v_schemas);
end;
$$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

comment on schema content is 'Editorial content backing Website Content and canonical sources for App Content.';
comment on schema app_content is 'Versioned app projections managed from Apostolic Guide Studio.';

commit;
