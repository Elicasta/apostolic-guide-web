# Apostolic Guide Website Architecture

## System boundary

Apostolic Guide uses two repositories and one shared Supabase project.

```text
Elicasta/apostolic-guide-web
└── apostolicguide.com
    ├── Public editorial website
    ├── Admin at /admin
    ├── Product analytics
    └── Canonical content and app publishing

Elicasta/apostolicguide_updated
└── app.apostolicguide.com
    ├── Scripture search
    ├── Doctrine pathways
    ├── Objections
    ├── Curriculum
    └── Private study workspace

Shared Supabase
├── Existing app accounts and workspaces
├── Canonical editorial content
├── Versioned app projections
├── Analytics
├── Revisions and audit history
└── Publishing events
```

The repositories do not import code from one another. They communicate through the shared database and the versioned app-content payload contract.

## Repository layout

The website and its admin are one Next.js application. That is intentional. They deploy together to one Vercel project, while route guards and server-only credentials protect the admin surface.

```text
apostolic-guide-web/
├── app/
│   ├── admin/                 Protected editorial and analytics interface
│   ├── api/                   Analytics and publishing endpoints
│   ├── articles/              Public article routes
│   ├── answers/               Direct-answer routes
│   ├── pathways/              Guided-study routes
│   ├── scripture/             Curated Scripture routes
│   ├── topics/                Doctrine topic routes
│   └── ...                    Beliefs, media, search, about, links, policies
├── src/
│   ├── data.ts                Seeded launch content and local search
│   ├── database-content.ts    Supabase read projections and fallbacks
│   ├── auth.ts                Admin authorization
│   ├── analytics.tsx          First-party event client
│   ├── content-editor.tsx     Website publishing interface
│   └── app-content-editor.tsx App projection publishing interface
├── supabase/
│   ├── migrations/            Shared database source of truth
│   ├── tests/                 Migration verification SQL
│   └── seed.sql
├── tests/                     Content integrity tests
├── docs/                      Deployment and migration runbooks
└── .github/workflows/         CI
```

## Runtime model

### Public website

The public site renders seeded launch content immediately. When Supabase is configured, database-owned published content is merged into the editorial indexes and detail routes.

This gives the site a safe launch baseline without making production publishing dependent on a code deployment.

### Admin

Admin access uses Supabase Auth magic links. Authorization is granted by either:

1. A role in `platform.user_roles`, or
2. An email explicitly listed in the server-only `ADMIN_EMAILS` variable.

The browser never receives the Supabase service-role key. Publishing endpoints authenticate the user, validate the request, then call service-role-only database functions.

### App publishing

Canonical website content and app payloads are separate publication channels.

```text
Canonical content item
├── website publication
└── app publication
    └── app_content.records
```

Existing app records migrate as app-only and private to the website. Nothing becomes a public website page merely because it already exists in the app.

The app consumes:

```text
app_content.published_records_v1
app_content.manifest_v1
```

Each app record carries a schema version, record version, checksum, status, and validated JSON payload.

## Database ownership

This repository becomes the migration source of truth after cutover.

Migration order:

1. `202607240001_existing_app_foundation.sql`
2. `202608030001_shared_content_foundation.sql`
3. Analytics and editorial command migrations
4. App reader deployment
5. Legacy cutover migration
6. Optional legacy retirement after the observation period

Do not run the cutover or retirement migrations as part of an automatic Vercel deployment.

## Analytics

First-party product events answer specific product questions:

- What questions do people search?
- Which searches return nothing useful?
- Which pages lead into the app?
- Which articles are completed?
- Which content is shared?

Private notes, custom pathways, authentication tokens, and contact message bodies are never analytics properties.

Vercel Analytics and Speed Insights remain enabled for infrastructure-level measurements.

## Deployment

```text
GitHub: Elicasta/apostolic-guide-web
Vercel project: apostolic-guide-web
Production: apostolicguide.com
App: app.apostolicguide.com
Node: 22.x
Package manager: npm
```

Preview and production environments should not share editorial writes. Use a Supabase branch or separate preview project when previews need database access.
