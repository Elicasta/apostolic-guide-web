begin;

-- Forge and the current lossless Pathway audio pipeline persist mastered WAV
-- files. Preserve MP3 compatibility for historical assets.
update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'audio/wav', 'audio/x-wav']
where id = 'pathway-audio';

commit;
