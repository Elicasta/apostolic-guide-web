-- The connected Supabase organization is currently on the Free plan.
-- Keep the bucket aligned with the provider's 50 MB global ceiling so the
-- Studio never advertises or accepts a source size Storage cannot persist.
update storage.buckets
set file_size_limit = 52428800
where id = 'studio-pathway-assets';
