# Apostolic Guide Content Migration Runbook

## Goal

Move the current `public.content_records` data into the shared canonical content and app projection schemas without interrupting `app.apostolicguide.com`.

## Before running anything

1. Create a Supabase database backup.
2. Export the current table:

```sql
copy (
  select *
  from public.content_records
  order by id
) to stdout with csv header;
```

3. Record counts:

```sql
select entity_type, status, count(*)
from public.content_records
group by entity_type, status
order by entity_type, status;
```

4. Confirm there is only one existing Supabase migration in the app repository and that no unpublished production migration exists elsewhere.
5. Confirm `public.user_workspaces` and `public.ai_review_suggestions` are not modified by these migrations.

## Step 1: Run migration 001

Run:

```text
202608030001_shared_content_foundation.sql
```

This is additive. The current app continues reading and writing `public.content_records`.

## Step 2: Verify the copy

Run:

```sql
select
  (select count(*) from public.content_records) as legacy_rows,
  (
    select count(*)
    from app_content.records
    where legacy_content_record_id is not null
  ) as app_projection_rows,
  (
    select count(*)
    from content.items
    where source_system = 'legacy_app'
  ) as canonical_items;
```

All three counts must match.

Verify payload identity:

```sql
select
  legacy.id,
  legacy.entity_type,
  legacy.entity_id
from public.content_records legacy
join app_content.records projected
  on projected.legacy_content_record_id = legacy.id
where legacy.payload <> projected.payload
   or legacy.status <> projected.status
   or legacy.entity_type <> projected.entity_type
   or legacy.entity_id <> projected.entity_id;
```

Expected result:

```text
0 rows
```

Verify imported content is not public on the website:

```sql
select count(*)
from content.items item
join content.publications publication
  on publication.content_item_id = item.id
where item.source_system = 'legacy_app'
  and publication.channel = 'website'
  and publication.status = 'published';
```

Expected result:

```text
0
```

Verify the legacy sync trigger:

```sql
begin;

update public.content_records
set updated_at = now()
where id = (
  select min(id)
  from public.content_records
);

select legacy.updated_at, projected.updated_at
from public.content_records legacy
join app_content.records projected
  on projected.legacy_content_record_id = legacy.id
where legacy.id = (
  select min(id)
  from public.content_records
);

rollback;
```

## Step 3: Deploy app reader v2

Update the current app repository.

The app server route must:

1. Read `app_content.manifest_v1`.
2. Read `app_content.published_records_v1`.
3. Return the versioned response contract.
4. Fall back to `public.content_records` for one release.
5. Keep compiled content as the final fallback.

Do not remove the existing compiled library.

Verify:

```text
Search
Pathways
Objections
Categories
Offline startup
Database unavailable fallback
Malformed record rejection
```

## Step 4: Deploy the website

Deploy `apostolic-guide-web`.

Initially enable:

```text
Website drafts
Website publishing
App content preview
App payload validation
```

Do not enable app publishing until the app reader v2 deployment is confirmed in production.

## Step 5: Test new app publishing

From `apostolicguide.com/admin/app-content`:

1. Edit one non-critical app record.
2. Validate its payload.
3. Publish it to the app.
4. Confirm a new `record_version`.
5. Confirm the app manifest changes.
6. Confirm the app receives the record.
7. Confirm search rebuilds.
8. Archive the test change or restore the prior revision.

## Step 6: Disable old app admin

Change:

```text
app.apostolicguide.com/admin
```

to redirect to:

```text
apostolicguide.com/admin/app-content
```

Keep app diagnostic screens under a separate protected route if needed.

## Step 7: Run migration 002

Run:

```text
202608030002_cutover_legacy_content_records.sql
```

This migration fails automatically if counts or payloads do not match.

After it succeeds:

```text
public.content_records
```

is a read-only compatibility view.

New writes happen only through:

```text
app_content.publish_record
```

## Step 8: Observe

For at least 30 days, track:

```text
Reads of the compatibility view
App content API errors
Contract validation failures
Manifest version changes
Outbox failures
Unexpected archived records
```

Do not run migration 003 while any deployed version still reads the old relation.

## Step 9: Optional retirement

Run:

```text
202608030003_retire_legacy_content_records.sql
```

only when:

1. The app no longer has a legacy fallback.
2. Vercel logs show no old client traffic requiring the compatibility view.
3. A fresh database can be built from the website repository migrations.
4. A production backup exists.

## Rollback

### Before migration 002

Rollback application deployments only. The old table remains authoritative and the sync trigger keeps the new system current.

### Immediately after migration 002

To restore legacy writes:

```sql
begin;

drop view if exists public.content_records;

alter table public.content_records_legacy
rename to content_records;

grant select, insert, update, delete
on public.content_records
to authenticated;

create trigger sync_legacy_content_record
after insert or update or delete on public.content_records
for each row execute function content.sync_legacy_content_record();

commit;
```

Recreate the original RLS write policies from the existing app migration before reopening the old admin.

### After migration 003

Restore from the Supabase backup. Migration 003 is intentionally manual because its rollback requires data restoration.
