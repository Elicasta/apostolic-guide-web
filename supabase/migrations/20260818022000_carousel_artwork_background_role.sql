-- Allow Carousel Studio's generated visual layer to stay linked to its Creative Project.
-- Generated art is not a final render, cover, source upload, or style reference, so it
-- gets its own explicit role instead of overloading one of those existing meanings.

alter table public.studio_creative_project_assets
  drop constraint if exists studio_creative_project_assets_role_check;

alter table public.studio_creative_project_assets
  add constraint studio_creative_project_assets_role_check
  check (role in ('render', 'cover', 'source', 'reference', 'background'));

comment on column public.studio_creative_project_assets.role is
  'Project asset relationship: render, cover, source, reference, or generated artwork background.';
