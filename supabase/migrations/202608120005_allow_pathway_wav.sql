begin;

update storage.buckets
set allowed_mime_types = array['audio/mpeg','audio/wav','audio/x-wav','audio/wave'],
    file_size_limit = 209715200
where id = 'pathway-audio';

commit;
