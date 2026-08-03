# Apostolic Guide CSS build fix

The Vercel build failed because `app/layout.tsx` imports `./globals.css`, but the deployed GitHub commit does not include `app/globals.css`.

Copy the included file to:

```text
app/globals.css
```

Then run:

```bash
git add app/globals.css
git commit -m "fix missing global stylesheet"
git push origin main
```

Vercel will redeploy automatically.
