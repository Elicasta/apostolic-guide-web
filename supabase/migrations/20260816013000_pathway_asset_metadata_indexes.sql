-- Pathway Assets uses JSONB metadata for operational DAM fields such as tags,
-- descriptions, alt text, favorites, and upload fingerprints. Keep these queries
-- fast as the asset library grows.

create index if not exists studio_pathway_assets_metadata_gin_idx
  on public.studio_pathway_assets using gin (metadata jsonb_path_ops);

create index if not exists studio_pathway_assets_pathway_status_idx
  on public.studio_pathway_assets(pathway_slug, status, updated_at desc);

comment on index public.studio_pathway_assets_metadata_gin_idx is
  'Supports metadata containment lookups such as SHA-256 duplicate detection and future tag/metadata filters.';
