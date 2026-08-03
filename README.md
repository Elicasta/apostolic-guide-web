# Apostolic Guide Open Graph build fix

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
