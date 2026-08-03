-- Minimal command RPC used by the V1 editorial admin.
-- The website server validates authorization before calling this service-role-only function.

begin;

create or replace function content.create_editorial_item(
  p_kind text,
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
  v_status text;
begin
  if p_kind not in ('article', 'answer', 'topic') then
    raise exception 'Unsupported content kind';
  end if;

  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid slug';
  end if;

  -- This function is executable only by the service role. The application
  -- route authenticates the actor before calling it.


  v_status := case when p_publish_website then 'approved' else 'draft' end;

  insert into content.items (
    kind,
    locale,
    source_system,
    source_key,
    slug,
    title,
    summary,
    editorial_status,
    visibility,
    created_by,
    updated_by
  ) values (
    p_kind,
    'en-US',
    'website',
    p_kind || ':' || p_slug,
    p_slug,
    p_title,
    p_summary,
    v_status,
    case when p_publish_website then 'public' else 'private' end,
    p_actor_user_id,
    p_actor_user_id
  )
  returning * into v_item;

  insert into content.documents (
    content_item_id,
    body_json,
    body_schema_version
  ) values (
    v_item.id,
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
    1
  );

  if p_kind = 'topic' then
    insert into content.topics (content_item_id, claim)
    values (v_item.id, p_summary);
  end if;

  insert into content.publications (
    content_item_id,
    channel,
    status,
    published_at,
    created_by,
    updated_by
  ) values (
    v_item.id,
    'website',
    case when p_publish_website then 'published' else 'draft' end,
    case when p_publish_website then now() end,
    p_actor_user_id,
    p_actor_user_id
  );

  insert into content.revisions (
    content_item_id,
    revision_number,
    snapshot,
    change_summary,
    created_by
  ) values (
    v_item.id,
    1,
    jsonb_build_object(
      'item', to_jsonb(v_item),
      'body', p_body,
      'websitePublished', p_publish_website
    ),
    'Initial editorial draft',
    p_actor_user_id
  );

  insert into ops.audit_events (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_actor_user_id,
    case when p_publish_website then 'content.publish_website' else 'content.create_draft' end,
    'content_item',
    v_item.id,
    jsonb_build_object('kind', p_kind, 'slug', p_slug)
  );

  insert into ops.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    case when p_publish_website then 'CONTENT_PUBLISHED' else 'CONTENT_CREATED' end,
    'content_item',
    v_item.id,
    jsonb_build_object('kind', p_kind, 'slug', p_slug)
  );

  return jsonb_build_object(
    'id', v_item.id,
    'kind', v_item.kind,
    'slug', v_item.slug,
    'title', v_item.title,
    'status', v_status
  );
end;
$$;

revoke all on function content.create_editorial_item(
  text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;

grant execute on function content.create_editorial_item(
  text, text, text, text, text, boolean, uuid
) to service_role;

commit;
