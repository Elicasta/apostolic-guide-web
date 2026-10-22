-- Ekegusii lesson correction workflow. Service role only; admin auth is checked server-side.
create table if not exists public.ekegusii_corrections (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null check (length(pathway_slug) between 2 and 100),
  step_index integer not null check (step_index between 0 and 149),
  scripture_reference text not null check (length(scripture_reference) between 3 and 160),
  reviewer_name text not null check (length(reviewer_name) between 2 and 120),
  reviewer_email text not null check (length(reviewer_email) between 3 and 320),
  reviewer_location text not null default '',
  proposed_title text not null default '',
  proposed_explanation text not null default '',
  proposed_hook text not null default '',
  reviewer_notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','in_review','approved','rejected','published')),
  admin_notes text not null default '',
  edited_title text,
  edited_explanation text,
  edited_hook text,
  inbox_conversation_id uuid references public.inbox_conversations(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ekegusii_corrections_queue_idx on public.ekegusii_corrections(status, created_at desc);
create index if not exists ekegusii_corrections_pathway_idx on public.ekegusii_corrections(pathway_slug, step_index, created_at desc);
create table if not exists public.ekegusii_published_steps (
  pathway_slug text not null,
  step_index integer not null,
  title text not null,
  explanation text not null,
  hook text not null default '',
  correction_id uuid not null references public.ekegusii_corrections(id),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  primary key(pathway_slug, step_index)
);
create index if not exists ekegusii_published_steps_revision_idx on public.ekegusii_published_steps(correction_id);
alter table public.ekegusii_corrections enable row level security;
alter table public.ekegusii_published_steps enable row level security;
revoke all on public.ekegusii_corrections from public, anon, authenticated;
revoke all on public.ekegusii_published_steps from public, anon, authenticated;
grant all on public.ekegusii_corrections to service_role;
grant all on public.ekegusii_published_steps to service_role;
comment on table public.ekegusii_corrections is 'Private moderated corrections received for Ekegusii teaching drafts; public never reads reviewer details.';
comment on table public.ekegusii_published_steps is 'Admin-approved verse teaching overlays; read only through server-rendered public Pathway pages.';