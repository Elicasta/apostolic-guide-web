-- Update and archive commands for website-owned editorial content.

begin;

create or replace function content.update_editorial_item(
  p_item_id uuid,
  p_slug text,
  p_title text,
  p_summary text,
  p_body text,
  p_publish_website boolean,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item content.items;
  v_revision integer;
begin
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid slug';
  end if;

  -- Executable only by the service role. The application route authenticates the actor.

  select * into v_item
  from content.items
  where id = p_item_id
    and source_system = 'website'
    and deleted_at is null
  for update;

  if v_item.id is null then
    raise exception 'Website content item not found';
  end if;

  update content.items
  set slug = p_slug,
      source_key = kind || ':' || p_slug,
      title = p_title,
      summary = p_summary,
      editorial_status = case when p_publish_website then 'approved' else 'draft' end,
      visibility = case when p_publish_website then 'public' else 'private' end,
      updated_by = p_actor_user_id,
      updated_at = now()
  where id = p_item_id
  returning * into v_item;

  insert into content.documents (content_item_id, body_json, body_schema_version, updated_at)
  values (
    p_item_id,
    jsonb_build_object(
      'type', 'doc',
      'version', 1,
      'blocks', jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(),
          'type', 'paragraph',
          'version', 1,
          'data', jsonb_build_object('text', p_body)
        )
      )
    ),
    1,
    now()
  )
  on conflict (content_item_id)
  do update set body_json = excluded.body_json,
                body_schema_version = excluded.body_schema_version,
                updated_at = excluded.updated_at;

  if v_item.kind = 'topic' then
    insert into content.topics (content_item_id, claim)
    values (p_item_id, p_summary)
    on conflict (content_item_id)
    do update set claim = excluded.claim;
  end if;

  insert into content.publications (
    content_item_id, channel, status, published_at, created_by, updated_by
  ) values (
    p_item_id,
    'website',
    case when p_publish_website then 'published' else 'draft' end,
    case when p_publish_website then now() end,
    p_actor_user_id,
    p_actor_user_id
  )
  on conflict (content_item_id, channel)
  do update set status = excluded.status,
                published_at = case
                  when excluded.status = 'published'
                    then coalesce(content.publications.published_at, now())
                  else content.publications.published_at
                end,
                updated_by = p_actor_user_id,
                updated_at = now();

  select coalesce(max(revision_number), 0) + 1
  into v_revision
  from content.revisions
  where content_item_id = p_item_id;

  insert into content.revisions (
    content_item_id, revision_number, snapshot, change_summary, created_by
  ) values (
    p_item_id,
    v_revision,
    jsonb_build_object(
      'item', to_jsonb(v_item),
      'body', p_body,
      'websitePublished', p_publish_website
    ),
    'Editorial content updated',
    p_actor_user_id
  );

  insert into ops.audit_events (
    actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_user_id,
    case when p_publish_website then 'content.update_and_publish' else 'content.update_draft' end,
    'content_item',
    p_item_id,
    jsonb_build_object('kind', v_item.kind, 'slug', p_slug, 'revision', v_revision)
  );

  insert into ops.outbox_events (
    event_type, aggregate_type, aggregate_id, payload
  ) values (
    case when p_publish_website then 'CONTENT_PUBLISHED' else 'CONTENT_UPDATED' end,
    'content_item',
    p_item_id,
    jsonb_build_object('kind', v_item.kind, 'slug', p_slug, 'revision', v_revision)
  );

  return jsonb_build_object(
    'id', v_item.id,
    'kind', v_item.kind,
    'slug', v_item.slug,
    'title', v_item.title,
    'status', v_item.editorial_status,
    'revision', v_revision
  );
end;
$$;

create or replace function content.archive_editorial_item(
  p_item_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item content.items;
begin
  -- Executable only by the service role. The application route authenticates the actor.

  update content.items
  set editorial_status = 'archived',
      visibility = 'private',
      updated_by = p_actor_user_id,
      updated_at = now()
  where id = p_item_id
    and source_system = 'website'
    and deleted_at is null
  returning * into v_item;

  if v_item.id is null then raise exception 'Website content item not found'; end if;

  update content.publications
  set status = 'archived', updated_by = p_actor_user_id, updated_at = now()
  where content_item_id = p_item_id and channel = 'website';

  insert into ops.audit_events (actor_user_id, action, resource_type, resource_id, metadata)
  values (p_actor_user_id, 'content.archive', 'content_item', p_item_id, jsonb_build_object('kind', v_item.kind, 'slug', v_item.slug));

  insert into ops.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values ('CONTENT_ARCHIVED', 'content_item', p_item_id, jsonb_build_object('kind', v_item.kind, 'slug', v_item.slug));
end;
$$;

revoke all on function content.update_editorial_item(uuid, text, text, text, text, boolean, uuid)
from public, anon, authenticated;
revoke all on function content.archive_editorial_item(uuid, uuid)
from public, anon, authenticated;

grant execute on function content.update_editorial_item(uuid, text, text, text, text, boolean, uuid)
to service_role;
grant execute on function content.archive_editorial_item(uuid, uuid)
to service_role;

commit;
