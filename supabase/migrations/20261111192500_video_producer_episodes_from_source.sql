-- Parent source podcast can now own mini episode podcasts as well as Reels.
-- A Reel may be attached to the mini episode it was cut from.
alter table public.video_producer_projects
  drop constraint if exists video_producer_parent_reels_only;

create unique index if not exists video_producer_unique_child_source_window
 on public.video_producer_projects(parent_project_id,mode,source_range_start,source_range_end)
 where parent_project_id is not null and deleted_at is null
   and source_range_start is not null and source_range_end is not null;
