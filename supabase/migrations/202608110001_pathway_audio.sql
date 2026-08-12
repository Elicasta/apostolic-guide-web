begin;

create table if not exists content.pathway_audio_assets (
  pathway_slug text primary key,
  audio_url text not null,
  storage_path text not null,
  content_hash text not null,
  model text not null,
  voice text not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pathway_audio_generated_at_idx
on content.pathway_audio_assets (generated_at desc);

alter table content.pathway_audio_assets enable row level security;
revoke all on content.pathway_audio_assets from anon, authenticated;
grant select on content.pathway_audio_assets to authenticated;

drop policy if exists "editors read pathway audio" on content.pathway_audio_assets;
create policy "editors read pathway audio"
on content.pathway_audio_assets for select
to authenticated
using (platform.current_user_has_role(array['editor', 'publisher', 'admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pathway-audio', 'pathway-audio', true, 52428800, array['audio/mpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table analytics.events drop constraint if exists events_event_name_check;
alter table analytics.events add constraint events_event_name_check check (
  event_name in (
    'page_viewed',
    'presence_heartbeat',
    'topic_opened',
    'answer_opened',
    'article_opened',
    'scripture_opened',
    'search_submitted',
    'search_result_opened',
    'search_no_results',
    'article_completed',
    'pathway_started',
    'pathway_step_completed',
    'app_link_clicked',
    'content_shared',
    'audio_started',
    'audio_progress',
    'audio_completed'
  )
);

commit;
