# Vercel Setup

The app uses Vercel serverless functions for the `/api/next-question` endpoint. GitHub Pages won't work — it only serves static files.

## Initial Setup

1. Go to [vercel.com](https://vercel.com) and sign in (free account is fine)
2. Click **New Project** → **Import Git Repository**
3. Connect your GitHub account and select the `confidence` repo
4. Leave all default settings — Vercel auto-detects the `api/` directory
5. Click **Deploy**
6. Go to **Settings** → **Git** and change the **Production Branch** from `main` to `live`

Step 6 is important: Vercel should only deploy when CI pushes to `live`, not on every push to `main`.

## Environment Variables

Go to your Vercel project → **Settings** → **Environment Variables** and add:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL (see [supabase-setup.md](supabase-setup.md)) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for question generation |

Changes take effect on the next deployment.

## Releasing a New Version

The release workflow is: bump version → tag → CI deploys.

1. Update `version` in `config.json` (e.g. `"version": "0.3.0"`)
2. Commit and push to `main`
3. Tag that commit: `git tag v0.3.0 && git push origin v0.3.0`
4. GitHub Actions picks up the tag, checks it matches `config.json`, and fast-forwards `live` to that commit
5. Vercel sees the push to `live` and deploys

**Tag format:** `v` prefix on the tag, no prefix in the config. Tag `v0.3.0`, config contains `"version": "0.3.0"`.

**If the tag doesn't match `config.json`:** CI fails at the validation step. Nothing deploys. Fix by updating `config.json` and re-tagging, or deleting the bad tag (`git push origin :v0.3.0`) and re-tagging.

## Local Development

```bash
# Install Vercel CLI (once)
npm install -g vercel

# Run locally — serves static files AND API routes
vercel dev

# Opens at http://localhost:3000
```

## Verification Checklist

Once deployed, test:

- [ ] Welcome modal appears on first visit
- [ ] Questions load from `/api/next-question`
- [ ] Submit answer shows feedback + bell curve
- [ ] Stats update after each question
- [ ] Charts render after 3+ questions
- [ ] Questions don't repeat until all have been seen
- [ ] Progress persists on page reload (localStorage)

## Troubleshooting

**Issue**: Questions don't load / blank page
- **Fix**: Ensure you're on Vercel (not GitHub Pages). Check browser console for network errors.

**Issue**: `GET /api/next-question` returns 404
- **Fix**: Verify `api/next-question.js` is committed and pushed. Vercel needs it in the repo root.

**Issue**: Chart doesn't display
- **Fix**: Answer at least 3 questions (charts need minimum data).

**Issue**: Stats don't persist
- **Fix**: Check browser localStorage is enabled (not in private/incognito mode).
