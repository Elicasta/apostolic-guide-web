alter table public.video_producer_graphic_assets
  add column if not exists formats text[] not null default array['podcast','reels']::text[],
  add column if not exists text_behavior text not null default 'none',
  add column if not exists max_lines smallint,
  add column if not exists text_alignment text not null default 'center',
  add column if not exists reference_zone text not null default 'full-frame',
  add column if not exists display_behavior text not null default 'full-screen',
  add column if not exists fixed_text text;

alter table public.video_producer_graphic_assets
  add constraint video_producer_graphic_assets_formats_check
    check (cardinality(formats) between 1 and 2 and formats <@ array['podcast','reels']::text[]),
  add constraint video_producer_graphic_assets_text_behavior_check
    check (text_behavior in ('none','editable','fixed')),
  add constraint video_producer_graphic_assets_max_lines_check
    check (
      (text_behavior = 'none' and max_lines is null)
      or
      (text_behavior in ('editable','fixed') and max_lines between 1 and 12)
    ),
  add constraint video_producer_graphic_assets_text_alignment_check
    check (text_alignment in ('left','center','right')),
  add constraint video_producer_graphic_assets_reference_zone_check
    check (reference_zone in ('full-frame','safe-center','upper-third','lower-third','left-panel','right-panel')),
  add constraint video_producer_graphic_assets_display_behavior_check
    check (display_behavior in ('full-screen','lower-third','persistent')),
  add constraint video_producer_graphic_assets_fixed_text_check
    check (
      (text_behavior = 'fixed' and nullif(btrim(fixed_text), '') is not null)
      or
      (text_behavior <> 'fixed' and fixed_text is null)
    );

create index if not exists video_producer_graphic_assets_formats_idx
  on public.video_producer_graphic_assets using gin (formats);

comment on column public.video_producer_graphic_assets.kind is
  'Asset type: logo, Scripture frame, pathway frame, lower third, statement, CTA, texture, overlay, or other.';
comment on column public.video_producer_graphic_assets.formats is
  'Video Producer output formats this asset supports: podcast, reels, or both.';
comment on column public.video_producer_graphic_assets.text_behavior is
  'Whether the artwork has no text, replaceable text, or fixed baked-in text.';
comment on column public.video_producer_graphic_assets.max_lines is
  'Maximum supported text lines. Required for editable or fixed text and null when text_behavior is none.';
comment on column public.video_producer_graphic_assets.text_alignment is
  'Intended text alignment within the reference zone.';
comment on column public.video_producer_graphic_assets.reference_zone is
  'Named composition zone used to place or replace text consistently.';
comment on column public.video_producer_graphic_assets.display_behavior is
  'Whether the asset is full-screen, a lower third, or a persistent overlay.';
comment on column public.video_producer_graphic_assets.fixed_text is
  'Exact text baked into fixed-text artwork; null for no-text and editable-text assets.';
comment on column public.video_producer_graphic_assets.notes is
  'Usage guidance and variant notes for editors and automated planning.';
