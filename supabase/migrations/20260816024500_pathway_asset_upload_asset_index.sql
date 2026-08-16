create index if not exists studio_pathway_asset_uploads_asset_idx
  on public.studio_pathway_asset_uploads (asset_id)
  where asset_id is not null;
