# Deployment

## GitHub

Repository:

```text
https://github.com/Elicasta/apostolic-guide-web
```

The codebase is intentionally separate from the existing app repository.

## Vercel

Create one Vercel project:

```text
Project: apostolic-guide-web
Framework: Next.js
Production branch: main
Node.js: 22.x
```

`package.json` `engines.node` is `22.x`. That field overrides the Vercel Project Settings dropdown. Vercel’s platform default is 24.x, and Node.js 20 was disabled for new deployments on October 1, 2026. Keep the engines pin on `22.x` and set the project dropdown to 22.x so they match. Do not pin an exact patch version; Vercel only selects a major version.

Domains:

```text
apostolicguide.com
www.apostolicguide.com
```

The canonical public origin is `https://www.apostolicguide.com`. The apex domain redirects to `www`. Do not reverse that redirect without a separate SEO change.

The existing app remains:

```text
app.apostolicguide.com
```

## Environment

Copy `.env.example` into Vercel production and preview environments.

Required for the public seeded website:

```text
NEXT_PUBLIC_WEBSITE_URL
NEXT_PUBLIC_APP_URL
```

Required for authentication, database publishing, and first-party analytics:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_EMAILS
```

Optional public links:

```text
NEXT_PUBLIC_CONTACT_EMAIL
NEXT_PUBLIC_YOUTUBE_URL
NEXT_PUBLIC_INSTAGRAM_URL
NEXT_PUBLIC_MUSIC_URL
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

## Supabase

The migration folder includes the existing app foundation plus the new shared schemas.

Production order:

1. Back up the database.
2. Test the migrations against a Supabase branch or local database.
3. Run `202608030001_shared_content_foundation.sql`.
4. Run `202608030004_product_analytics.sql`.
5. Run `202608030005_editorial_commands.sql`.
6. Run `202608030006_editorial_updates.sql`.
7. Deploy the app reader v2.
8. Deploy this website.
9. Verify app content sync.
10. Run the cutover migration only after the old app admin is disabled.

Expose these schemas through the Supabase API settings:

```text
public
platform
content
app_content
analytics
```

Do not expose `ops` to browser clients.

## Admin access

Create the Supabase Auth user, then assign a role:

```sql
insert into platform.user_roles (user_id, role)
values ('AUTH_USER_UUID', 'admin')
on conflict do nothing;
```

`ADMIN_EMAILS` is also supported by the application guard, but database roles remain the preferred production control.

## Health check

```text
GET /api/health
```

## Push

From the repository root:

```bash
git remote add origin https://github.com/Elicasta/apostolic-guide-web.git
git push -u origin main
```
