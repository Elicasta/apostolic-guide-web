begin;

update storage.buckets
set allowed_mime_types = array['audio/mpeg']
where id = 'pathway-audio';

commit;
