-- Machine tokens are explicitly draft scoped and hashed at rest.
create table if not exists public.video_producer_agent_tokens(
 id uuid primary key default gen_random_uuid(),
 label text not null check (char_length(label) between 1 and 100),
 token_hash text not null unique check (length(token_hash)=64),
 scopes text[] not null check (scopes <@ array[
  'draft:projects','draft:timeline','draft:assets','draft:preview','draft:read'
 ]::text[]),
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 last_used_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.video_producer_agent_tokens enable row level security;
revoke all on public.video_producer_agent_tokens from public, anon, authenticated;
grant all on public.video_producer_agent_tokens to service_role;
create index if not exists video_producer_agent_tokens_expiry on public.video_producer_agent_tokens(expires_at) where revoked_at is null;

create table if not exists public.video_producer_agent_asset_uploads (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.video_producer_projects(id) on delete cascade,
 agent_token_id uuid not null references public.video_producer_agent_tokens(id) on delete cascade,
 pathname text not null unique check (pathname like 'video-producer/agent-assets/%'),
 filename text not null,
 content_type text not null check(content_type in ('image/png','image/jpeg','image/webp')),
 byte_size bigint not null check (byte_size between 1 and 5242880),
 status text not null default 'issued' check(status in ('issued','registered','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
alter table public.video_producer_agent_asset_uploads enable row level security;
revoke all on public.video_producer_agent_asset_uploads from public, anon, authenticated;
grant all on public.video_producer_agent_asset_uploads to service_role;

create table if not exists public.video_producer_agent_previews (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.video_producer_projects(id) on delete cascade,
 agent_token_id uuid not null references public.video_producer_agent_tokens(id) on delete cascade,
 status text not null default 'queued' check (status in ('queued','rendering','completed','failed')),
 source_revision text not null,
 output_storage_path text not null,
 callback_token_hash text not null check(length(callback_token_hash)=64),
 error text,
 requested_at timestamptz not null default now(),
 completed_at timestamptz,
 expires_at timestamptz not null
);
alter table public.video_producer_agent_previews enable row level security;
revoke all on public.video_producer_agent_previews from public, anon, authenticated;
grant all on public.video_producer_agent_previews to service_role;
create index if not exists video_producer_agent_previews_project_idx on public.video_producer_agent_previews(project_id,requested_at desc);
