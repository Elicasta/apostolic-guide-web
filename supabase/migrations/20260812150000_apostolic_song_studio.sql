create table if not exists public.song_style_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  musical_family text not null default '',
  vocal_texture text not null default '',
  instrumentation text[] not null default '{}',
  tempo_min integer check (tempo_min is null or tempo_min between 40 and 220),
  tempo_max integer check (tempo_max is null or tempo_max between 40 and 220),
  energy integer not null default 50 check (energy between 0 and 100),
  congregation_fit integer not null default 80 check (congregation_fit between 0 and 100),
  suno_style_prompt text not null default '',
  negative_style_notes text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled Song',
  working_title text not null default 'Untitled Song',
  status text not null default 'idea' check (status in ('idea','writing','theology_review','ready_for_suno','in_production','final','distributed','archived')),
  song_type text not null default 'declaration' check (song_type in ('declaration','adoration','christology','gospel','response','pentecost','testimony','consecration','anthem','hymn')),
  theological_center text not null default '',
  core_scriptures text[] not null default '{}',
  audience_context text not null default 'Congregational church worship',
  desired_tone text not null default 'Scripture-rich, reverent, singable',
  creative_brief text not null default '',
  style_profile_id uuid references public.song_style_profiles(id) on delete set null,
  current_draft_id uuid,
  suno_style_prompt text not null default '',
  suno_production_notes text not null default '',
  suno_negative_prompt text not null default '',
  final_audio_url text,
  final_video_url text,
  cover_art_url text,
  distribution_metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.song_projects(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null default '',
  lyrics text not null default '',
  structure jsonb not null default '{}'::jsonb,
  notes text not null default '',
  source text not null default 'human' check (source in ('human','ai','hybrid')),
  ai_model text,
  ai_response_id text,
  ai_usage jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(project_id, version)
);

alter table public.song_projects
  drop constraint if exists song_projects_current_draft_id_fkey;
alter table public.song_projects
  add constraint song_projects_current_draft_id_fkey foreign key (current_draft_id) references public.song_drafts(id) on delete set null;

create table if not exists public.song_evaluations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.song_drafts(id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  overall_score integer not null default 0 check (overall_score between 0 and 100),
  gate_status text not null default 'blocked' check (gate_status in ('blocked','needs_work','ready_for_suno')),
  strengths jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  scripture_references text[] not null default '{}',
  theological_notes jsonb not null default '[]'::jsonb,
  mechanics jsonb not null default '{}'::jsonb,
  model text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.song_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.song_projects(id) on delete cascade,
  draft_id uuid references public.song_drafts(id) on delete set null,
  generation_type text not null check (generation_type in ('write','refine','evaluate','suno_prompt')),
  model text not null,
  prompt_version text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  response_id text,
  usage jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.song_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.song_projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('suno_audio','mix','master','cover','video','stems','other')),
  storage_bucket text,
  storage_path text,
  external_url text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  is_final boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

create index if not exists song_projects_status_updated_idx on public.song_projects(status, updated_at desc);
create index if not exists song_projects_created_by_idx on public.song_projects(created_by, updated_at desc);
create index if not exists song_drafts_project_version_idx on public.song_drafts(project_id, version desc);
create index if not exists song_evaluations_draft_created_idx on public.song_evaluations(draft_id, created_at desc);
create index if not exists song_generations_project_created_idx on public.song_generations(project_id, created_at desc);
create index if not exists song_assets_project_created_idx on public.song_assets(project_id, created_at desc);

