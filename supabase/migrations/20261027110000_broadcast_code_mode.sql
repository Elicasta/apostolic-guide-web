begin;
alter table public.studio_doctrine_verdicts drop constraint if exists studio_doctrine_verdicts_source_type_check;
alter table public.studio_doctrine_verdicts add constraint studio_doctrine_verdicts_source_type_check check (source_type in ('creative_project','threads','custom_asset','video_render','video_clip','broadcast'));
create table if not exists public.studio_broadcast_code_drafts (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 document jsonb not null check(jsonb_typeof(document)='object'),version integer not null default 1 check(version>0),
 status text not null default 'draft' check(status in ('draft','archived')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.studio_broadcast_code_revisions (
 id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.studio_broadcast_code_drafts(id) on delete cascade,
 version integer not null,document jsonb not null,actor_id uuid references auth.users(id),created_at timestamptz not null default now(),
 unique(draft_id,version)
);
create table if not exists public.studio_code_mode_presets (
 id uuid primary key default gen_random_uuid(),created_by uuid not null references auth.users(id),
 tool text not null check(tool in ('broadcast','threads','website','content_engine','episode','audio','teleprompter','video')),
 name text not null check(char_length(name) between 1 and 100),
 document jsonb not null check(jsonb_typeof(document)='object'),created_at timestamptz not null default now(),
 unique(created_by,tool,name)
);
alter table public.studio_broadcast_code_drafts enable row level security;
alter table public.studio_broadcast_code_revisions enable row level security;
alter table public.studio_code_mode_presets enable row level security;
revoke all on public.studio_broadcast_code_drafts,public.studio_broadcast_code_revisions,public.studio_code_mode_presets from public,anon,authenticated;
grant select,insert,update,delete on public.studio_broadcast_code_drafts,public.studio_broadcast_code_revisions,public.studio_code_mode_presets to service_role;
create index if not exists studio_broadcast_code_owner on public.studio_broadcast_code_drafts(owner_id,updated_at desc);
create index if not exists studio_broadcast_code_revisions_idx on public.studio_broadcast_code_revisions(draft_id,version desc);
commit;