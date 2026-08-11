# Apostolic Guide Web

## Open Graph build fix

The Next.js Open Graph renderer rejected a `<div>` with multiple child nodes and no explicit `display` style.

Replace:

```text
app/opengraph-image.tsx
```

with the included file.

Then run:

```bash
git add app/opengraph-image.tsx
git commit -m "fix Open Graph image layout"
git push origin main
```

Vercel will redeploy automatically.

## Pathway publishing metrics

The Studio Pathway control panel stores one publication record per platform post and keeps time-series metric snapshots. Apply the pathway publishing migrations under `supabase/migrations/` before using the control panel.

Platform collectors use server-only secrets stored in `analytics.integration_secrets`:

- Instagram reuses `meta_instagram_access_token` and `meta_instagram_graph_version` from the existing Meta connection.
- YouTube uses `youtube_access_token` with YouTube Analytics read access.
- TikTok uses `tiktok_access_token` with the `video.list` scope.

Attach an Instagram, TikTok, or YouTube post to an existing Pathway asset using its platform post/video ID. Metric sync writes normalized snapshots into `publication_metric_snapshots`, while provider-specific payloads remain in `raw_metrics` so new platform fields do not require a schema rewrite.
