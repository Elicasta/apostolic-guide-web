create table if not exists public.studio_threads_batches (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  topic text,
  voice text not null default 'serious-witty',
  status text not null default 'draft' check (status in ('draft','reviewed','approved','scheduled','completed','cancelled')),
  doctrine_status text check (doctrine_status in ('pass','warning','blocked')),
  doctrine_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_threads_posts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.studio_threads_batches(id) on delete cascade,
  position integer not null default 0,
  category text not null check (category in ('oneness','scripture','witty','question','prayer-news','app','response')),
  body text not null,
  source_title text,
  source_url text,
  source_summary text,
  doctrine_status text check (doctrine_status in ('pass','warning','blocked')),
  doctrine_notes text,
  status text not null default 'draft' check (status in ('draft','approved','scheduled','publishing','published','failed','rejected','cancelled')),
  scheduled_for timestamptz,
  published_at timestamptz,
  threads_post_id text,
  threads_permalink text,
  x_status text not null default 'off' check (x_status in ('off','mirror-later','scheduled','published','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_threads_batches_week_idx on public.studio_threads_batches(week_start desc);
create index if not exists studio_threads_posts_batch_idx on public.studio_threads_posts(batch_id, position);
create index if not exists studio_threads_posts_schedule_idx on public.studio_threads_posts(status, scheduled_for);

alter table public.studio_threads_batches enable row level security;
alter table public.studio_threads_posts enable row level security;
