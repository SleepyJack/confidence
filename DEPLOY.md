# Deployment Instructions

## GitHub Pages Setup

The MVP is ready to deploy! Follow these steps to make the game live on GitHub Pages:

### Option 1: Deploy from feature branch (Quickest)

1. Go to your repository settings on GitHub
2. Navigate to **Settings** → **Pages**
3. Under "Source", select the branch: `claude/estimation-game-setup-BGfzB`
4. Leave the folder as `/ (root)`
5. Click **Save**
6. GitHub will deploy the site (takes ~1-2 minutes)
7. Your game will be live at: `https://sleepyjack.github.io/confidence/`

### Option 2: Merge to main first (Recommended for production)

1. Create a pull request from `claude/estimation-game-setup-BGfzB` to `main`
2. Review and merge the PR
3. Go to repository **Settings** → **Pages**
4. Select branch: `main`
5. Click **Save**
6. Site will be live at: `https://sleepyjack.github.io/confidence/`

## Verification

Once deployed, test the following:
- [ ] Welcome modal appears on first visit
- [ ] Questions load properly
- [ ] Range inputs accept numbers
- [ ] Confidence slider works (50-99%)
- [ ] Submit answer shows feedback correctly
- [ ] Stats update after each question
- [ ] Chart renders after 3+ questions
- [ ] Calibration breakdown table displays
- [ ] Next question button loads a new question
- [ ] Progress persists on page reload (localStorage)

## Quick Test Locally (Optional)

If you want to test before deploying:

```bash
# Using Python 3
python3 -m http.server 8000

# Then open: http://localhost:8000
```

Or use any static file server.

## Troubleshooting

**Issue**: Questions don't load
- **Fix**: Ensure `data/questions.json` is committed and accessible

**Issue**: Chart doesn't display
- **Fix**: Answer at least 3 questions (chart needs minimum data)

**Issue**: Stats don't persist
- **Fix**: Check browser localStorage is enabled (not in private/incognito mode)

## Next Steps After Deployment

1. Play the game yourself and note any issues
2. Share with friends for feedback
3. Consider Phase 2 enhancements:
   - User accounts and database
   - AI-generated questions
   - Additional visualizations
   - Mobile app version
