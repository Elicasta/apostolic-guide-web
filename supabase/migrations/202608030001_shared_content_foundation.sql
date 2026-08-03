-- 202608030001_shared_content_foundation.sql
-- Additive migration. Safe to run before either application is changed.
-- Existing public.content_records remains live and writable during this phase.

begin;

create extension if not exists pgcrypto;

create schema if not exists platform;
create schema if not exists content;
create schema if not exists app_content;
create schema if not exists ops;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function platform.slugify(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(
    both '-'
    from regexp_replace(
      lower(coalesce(input, '')),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
$$;

create or replace function platform.safe_integer(input text, fallback_value integer default null)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if input is null or btrim(input) = '' then
    return fallback_value;
  end if;

  return input::integer;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return fallback_value;
end;
$$;

create table if not exists platform.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in ('reader', 'contributor', 'editor', 'publisher', 'admin')
  ),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table platform.user_roles enable row level security;

create or replace function platform.current_user_has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = any(required_roles)
    or exists (
      select 1
      from platform.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = any(required_roles)
    );
$$;

revoke all on function platform.current_user_has_role(text[]) from public;
grant execute on function platform.current_user_has_role(text[]) to authenticated;

drop policy if exists "users read own roles" on platform.user_roles;
create policy "users read own roles"
on platform.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or platform.current_user_has_role(array['admin'])
);

drop policy if exists "admins manage roles" on platform.user_roles;
create policy "admins manage roles"
on platform.user_roles
for all
to authenticated
using (platform.current_user_has_role(array['admin']))
with check (platform.current_user_has_role(array['admin']));

-- ---------------------------------------------------------------------------
-- Canonical editorial content
-- ---------------------------------------------------------------------------

create table if not exists content.items (
  id uuid primary key default gen_random_uuid(),
  legacy_content_record_id bigint unique,
  kind text not null check (
    kind in (
      'topic',
      'article',
      'answer',
      'objection',
      'scripture_entry',
      'pathway',
      'media',
      'series',
      'page'
    )
  ),
  locale text not null default 'en-US',
  translation_group_id uuid,
  source_system text not null default 'website',
  source_key text not null,
  slug text not null,
  title text not null,
  summary text not null default '',
  editorial_status text not null default 'draft' check (
    editorial_status in ('draft', 'in_review', 'approved', 'archived')
  ),
  visibility text not null default 'private' check (
    visibility in ('public', 'unlisted', 'private')
  ),
  featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_system, source_key)
);

create index if not exists content_items_kind_locale_slug_idx
on content.items (kind, locale, slug)
where deleted_at is null;

create index if not exists content_items_status_idx
on content.items (editorial_status, kind, locale);

create table if not exists content.publications (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content.items(id) on delete cascade,
  channel text not null check (channel in ('website', 'app')),
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'published', 'archived', 'failed')
  ),
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

create index if not exists content_publications_channel_status_idx
on content.publications (channel, status, published_at);

