-- Allow A/B test thumbnails while old AG thumbnail rows remain readable.
alter table public.video_producer_thumbnails
  drop constraint if exists video_producer_thumbnails_variant_check;
alter table public.video_producer_thumbnails
  add constraint video_producer_thumbnails_variant_check
  check (variant in ('face-hook','doctrine','pathway','A','B'));
