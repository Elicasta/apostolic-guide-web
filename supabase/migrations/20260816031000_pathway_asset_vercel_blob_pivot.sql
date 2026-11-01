-- Production pivot for environments that already created the ingest ledger
-- with Supabase Storage defaults and a 1 GB file-size constraint.

alter table public.studio_pathway_asset_uploads
  alter column storage_bucket set default 'vercel_blob';

alter table public.studio_pathway_asset_uploads
  drop constraint if exists studio_pathway_asset_uploads_file_size_check;

alter table public.studio_pathway_asset_uploads
  add constraint studio_pathway_asset_uploads_file_size_check
  check (file_size > 0 and file_size <= 21474836480);

update public.studio_pathway_asset_uploads
set status = 'expired',
    error_message = 'Upload session retired during Vercel Blob storage migration.',
    updated_at = now()
where storage_bucket <> 'vercel_blob'
  and status in ('prepared','uploading','paused','uploaded','failed');
