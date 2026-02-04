# Deployment Instructions

## Hosting: Vercel (Required)

The app now uses a serverless API route (`/api/next-question`), so it must be hosted on Vercel (or another platform that supports serverless functions). GitHub Pages won't work — it only serves static files.

### Initial Setup (one-time)

1. Go to [vercel.com](https://vercel.com) and sign in (free account is fine)
2. Click **New Project** → **Import Git Repository**
3. Connect your GitHub account and select the `confidence` repo
4. Leave all default settings — Vercel auto-detects the `api/` directory
5. Click **Deploy**
6. Go to your project **Settings** → **Git** and change the **Production Branch** from `main` to `live`

Step 6 is important: Vercel should only deploy when CI pushes to `live`, not on every push to `main`.

### Environment Variables

No env vars are required for Phase A (static questions only). When AI generation is added later, add the API key here:

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add `ANTHROPIC_API_KEY` with your key value
3. Redeploy (or it picks up on next push)

---

## Releasing a New Version

The release workflow is: bump version → tag → CI deploys.

1. Update `version.txt` in `main` with the new version (e.g. `0.2.0`)
2. Commit and push to `main`
3. Tag that commit: `git tag v0.2.0 && git push origin v0.2.0`
4. GitHub Actions picks up the tag, checks it matches `version.txt`, and fast-forwards `live` to that commit
5. Vercel sees the push to `live` and deploys

The version number shown in the app footer reads from `version.txt` at runtime, so it updates automatically.

**Tag format:** `v` prefix on the tag, no prefix in the file. Tag `v0.2.0`, file contains `0.2.0`.

**If the tag doesn't match `version.txt`:** CI fails at the validation step. Nothing deploys. Fix by either updating `version.txt` and re-tagging, or deleting the bad tag (`git push origin :v0.2.0`) and re-tagging.

---

## Local Development

The API route needs a serverless runtime to work. Use Vercel's CLI:

```bash
# Install Vercel CLI (once)
npm install -g vercel

# Run locally — serves static files AND API routes
vercel dev

# Opens at http://localhost:3000
```

Alternatively, if you just want to test the static site without the API (questions won't load):

```bash
python3 -m http.server 8000
# http://localhost:8000
```

---

## Verification Checklist

Once deployed, test:

- [ ] Welcome modal appears on first visit
- [ ] Questions load from `/api/next-question`
- [ ] Range inputs accept numbers
- [ ] Confidence slider works (50-99%)
- [ ] Submit answer shows feedback + bell curve
- [ ] Stats update after each question
- [ ] Charts render after 3+ questions
- [ ] Next question button loads a new question
- [ ] Questions don't repeat until all 45 have been seen
- [ ] Progress persists on page reload (localStorage)
- [ ] Browser network tab shows GET `/api/next-question` requests

---

## Troubleshooting

**Issue**: Questions don't load / blank page
- **Fix**: Ensure you're on Vercel (not GitHub Pages). Check browser console for network errors.

**Issue**: `GET /api/next-question` returns 404
- **Fix**: Verify `api/next-question.js` is committed and pushed. Vercel needs it in the repo root.

**Issue**: Chart doesn't display
- **Fix**: Answer at least 3 questions (charts need minimum data)

**Issue**: Stats don't persist
- **Fix**: Check browser localStorage is enabled (not in private/incognito mode)
