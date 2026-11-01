create table if not exists public.studio_episode_articles (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null unique references public.video_producer_episode_scripts(id) on delete cascade,
  title text not null,
  slug text not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','ready','published','archived')),
  primary_pathway_slug text,
  source_script_updated_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_episode_articles_updated_idx
  on public.studio_episode_articles(updated_at desc);
