-- 202608100001_localization_foundation.sql
-- Additive localization foundation for Apostolic Guide / Guía Apostólica.
-- Safe by design: no existing English content is moved, rewritten, or deleted.

begin;

create table if not exists content.translation_groups (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  source_locale text not null default 'en-US',
  source_content_item_id uuid references content.items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content.translation_entries (
  id uuid primary key default gen_random_uuid(),
  translation_group_id uuid not null references content.translation_groups(id) on delete cascade,
  content_item_id uuid not null references content.items(id) on delete cascade,
  locale text not null,
  translation_status text not null default 'not_started' check (
    translation_status in (
      'not_started',
      'draft',
      'review',
      'approved',
      'published',
      'needs_revision'
    )
  ),
  source_content_item_id uuid references content.items(id) on delete set null,
  source_revision bigint,
  translated_from_revision bigint,
  translator_type text check (
    translator_type is null or translator_type in ('human', 'ai_assisted', 'machine')
  ),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (translation_group_id, locale),
  unique (content_item_id)
);

create index if not exists translation_entries_locale_status_idx
on content.translation_entries (locale, translation_status);

create index if not exists translation_entries_group_idx
on content.translation_entries (translation_group_id);

-- The original shared content schema already included content.items.translation_group_id.
-- We add a NOT VALID FK so existing production rows are not scanned or blocked during rollout.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_items_translation_group_id_fkey'
      and conrelid = 'content.items'::regclass
  ) then
    alter table content.items
      add constraint content_items_translation_group_id_fkey
      foreign key (translation_group_id)
      references content.translation_groups(id)
      on delete set null
      not valid;
  end if;
end
$$;

-- Non-unique lookup index only. We intentionally do not tighten existing English
-- uniqueness constraints during the localization rollout.
create index if not exists content_items_locale_kind_slug_lookup_idx
on content.items (locale, kind, slug)
where deleted_at is null;

-- Optional preference column. Existing users remain unchanged because null means
-- "use current application behavior/default English" during the compatibility phase.
alter table if exists public.profiles
  add column if not exists preferred_locale text;

commit;