create table if not exists content.documents (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  body_json jsonb not null default '{"type":"doc","version":1,"blocks":[]}'::jsonb,
  body_schema_version integer not null default 1 check (body_schema_version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists content.topics (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  claim text not null default '',
  category text,
  parent_topic_id uuid references content.items(id) on delete set null,
  aliases jsonb not null default '[]'::jsonb,
  spanish_aliases jsonb not null default '[]'::jsonb,
  icon_key text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists content.scripture_entries (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  entity_id text not null unique,
  reference_label text not null,
  book text,
  chapter integer,
  verse_start integer,
  verse_end integer,
  primary_translation text,
  translations jsonb not null default '{}'::jsonb,
  main_point text not null default '',
  why_it_matters text not null default '',
  apostolic_connection text not null default '',
  common_misunderstanding text,
  conversation_use text,
  chapter_context text,
  priority integer not null default 0,
  is_primary_reference boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists content.scripture_relationships (
  id uuid primary key default gen_random_uuid(),
  source_scripture_item_id uuid not null references content.items(id) on delete cascade,
  target_scripture_item_id uuid references content.items(id) on delete set null,
  target_entity_id text not null,
  relation_type text not null,
  label text not null default '',
  explanation text not null default '',
  priority integer not null default 0,
  unique (
    source_scripture_item_id,
    target_entity_id,
    relation_type
  )
);

create table if not exists content.pathways (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  entity_id text not null unique,
  pathway_type text not null check (
    pathway_type in ('doctrine', 'conversation', 'discovery', 'teaching')
  ),
  description text not null default '',
  core_claim text not null default '',
  summary text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  branches jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists content.pathway_steps (
  id uuid primary key default gen_random_uuid(),
  pathway_item_id uuid not null references content.items(id) on delete cascade,
  step_entity_id text not null,
  sort_order integer not null,
  scripture_item_id uuid references content.items(id) on delete set null,
  reference_entity_id text not null,
  heading text not null default '',
  explanation text not null default '',
  transition_to_next text,
  unique (pathway_item_id, sort_order)
);

create table if not exists content.objections (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  entity_id text not null unique,
  objection_text text not null default '',
  common_wording jsonb not null default '[]'::jsonb,
  short_response text not null default '',
  primary_reference_entity_id text,
  supporting_reference_entity_ids jsonb not null default '[]'::jsonb,
  pathway_entity_id text,
  mistakes_to_avoid jsonb not null default '[]'::jsonb,
  deeper_explanation text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists content.item_topics (
  content_item_id uuid not null references content.items(id) on delete cascade,
  topic_item_id uuid not null references content.items(id) on delete cascade,
  role text not null default 'secondary' check (role in ('primary', 'secondary')),
  sort_order integer not null default 0,
  primary key (content_item_id, topic_item_id)
);

create unique index if not exists content_item_primary_topic_idx
on content.item_topics (content_item_id)
where role = 'primary';

create table if not exists content.item_relations (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null references content.items(id) on delete cascade,
  target_item_id uuid references content.items(id) on delete set null,
  target_key text not null,
  relation_type text not null,
  sort_order integer,
  metadata jsonb not null default '{}'::jsonb,
  unique (source_item_id, target_key, relation_type)
);

create table if not exists content.seo_metadata (
  content_item_id uuid primary key references content.items(id) on delete cascade,
  seo_title text,
  seo_description text,
  canonical_url text,
  no_index boolean not null default false,
  social_asset_id uuid,
  structured_data_overrides jsonb
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

-- ---------------------------------------------------------------------------
-- App content projection
-- ---------------------------------------------------------------------------

create sequence if not exists app_content.content_version_seq;

create table if not exists app_content.records (
  id uuid primary key default gen_random_uuid(),
  source_content_item_id uuid not null references content.items(id) on delete cascade,
  legacy_content_record_id bigint unique,
  entity_type text not null check (
    entity_type in ('scripture', 'pathway', 'objection', 'category')
  ),
  entity_id text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  status text not null default 'draft' check (
    status in ('draft', 'published', 'archived')
  ),
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
on app_content.records (status, record_version);

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
select
  id,
  source_content_item_id,
  entity_type,
  entity_id,
  schema_version,
  status,
  payload,
  record_version,
  checksum,
  published_at,
  updated_at
from app_content.records
where status = 'published';

create or replace view app_content.manifest_v1
with (security_invoker = true)
as
select
  1::integer as schema_version,
  coalesce(max(record_version), 0)::bigint as content_version,
  max(updated_at) as updated_at
from app_content.records;

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

create table if not exists ops.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_resource_idx
on ops.audit_events (resource_type, resource_id, created_at desc);

create table if not exists ops.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists ops_outbox_pending_idx
on ops.outbox_events (status, available_at, created_at)
where status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- Visibility and edit helpers
-- ---------------------------------------------------------------------------

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
    join content.publications p
      on p.content_item_id = i.id
     and p.channel = 'website'
    where i.id = item_id
      and i.deleted_at is null
      and i.visibility in ('public', 'unlisted')
      and p.status = 'published'
      and coalesce(p.published_at, now()) <= now()
  );
$$;

revoke all on function content.item_is_website_visible(uuid) from public;
grant execute on function content.item_is_website_visible(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Legacy importer
-- ---------------------------------------------------------------------------

create or replace function content.import_legacy_record(
  p_legacy_id bigint,
  p_entity_type text,
  p_entity_id text,
  p_status text,
  p_payload jsonb,
  p_created_by uuid,
  p_created_at timestamptz,
  p_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_kind text;
  v_slug text;
  v_title text;
  v_summary text;
  v_editorial_status text;
  v_featured boolean;
begin
  if p_entity_type not in ('scripture', 'pathway', 'objection', 'category') then
    raise exception 'Unsupported legacy entity type: %', p_entity_type;
  end if;

  v_kind := case p_entity_type
    when 'scripture' then 'scripture_entry'
    when 'pathway' then 'pathway'
    when 'objection' then 'objection'
    when 'category' then 'topic'
  end;

  v_slug := case p_entity_type
    when 'scripture' then platform.slugify(coalesce(p_payload ->> 'reference', p_entity_id))
    else platform.slugify(coalesce(p_payload ->> 'slug', p_entity_id))
  end;

  if v_slug = '' then
    v_slug := platform.slugify(p_entity_id);
  end if;

  v_title := case p_entity_type
    when 'scripture' then coalesce(nullif(p_payload ->> 'reference', ''), p_entity_id)
    when 'category' then coalesce(nullif(p_payload ->> 'name', ''), p_entity_id)
    else coalesce(nullif(p_payload ->> 'title', ''), p_entity_id)
  end;

  v_summary := case p_entity_type
    when 'scripture' then coalesce(
      nullif(p_payload ->> 'summary', ''),
      nullif(p_payload ->> 'mainPoint', ''),
      ''
    )
    when 'pathway' then coalesce(
      nullif(p_payload ->> 'summary', ''),
      nullif(p_payload ->> 'description', ''),
      ''
    )
    when 'objection' then coalesce(
      nullif(p_payload ->> 'shortResponse', ''),
      nullif(p_payload ->> 'argument', ''),
      ''
    )
    when 'category' then coalesce(nullif(p_payload ->> 'description', ''), '')
  end;

  v_editorial_status := case p_status
    when 'published' then 'approved'
    when 'archived' then 'archived'
    else 'draft'
  end;

  v_featured := lower(coalesce(p_payload ->> 'featured', 'false')) = 'true';

  insert into content.items (
    legacy_content_record_id,
    kind,
    locale,
    source_system,
    source_key,
    slug,
    title,
    summary,
    editorial_status,
    visibility,
    featured,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    p_legacy_id,
    v_kind,
    'en-US',
    'legacy_app',
    p_entity_type || ':' || p_entity_id,
    v_slug,
    v_title,
    v_summary,
    v_editorial_status,
    'private',
    v_featured,
    p_created_by,
    p_created_by,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, now())
  )
  on conflict (source_system, source_key)
  do update set
    legacy_content_record_id = excluded.legacy_content_record_id,
    kind = excluded.kind,
    slug = excluded.slug,
    title = excluded.title,
    summary = excluded.summary,
    editorial_status = excluded.editorial_status,
    featured = excluded.featured,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning id into v_item_id;

  insert into content.documents (
    content_item_id,
    body_json,
    body_schema_version,
    updated_at
  )
  values (
    v_item_id,
    jsonb_build_object(
      'type', 'legacy_app_payload',
      'version', 1,
      'payload', p_payload
    ),
    1,
    coalesce(p_updated_at, now())
  )
  on conflict (content_item_id)
  do update set
    body_json = excluded.body_json,
    body_schema_version = excluded.body_schema_version,
    updated_at = excluded.updated_at;

  if p_entity_type = 'category' then
    insert into content.topics (
      content_item_id,
      claim,
      parent_topic_id,
      aliases,
      spanish_aliases,
      metadata
    )
    values (
      v_item_id,
      coalesce(p_payload ->> 'description', ''),
      null,
      case
        when jsonb_typeof(p_payload -> 'aliases') = 'array'
          then p_payload -> 'aliases'
        else '[]'::jsonb
      end,
      case
        when jsonb_typeof(p_payload -> 'spanishAliases') = 'array'
          then p_payload -> 'spanishAliases'
        else '[]'::jsonb
      end,
      jsonb_build_object(
        'entityId', p_entity_id,
        'parentEntityId', p_payload ->> 'parentId'
      )
    )
    on conflict (content_item_id)
    do update set
      claim = excluded.claim,
      aliases = excluded.aliases,
      spanish_aliases = excluded.spanish_aliases,
      metadata = excluded.metadata;
  end if;

  if p_entity_type = 'scripture' then
    insert into content.scripture_entries (
      content_item_id,
      entity_id,
      reference_label,
      book,
      chapter,
      verse_start,
      verse_end,
      primary_translation,
      translations,
      main_point,
      why_it_matters,
      apostolic_connection,
      common_misunderstanding,
      conversation_use,
      chapter_context,
      priority,
      is_primary_reference,
      metadata
    )
    values (
      v_item_id,
      p_entity_id,
      coalesce(p_payload ->> 'reference', p_entity_id),
      p_payload ->> 'book',
      platform.safe_integer(p_payload ->> 'chapter', null),
      platform.safe_integer(p_payload ->> 'verseStart', null),
      platform.safe_integer(p_payload ->> 'verseEnd', null),
      p_payload ->> 'primaryTranslation',
      case
        when jsonb_typeof(p_payload -> 'translations') = 'object'
          then p_payload -> 'translations'
        else '{}'::jsonb
      end,
      coalesce(p_payload ->> 'mainPoint', ''),
      coalesce(p_payload ->> 'whyItMatters', ''),
      coalesce(p_payload ->> 'apostolicConnection', ''),
      p_payload ->> 'commonMisunderstanding',
      p_payload ->> 'conversationUse',
      p_payload ->> 'chapterContext',
      platform.safe_integer(p_payload ->> 'priority', 0),
      lower(coalesce(p_payload ->> 'isPrimaryReference', 'false')) = 'true',
      p_payload - array[
        'translations',
        'mainPoint',
        'whyItMatters',
        'apostolicConnection',
        'commonMisunderstanding',
        'conversationUse',
        'chapterContext',
        'relationships'
      ]
    )
    on conflict (content_item_id)
    do update set
      entity_id = excluded.entity_id,
      reference_label = excluded.reference_label,
      book = excluded.book,
      chapter = excluded.chapter,
      verse_start = excluded.verse_start,
      verse_end = excluded.verse_end,
      primary_translation = excluded.primary_translation,
      translations = excluded.translations,
      main_point = excluded.main_point,
      why_it_matters = excluded.why_it_matters,
      apostolic_connection = excluded.apostolic_connection,
      common_misunderstanding = excluded.common_misunderstanding,
      conversation_use = excluded.conversation_use,
      chapter_context = excluded.chapter_context,
      priority = excluded.priority,
      is_primary_reference = excluded.is_primary_reference,
      metadata = excluded.metadata;

    delete from content.scripture_relationships
    where source_scripture_item_id = v_item_id;

    if jsonb_typeof(p_payload -> 'relationships') = 'array' then
      insert into content.scripture_relationships (
        source_scripture_item_id,
        target_scripture_item_id,
        target_entity_id,
        relation_type,
        label,
        explanation,
        priority
      )
      select
        v_item_id,
        target_item.id,
        relationship.value ->> 'targetReferenceId',
        coalesce(relationship.value ->> 'type', 'supporting'),
        coalesce(relationship.value ->> 'label', ''),
        coalesce(relationship.value ->> 'explanation', ''),
        platform.safe_integer(relationship.value ->> 'priority', 0)
      from jsonb_array_elements(p_payload -> 'relationships') relationship(value)
      left join content.items target_item
        on target_item.source_system = 'legacy_app'
       and target_item.source_key =
         'scripture:' || (relationship.value ->> 'targetReferenceId')
      where coalesce(relationship.value ->> 'targetReferenceId', '') <> ''
      on conflict (
        source_scripture_item_id,
        target_entity_id,
        relation_type
      )
      do update set
        target_scripture_item_id = excluded.target_scripture_item_id,
        label = excluded.label,
        explanation = excluded.explanation,
        priority = excluded.priority;
    end if;
  end if;

  if p_entity_type = 'pathway' then
    insert into content.pathways (
      content_item_id,
      entity_id,
      pathway_type,
      description,
      core_claim,
      summary,
      keywords,
      branches,
      objections,
      metadata
    )
    values (
      v_item_id,
      p_entity_id,
      case
        when p_payload ->> 'type' in ('doctrine', 'conversation', 'discovery', 'teaching')
          then p_payload ->> 'type'
        else 'doctrine'
      end,
      coalesce(p_payload ->> 'description', ''),
      coalesce(p_payload ->> 'coreClaim', ''),
      coalesce(p_payload ->> 'summary', ''),
      case
        when jsonb_typeof(p_payload -> 'keywords') = 'array'
          then p_payload -> 'keywords'
        else '[]'::jsonb
      end,
      case
        when jsonb_typeof(p_payload -> 'branches') = 'array'
          then p_payload -> 'branches'
        else '[]'::jsonb
      end,
      case
        when jsonb_typeof(p_payload -> 'objections') = 'array'
          then p_payload -> 'objections'
        else '[]'::jsonb
      end,
      p_payload - array[
        'description',
        'coreClaim',
        'summary',
        'keywords',
        'steps',
        'branches',
        'objections'
      ]
    )
    on conflict (content_item_id)
    do update set
      entity_id = excluded.entity_id,
      pathway_type = excluded.pathway_type,
      description = excluded.description,
      core_claim = excluded.core_claim,
      summary = excluded.summary,
      keywords = excluded.keywords,
      branches = excluded.branches,
      objections = excluded.objections,
      metadata = excluded.metadata;

    delete from content.pathway_steps
    where pathway_item_id = v_item_id;

    if jsonb_typeof(p_payload -> 'steps') = 'array' then
      insert into content.pathway_steps (
        pathway_item_id,
        step_entity_id,
        sort_order,
        scripture_item_id,
        reference_entity_id,
        heading,
        explanation,
        transition_to_next
      )
      select
        v_item_id,
        coalesce(step.value ->> 'id', 'step-' || step.ordinality::text),
        step.ordinality::integer,
        scripture_item.id,
        coalesce(step.value ->> 'referenceId', ''),
        coalesce(step.value ->> 'heading', ''),
        coalesce(step.value ->> 'explanation', ''),
        step.value ->> 'transitionToNext'
      from jsonb_array_elements(p_payload -> 'steps')
        with ordinality as step(value, ordinality)
      left join content.items scripture_item
        on scripture_item.source_system = 'legacy_app'
       and scripture_item.source_key =
         'scripture:' || (step.value ->> 'referenceId')
      where coalesce(step.value ->> 'referenceId', '') <> '';
    end if;
  end if;

  if p_entity_type = 'objection' then
    insert into content.objections (
      content_item_id,
      entity_id,
      objection_text,
      common_wording,
      short_response,
      primary_reference_entity_id,
      supporting_reference_entity_ids,
      pathway_entity_id,
      mistakes_to_avoid,
      deeper_explanation,
      keywords,
      metadata
    )
    values (
      v_item_id,
      p_entity_id,
      coalesce(p_payload ->> 'argument', ''),
      case
        when jsonb_typeof(p_payload -> 'commonWording') = 'array'
          then p_payload -> 'commonWording'
        else '[]'::jsonb
      end,
      coalesce(p_payload ->> 'shortResponse', ''),
      p_payload ->> 'primaryReferenceId',
      case
        when jsonb_typeof(p_payload -> 'supportingReferenceIds') = 'array'
          then p_payload -> 'supportingReferenceIds'
        else '[]'::jsonb
      end,
      p_payload ->> 'pathwayId',
      case
        when jsonb_typeof(p_payload -> 'mistakesToAvoid') = 'array'
          then p_payload -> 'mistakesToAvoid'
        else '[]'::jsonb
      end,
      coalesce(p_payload ->> 'deeperExplanation', ''),
      case
        when jsonb_typeof(p_payload -> 'keywords') = 'array'
          then p_payload -> 'keywords'
        else '[]'::jsonb
      end,
      p_payload - array[
        'argument',
        'commonWording',
        'shortResponse',
        'primaryReferenceId',
        'supportingReferenceIds',
        'pathwayId',
        'mistakesToAvoid',
        'deeperExplanation',
        'keywords'
      ]
    )
    on conflict (content_item_id)
    do update set
      entity_id = excluded.entity_id,
      objection_text = excluded.objection_text,
      common_wording = excluded.common_wording,
      short_response = excluded.short_response,
      primary_reference_entity_id = excluded.primary_reference_entity_id,
      supporting_reference_entity_ids = excluded.supporting_reference_entity_ids,
      pathway_entity_id = excluded.pathway_entity_id,
      mistakes_to_avoid = excluded.mistakes_to_avoid,
      deeper_explanation = excluded.deeper_explanation,
      keywords = excluded.keywords,
      metadata = excluded.metadata;
  end if;

  delete from content.item_topics
  where content_item_id = v_item_id;

  if p_entity_type = 'scripture'
     and jsonb_typeof(p_payload -> 'categories') = 'array' then
    insert into content.item_topics (
      content_item_id,
      topic_item_id,
      role,
      sort_order
    )
    select
      v_item_id,
      topic.id,
      case when category.ordinality = 1 then 'primary' else 'secondary' end,
      category.ordinality::integer
    from jsonb_array_elements_text(p_payload -> 'categories')
      with ordinality as category(entity_id, ordinality)
    join content.items topic
      on topic.source_system = 'legacy_app'
     and topic.source_key = 'category:' || category.entity_id
    on conflict (content_item_id, topic_item_id)
    do update set
      role = excluded.role,
      sort_order = excluded.sort_order;
  end if;

  if p_entity_type = 'pathway'
     and jsonb_typeof(p_payload -> 'categoryIds') = 'array' then
    insert into content.item_topics (
      content_item_id,
      topic_item_id,
      role,
      sort_order
    )
    select
      v_item_id,
      topic.id,
      case when category.ordinality = 1 then 'primary' else 'secondary' end,
      category.ordinality::integer
    from jsonb_array_elements_text(p_payload -> 'categoryIds')
      with ordinality as category(entity_id, ordinality)
    join content.items topic
      on topic.source_system = 'legacy_app'
     and topic.source_key = 'category:' || category.entity_id
    on conflict (content_item_id, topic_item_id)
    do update set
      role = excluded.role,
      sort_order = excluded.sort_order;
  end if;

  insert into content.publications (
    content_item_id,
    channel,
    status,
    published_at,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    v_item_id,
    'app',
    p_status,
    case when p_status = 'published' then coalesce(p_updated_at, now()) end,
    p_created_by,
    p_created_by,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, now())
  )
  on conflict (content_item_id, channel)
  do update set
    status = excluded.status,
    published_at = excluded.published_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into app_content.records (
    source_content_item_id,
    legacy_content_record_id,
    entity_type,
    entity_id,
    schema_version,
    status,
    payload,
    published_at,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  values (
    v_item_id,
    p_legacy_id,
    p_entity_type,
    p_entity_id,
    1,
    p_status,
    p_payload,
    case when p_status = 'published' then coalesce(p_updated_at, now()) end,
    p_created_by,
    p_created_by,
    coalesce(p_created_at, now()),
    coalesce(p_updated_at, now())
  )
  on conflict (entity_type, entity_id)
  do update set
    source_content_item_id = excluded.source_content_item_id,
    legacy_content_record_id = excluded.legacy_content_record_id,
    schema_version = excluded.schema_version,
    status = excluded.status,
    payload = excluded.payload,
    published_at = excluded.published_at,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into content.revisions (
    content_item_id,
    revision_number,
    snapshot,
    change_summary,
    created_by,
    created_at
  )
  values (
    v_item_id,
    1,
    jsonb_build_object(
      'source', 'legacy_app',
      'legacyContentRecordId', p_legacy_id,
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'status', p_status,
      'payload', p_payload
    ),
    'Imported from public.content_records',
    p_created_by,
    coalesce(p_updated_at, now())
  )
  on conflict (content_item_id, revision_number)
  do nothing;

  return v_item_id;
end;
$$;

-- Import all existing rows.
do $$
declare
  legacy_row record;
begin
  for legacy_row in
    select
      id,
      entity_type,
      entity_id,
      status,
      payload,
      created_by,
      created_at,
      updated_at
    from public.content_records
    order by id
  loop
    perform content.import_legacy_record(
      legacy_row.id,
      legacy_row.entity_type,
      legacy_row.entity_id,
      legacy_row.status,
      legacy_row.payload,
      legacy_row.created_by,
      legacy_row.created_at,
      legacy_row.updated_at
    );
  end loop;
end;
$$;

-- Reconcile once more after every legacy entity exists. This resolves category,
-- Scripture, and pathway relationships even when legacy rows were created in
-- an arbitrary order. The importer is idempotent.
do $$
declare
  legacy_row record;
begin
  for legacy_row in
    select
      id,
      entity_type,
      entity_id,
      status,
      payload,
      created_by,
      created_at,
      updated_at
    from public.content_records
    order by id
  loop
    perform content.import_legacy_record(
      legacy_row.id,
      legacy_row.entity_type,
      legacy_row.entity_id,
      legacy_row.status,
      legacy_row.payload,
      legacy_row.created_by,
      legacy_row.created_at,
      legacy_row.updated_at
    );
  end loop;
end;
$$;

-- Resolve category parent links after all category rows exist.
update content.topics child
set parent_topic_id = parent_item.id
from content.items child_item,
     content.items parent_item
where child.content_item_id = child_item.id
  and child_item.source_system = 'legacy_app'
  and child_item.kind = 'topic'
  and parent_item.source_system = 'legacy_app'
  and parent_item.source_key =
    'category:' || (child.metadata ->> 'parentEntityId')
  and coalesce(child.metadata ->> 'parentEntityId', '') <> '';

-- Keep new tables synchronized while the old app admin still writes.
create or replace function content.sync_legacy_content_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_item_id uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform content.import_legacy_record(
      new.id,
      new.entity_type,
      new.entity_id,
      new.status,
      new.payload,
      new.created_by,
      new.created_at,
      new.updated_at
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    select i.id
    into target_item_id
    from content.items i
    where i.legacy_content_record_id = old.id;

    if target_item_id is not null then
      update content.items
      set editorial_status = 'archived',
          updated_at = now()
      where id = target_item_id;

      update content.publications
      set status = 'archived',
          updated_at = now()
      where content_item_id = target_item_id
        and channel = 'app';

      update app_content.records
      set status = 'archived',
          updated_at = now()
      where source_content_item_id = target_item_id;
    end if;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_legacy_content_record on public.content_records;
create trigger sync_legacy_content_record
after insert or update or delete on public.content_records
for each row execute function content.sync_legacy_content_record();

-- ---------------------------------------------------------------------------
-- New website-to-app publishing RPC
-- ---------------------------------------------------------------------------

create or replace function app_content.publish_record(
  p_source_content_item_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_schema_version integer,
  p_status text,
  p_payload jsonb
)
returns app_content.records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_kind text;
  result_record app_content.records;
begin
  if not platform.current_user_has_role(array['publisher', 'admin']) then
    raise exception 'Insufficient permission';
  end if;

  if p_entity_type not in ('scripture', 'pathway', 'objection', 'category') then
    raise exception 'Unsupported app entity type: %', p_entity_type;
  end if;

  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Unsupported app publication status: %', p_status;
  end if;

  select kind
  into source_kind
  from content.items
  where id = p_source_content_item_id
    and deleted_at is null;

  if source_kind is null then
    raise exception 'Source content item does not exist';
  end if;

  if (
    p_entity_type = 'scripture' and source_kind <> 'scripture_entry'
  ) or (
    p_entity_type = 'pathway' and source_kind <> 'pathway'
  ) or (
    p_entity_type = 'objection' and source_kind <> 'objection'
  ) or (
    p_entity_type = 'category' and source_kind <> 'topic'
  ) then
    raise exception
      'App entity type % does not match source content kind %',
      p_entity_type,
      source_kind;
  end if;

  insert into app_content.records (
    source_content_item_id,
    entity_type,
    entity_id,
    schema_version,
    status,
    payload,
    published_at,
    created_by,
    updated_by
  )
  values (
    p_source_content_item_id,
    p_entity_type,
    p_entity_id,
    p_schema_version,
    p_status,
    p_payload,
    case when p_status = 'published' then now() end,
    auth.uid(),
    auth.uid()
  )
  on conflict (source_content_item_id)
  do update set
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    schema_version = excluded.schema_version,
    status = excluded.status,
    payload = excluded.payload,
    published_at = case
      when excluded.status = 'published'
        then coalesce(app_content.records.published_at, now())
      else app_content.records.published_at
    end,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into result_record;

  insert into content.publications (
    content_item_id,
    channel,
    status,
    published_at,
    created_by,
    updated_by
  )
  values (
    p_source_content_item_id,
    'app',
    p_status,
    case when p_status = 'published' then now() end,
    auth.uid(),
    auth.uid()
  )
  on conflict (content_item_id, channel)
  do update set
    status = excluded.status,
    published_at = case
      when excluded.status = 'published'
        then coalesce(content.publications.published_at, now())
      else content.publications.published_at
    end,
    updated_by = auth.uid(),
    updated_at = now();

  insert into ops.audit_events (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    auth.uid(),
    'app_content.publish',
    'content_item',
    p_source_content_item_id,
    jsonb_build_object(
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'status', p_status,
      'recordVersion', result_record.record_version
    )
  );

  insert into ops.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  )
  values (
    'APP_CONTENT_CHANGED',
    'content_item',
    p_source_content_item_id,
    jsonb_build_object(
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'recordVersion', result_record.record_version
    )
  );

  return result_record;
end;
$$;

revoke all on function app_content.publish_record(
  uuid,
  text,
  text,
  integer,
  text,
  jsonb
) from public;

grant execute on function app_content.publish_record(
  uuid,
  text,
  text,
  integer,
  text,
  jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table content.items enable row level security;
alter table content.publications enable row level security;
alter table content.documents enable row level security;
alter table content.topics enable row level security;
alter table content.scripture_entries enable row level security;
alter table content.scripture_relationships enable row level security;
alter table content.pathways enable row level security;
alter table content.pathway_steps enable row level security;
alter table content.objections enable row level security;
alter table content.item_topics enable row level security;
alter table content.item_relations enable row level security;
alter table content.seo_metadata enable row level security;
alter table content.revisions enable row level security;
alter table app_content.records enable row level security;
alter table ops.audit_events enable row level security;
alter table ops.outbox_events enable row level security;

drop policy if exists "read visible or editorial items" on content.items;
create policy "read visible or editorial items"
on content.items
for select
to anon, authenticated
using (
  content.item_is_website_visible(id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "contributors create items" on content.items;
create policy "contributors create items"
on content.items
for insert
to authenticated
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
  and created_by = auth.uid()
);

drop policy if exists "editors update items" on content.items;
create policy "editors update items"
on content.items
for update
to authenticated
using (
  platform.current_user_has_role(array['editor', 'publisher', 'admin'])
  or (
    platform.current_user_has_role(array['contributor'])
    and created_by = auth.uid()
    and editorial_status = 'draft'
  )
)
with check (
  platform.current_user_has_role(array['editor', 'publisher', 'admin'])
  or (
    platform.current_user_has_role(array['contributor'])
    and created_by = auth.uid()
    and editorial_status = 'draft'
  )
);

drop policy if exists "admins delete items" on content.items;
create policy "admins delete items"
on content.items
for delete
to authenticated
using (platform.current_user_has_role(array['admin']));

drop policy if exists "read item publications" on content.publications;
create policy "read item publications"
on content.publications
for select
to anon, authenticated
using (
  (
    channel = 'website'
    and status = 'published'
    and content.item_is_website_visible(content_item_id)
  )
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "publishers manage publications" on content.publications;
create policy "publishers manage publications"
on content.publications
for all
to authenticated
using (platform.current_user_has_role(array['publisher', 'admin']))
with check (platform.current_user_has_role(array['publisher', 'admin']));

-- Read policies for tables owned by a content item.
drop policy if exists "read visible documents" on content.documents;
create policy "read visible documents"
on content.documents
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible topics" on content.topics;
create policy "read visible topics"
on content.topics
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible scripture entries" on content.scripture_entries;
create policy "read visible scripture entries"
on content.scripture_entries
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible pathways" on content.pathways;
create policy "read visible pathways"
on content.pathways
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible objections" on content.objections;
create policy "read visible objections"
on content.objections
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

-- Editorial write policies for item-owned tables.
drop policy if exists "editors manage documents" on content.documents;
create policy "editors manage documents"
on content.documents
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage topics" on content.topics;
create policy "editors manage topics"
on content.topics
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage scripture entries" on content.scripture_entries;
create policy "editors manage scripture entries"
on content.scripture_entries
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage pathways" on content.pathways;
create policy "editors manage pathways"
on content.pathways
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage objections" on content.objections;
create policy "editors manage objections"
on content.objections
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

-- Relationships remain editorial data in V1.
drop policy if exists "read visible scripture relationships" on content.scripture_relationships;
create policy "read visible scripture relationships"
on content.scripture_relationships
for select
to anon, authenticated
using (
  content.item_is_website_visible(source_scripture_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage scripture relationships" on content.scripture_relationships;
create policy "editors manage scripture relationships"
on content.scripture_relationships
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible pathway steps" on content.pathway_steps;
create policy "read visible pathway steps"
on content.pathway_steps
for select
to anon, authenticated
using (
  content.item_is_website_visible(pathway_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage pathway steps" on content.pathway_steps;
create policy "editors manage pathway steps"
on content.pathway_steps
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible item topics" on content.item_topics;
create policy "read visible item topics"
on content.item_topics
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage item topics" on content.item_topics;
create policy "editors manage item topics"
on content.item_topics
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible item relations" on content.item_relations;
create policy "read visible item relations"
on content.item_relations
for select
to anon, authenticated
using (
  content.item_is_website_visible(source_item_id)
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage item relations" on content.item_relations;
create policy "editors manage item relations"
on content.item_relations
for all
to authenticated
using (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "read visible seo" on content.seo_metadata;
create policy "read visible seo"
on content.seo_metadata
for select
to anon, authenticated
using (
  content.item_is_website_visible(content_item_id)
  or platform.current_user_has_role(
    array['editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors manage seo" on content.seo_metadata;
create policy "editors manage seo"
on content.seo_metadata
for all
to authenticated
using (
  platform.current_user_has_role(
    array['editor', 'publisher', 'admin']
  )
)
with check (
  platform.current_user_has_role(
    array['editor', 'publisher', 'admin']
  )
);

drop policy if exists "editors read revisions" on content.revisions;
create policy "editors read revisions"
on content.revisions
for select
to authenticated
using (
  platform.current_user_has_role(
    array['editor', 'publisher', 'admin']
  )
);

drop policy if exists "publishers create revisions" on content.revisions;
create policy "publishers create revisions"
on content.revisions
for insert
to authenticated
with check (
  platform.current_user_has_role(
    array['editor', 'publisher', 'admin']
  )
);

drop policy if exists "anyone reads published app content" on app_content.records;
create policy "anyone reads published app content"
on app_content.records
for select
to anon, authenticated
using (
  status = 'published'
  or platform.current_user_has_role(
    array['contributor', 'editor', 'publisher', 'admin']
  )
);

drop policy if exists "publishers manage app content" on app_content.records;
create policy "publishers manage app content"
on app_content.records
for all
to authenticated
using (platform.current_user_has_role(array['publisher', 'admin']))
with check (platform.current_user_has_role(array['publisher', 'admin']));

drop policy if exists "admins read audit events" on ops.audit_events;
create policy "admins read audit events"
on ops.audit_events
for select
to authenticated
using (platform.current_user_has_role(array['admin']));

drop policy if exists "publishers insert audit events" on ops.audit_events;
create policy "publishers insert audit events"
on ops.audit_events
for insert
to authenticated
with check (
  platform.current_user_has_role(array['publisher', 'admin'])
  and actor_user_id = auth.uid()
);

drop policy if exists "publishers insert outbox events" on ops.outbox_events;
create policy "publishers insert outbox events"
on ops.outbox_events
for insert
to authenticated
with check (
  platform.current_user_has_role(array['publisher', 'admin'])
);

drop policy if exists "admins manage outbox events" on ops.outbox_events;
create policy "admins manage outbox events"
on ops.outbox_events
for all
to authenticated
using (platform.current_user_has_role(array['admin']))
with check (platform.current_user_has_role(array['admin']));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema platform to authenticated;
grant usage on schema content to anon, authenticated;
grant usage on schema app_content to anon, authenticated;
grant usage on schema ops to authenticated;

grant select on content.items to anon, authenticated;
grant select on content.publications to anon, authenticated;
grant select on content.documents to anon, authenticated;
grant select on content.topics to anon, authenticated;
grant select on content.scripture_entries to anon, authenticated;
grant select on content.pathways to anon, authenticated;
grant select on content.objections to anon, authenticated;

grant select on content.scripture_relationships to anon, authenticated;
grant select on content.pathway_steps to anon, authenticated;
grant select on content.item_topics to anon, authenticated;
grant select on content.item_relations to anon, authenticated;
grant select on content.seo_metadata to anon, authenticated;

grant select, insert, update, delete on all tables in schema content to authenticated;
grant select on app_content.records to anon, authenticated;
grant insert, update, delete on app_content.records to authenticated;
grant select on app_content.published_records_v1 to anon, authenticated;
grant select on app_content.manifest_v1 to anon, authenticated;
grant select, insert on ops.audit_events to authenticated;
grant select, insert, update, delete on ops.outbox_events to authenticated;
grant select, insert, update, delete on platform.user_roles to authenticated;

grant usage, select on sequence app_content.content_version_seq to authenticated;

commit;
