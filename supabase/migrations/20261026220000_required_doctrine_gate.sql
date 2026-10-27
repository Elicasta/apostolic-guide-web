-- Required doctrine verdicts. Existing published material intentionally starts Not checked.
begin;
create table if not exists public.studio_doctrine_verdicts (
 id uuid primary key default gen_random_uuid(),
 source_type text not null check (source_type in ('creative_project','threads','custom_asset','video_render','video_clip')),
 source_id uuid not null,
 content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
 status text not null check (status in ('pass','flag','fail')),
 summary text not null default '',
 issues jsonb not null default '[]'::jsonb,
 model text not null,
 checked_at timestamptz not null default now(),
 checked_by uuid references auth.users(id) on delete set null,
 override_note text,
 override_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 constraint studio_doctrine_override_only_flag check (approved_at is null or (status='flag' and nullif(btrim(override_note),'') is not null and override_by is not null))
);
create index if not exists studio_doctrine_latest_idx on public.studio_doctrine_verdicts(source_type,source_id,checked_at desc,id desc);
alter table public.studio_doctrine_verdicts enable row level security;
revoke all on public.studio_doctrine_verdicts from public,anon,authenticated;
grant select,insert,update on public.studio_doctrine_verdicts to service_role;

alter table public.studio_creative_projects
 add column if not exists doctrine_status text not null default 'not_checked' check (doctrine_status in ('not_checked','pass','flag','flagged_approved','fail')),
 add column if not exists doctrine_hash text,
 add column if not exists doctrine_checked_at timestamptz,
 add column if not exists doctrine_model text;
-- Invalidate any previous result when editor content changes. Status-only updates do not erase it.
create or replace function public.studio_clear_changed_doctrine() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.editor_state is distinct from old.editor_state or new.unified_caption is distinct from old.unified_caption or new.cta is distinct from old.cta or new.pathway_slug is distinct from old.pathway_slug) then
   new.doctrine_status='not_checked'; new.doctrine_hash=null; new.doctrine_checked_at=null; new.doctrine_model=null;
 end if;
 return new;
end; $$;
drop trigger if exists studio_clear_changed_doctrine_trigger on public.studio_creative_projects;
create trigger studio_clear_changed_doctrine_trigger before update on public.studio_creative_projects for each row execute function public.studio_clear_changed_doctrine();
commit;
