# Deployment Instructions

## Hosting: Vercel (Required)

The app now uses a serverless API route (`/api/next-question`), so it must be hosted on Vercel (or another platform that supports serverless functions). GitHub Pages won't work — it only serves static files.

### Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (free account is fine)
2. Click **New Project** → **Import Git Repository**
3. Connect your GitHub account and select the `confidence` repo
4. Select the branch you want to deploy (e.g. `main`)
5. Leave all default settings — Vercel auto-detects the `api/` directory
6. Click **Deploy**
7. Your game is live at the URL Vercel assigns (e.g. `https://confidence-xyz.vercel.app`)

### Redeploy on Push

Once connected, Vercel auto-deploys on every push to the selected branch. No action needed.

### Environment Variables

No env vars are required for Phase A (static questions only). When AI generation is added later, add the API key here:

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add `ANTHROPIC_API_KEY` with your key value
3. Redeploy (or it picks up on next push)

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
