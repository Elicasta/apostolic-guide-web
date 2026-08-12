create table if not exists public.pathway_video_publishing_kits (
  pathway_slug text primary key,
  audio_content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  thumbnail_background_url text,
  thumbnail_storage_path text,
  text_model text,
  image_model text,
  image_quality text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pathway_video_publishing_kits enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pathway-thumbnail', 'pathway-thumbnail', true, 20971520, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
