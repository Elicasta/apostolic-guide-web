begin;

create table if not exists public.pathway_audio_scripts (
  pathway_slug text primary key,
  script_text text not null,
  source_hash text not null,
  script_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  model text,
  generated_at timestamptz,
  generated_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pathway_audio_script_length check (char_length(script_text) between 100 and 4096)
);

create index if not exists pathway_audio_scripts_status_idx
on public.pathway_audio_scripts (status, updated_at desc);

alter table public.pathway_audio_scripts enable row level security;
revoke all on public.pathway_audio_scripts from anon, authenticated;

comment on table public.pathway_audio_scripts is 'Editorial narration scripts derived from canonical Pathways. Service-role only; approval is required before TTS.';

commit;
