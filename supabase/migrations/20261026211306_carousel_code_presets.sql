-- Reusable text-based themes. Access is exclusively through manage_content admin APIs.
create table public.studio_carousel_code_presets (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 name text not null check (char_length(name) between 1 and 100),
 theme jsonb not null check (jsonb_typeof(theme) = 'object'),
 created_at timestamptz not null default now()
);
alter table public.studio_carousel_code_presets enable row level security;
revoke all on public.studio_carousel_code_presets from public, anon, authenticated;
grant select, insert, update, delete on public.studio_carousel_code_presets to service_role;
create index studio_carousel_code_presets_owner on public.studio_carousel_code_presets(created_by, created_at desc);
