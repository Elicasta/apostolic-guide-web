-- Pathway source-media ingest ledger.
-- Large source bytes live in Vercel Blob. Supabase stores the durable DAM
-- record, upload state, ownership, provenance, and downstream relationships.

alter table public.studio_pathway_assets
  drop constraint if exists studio_pathway_assets_asset_type_check;

alter table public.studio_pathway_assets
  add constraint studio_pathway_assets_asset_type_check check (
    asset_type = any (array[
      'carousel-deck','carousel-slide','single-post','story-set','story-frame','thumbnail',
      'generated-image','uploaded-image','caption','video-project','video-render','video-thumbnail',
      'uploaded-video','source-audio','source-document','source-archive','other'
    ]::text[])
  );

create table if not exists public.studio_pathway_asset_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pathway_slug text not null,
  studio text not null check (studio in ('carousel','video')),
  asset_type text not null check (asset_type in ('uploaded-image','uploaded-video','source-audio','source-document','source-archive')),
  storage_bucket text not null default 'vercel_blob',
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 21474836480),
  last_modified bigint,
  client_fingerprint text,
  sha256 text,
  media_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'prepared' check (status in ('prepared','uploading','paused','uploaded','finalized','failed','cancelled','expired')),
  bytes_uploaded bigint not null default 0 check (bytes_uploaded >= 0),
  tus_url text,
  asset_id uuid references public.studio_pathway_assets(id) on delete set null,
  error_message text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_pathway_asset_uploads_user_status_idx
  on public.studio_pathway_asset_uploads (user_id, status, updated_at desc);
create index if not exists studio_pathway_asset_uploads_pathway_idx
  on public.studio_pathway_asset_uploads (pathway_slug, updated_at desc);
create index if not exists studio_pathway_asset_uploads_fingerprint_idx
  on public.studio_pathway_asset_uploads (user_id, client_fingerprint, expires_at desc)
  where client_fingerprint is not null;
create index if not exists studio_pathway_asset_uploads_expiry_idx
  on public.studio_pathway_asset_uploads (expires_at)
  where status not in ('finalized','cancelled','expired');

alter table public.studio_pathway_asset_uploads enable row level security;
revoke all on public.studio_pathway_asset_uploads from public, anon, authenticated;
grant all on public.studio_pathway_asset_uploads to service_role;