alter table public.song_style_profiles enable row level security;
alter table public.song_projects enable row level security;
alter table public.song_drafts enable row level security;
alter table public.song_evaluations enable row level security;
alter table public.song_generations enable row level security;
alter table public.song_assets enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'song-assets',
  'song-assets',
  false,
  1073741824,
  array['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','video/mp4','image/jpeg','image/png','image/webp','application/zip']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.song_style_profiles (
  name, slug, description, musical_family, vocal_texture, instrumentation,
  tempo_min, tempo_max, energy, congregation_fit, suno_style_prompt, negative_style_notes, is_system
) values
(
  'Modern Apostolic Hymn', 'modern-apostolic-hymn',
  'Scripture-dense verses with a broad, memorable congregational refrain.',
  'Modern hymn / church ensemble', 'Clear lead with warm congregational lift',
  array['piano','acoustic guitar','warm organ','restrained drums','bass','choir lift'],
  68, 82, 58, 96,
  'modern congregational hymn, Scripture-rich, organic piano and acoustic guitar, warm organ, restrained live drums, strong melody, spacious verses, broad church chorus, natural room, emotional lift without pop gloss',
  array['arena-pop sheen','EDM drops','breathy indie affect','over-singing','cinematic trailer drums'], true
),
(
  'Pentecostal Choir', 'pentecostal-choir',
  'Call-and-response energy with room for choir answers, vamp, and live church dynamics.',
  'Pentecostal gospel / choir', 'Lead-and-choir call and response',
  array['Hammond organ','piano','electric bass','live drums','handclaps','choir'],
  92, 124, 88, 92,
  'Pentecostal gospel choir, live church energy, Hammond organ, piano, bass and drums, clear call and response, singable refrain, dynamic choir answers, authentic room, vamp-ready ending, joyful but musically disciplined',
  array['trap hats','hyperpop synths','smooth-jazz noodling','overly complex melisma on congregational hook'], true
),
(
  'Piano Prayer', 'piano-prayer',
  'Intimate Scripture prayer that can live with almost no production.',
  'Prayer / devotional worship', 'Close, honest lead vocal with light harmony',
  array['piano','soft pad','subtle strings'],
  58, 72, 35, 84,
  'intimate church prayer song, felt piano, close natural lead vocal, restrained harmony, subtle pad and strings, slow breathing phrases, no production tricks, reverent unresolved space, lyrics forward',
  array['epic build','stadium drums','vocal chops','ambient wash that obscures words'], true
),
(
  'Scripture Anthem', 'scripture-anthem',
  'A declarative biblical text carried by a large but simple chorus.',
  'Congregational anthem', 'Strong unison lead growing into full room',
  array['piano','electric guitar','bass','live drums','organ','group vocals'],
  76, 98, 78, 95,
  'congregational Scripture anthem, strong unison melody, piano and live band, tasteful electric guitar, organ support, direct declarative verses, huge simple chorus built for a church room, organic dynamics, no glossy pop production',
  array['festival EDM','syncopated hook too complex for a room','cinematic sound-design intro'], true
),
(
  'Gospel Declaration', 'gospel-declaration',
  'Theological declaration with groove, repetition, and a chorus the room can own quickly.',
  'Contemporary gospel / church band', 'Rhythmic lead with responsive backgrounds',
  array['piano','organ','bass','drums','rhythm guitar','background vocals'],
  86, 112, 76, 90,
  'contemporary gospel church band, pocket-driven live drums and bass, piano and organ, rhythmic but singable lead, responsive background vocals, doctrinal declaration, memorable repeated chorus, live-room dynamics',
  array['radio-pop polish','busy runs on every line','novelty gospel tropes','electronic drop'], true
),
(
  'Acoustic Testimony', 'acoustic-testimony',
  'Story-forward testimony with plain language and a chorus that turns the story toward worship.',
  'Acoustic testimony / folk church', 'Natural conversational lead with communal harmony',
  array['acoustic guitar','piano','upright-style bass','light percussion','group harmony'],
  70, 92, 52, 86,
  'organic acoustic testimony song, warm acoustic guitar, piano, light live percussion, natural vocal, story-forward verses, communal harmony on chorus, restrained arrangement, church-friendly melody, no commercial folk affectation',
  array['whistling hook','stomp-clap cliché','indie vocal fry','overproduced pop chorus'], true
)
on conflict (slug) do nothing;
