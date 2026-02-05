# Confidence Calibration Game — Plan

## Project Overview

A confidence calibration game where users estimate numerical values with confidence intervals. Tracks calibration over time via two metrics: a **Precision Score** (logarithmic scoring rewarding accuracy + narrow ranges) and an **Over/Under Confidence Score** (measures systematic confidence bias). See `docs/scoring-system.md` for full scoring documentation.

---

## MVP — Complete ✓

All of the following has been implemented and is live:

- Single-page vanilla JS app, modular architecture (`game.js`, `scoring.js`, `ui.js`, `chart.js`, `distribution.js`, `storage.js`)
- 45 curated questions in `data/questions.json`
- Range input (low/high) + confidence slider (50–99%)
- Immediate feedback with bell curve distribution visualization
- Two metrics: Precision Score (log scoring + EMA) and Over/Under Confidence (EMA)
- Both charts show raw scatter points + smoothed EMA line
- localStorage persistence
- Chart.js for time-series, custom canvas for distribution
- Dark theme with JetBrains Mono

### Decisions Made During MVP

| Item | Decision |
|------|----------|
| Scoring | Logarithmic scoring with normal distribution (proper scoring rule) |
| Averaging | EMA (α=0.3) replaces simple mean — rewards improvement, reduces noise |
| Confidence range | 50–99% — below 50% is illogical ("my range is probably wrong") |
| Distribution model | Normal over uniform — more intuitive, prettier, rewards precision |
| Calibration Bias metric | Dropped — replaced by Over/Under Confidence Score |
| Chart library | Chart.js for time-series, custom canvas for distribution viz |
| Per-question score | Shown in feedback alongside distribution |

---

## Phase 1: API Seam — Complete ✓

The `/api/next-question` pattern is wired up. The frontend calls one endpoint; the serverless function reads from `questions.json`. Behaviour is identical to before, but the seam is in place — swapping in AI generation later is a single-file change on the server side.

- `api/next-question.js` — Vercel serverless function. Accepts `?seen=id1,id2,...` to exclude already-seen questions. Returns one question + a `poolReset` flag when the pool is exhausted.
- `js/game.js` — `getNextQuestion()` is now async, calls the API. Seen-tracking stays client-side (sent to the server as a query param).
- Hosting must be Vercel (or equivalent). GitHub Pages won't serve API routes. See `DEPLOY.md`.

---

## Phase 2: AI Question Generation

Generate questions dynamically using an AI model with web search grounding.

### 2a: Core Integration — In Progress
- Gemini integration with Google Search grounding for fact verification
- Config-driven question source routing (`config.json`)
- Question schema: `id`, `question`, `answer`, `unit`, `category`, `sourceName`, `sourceUrl`, `creator`
- Creator field tracks origin (e.g., `claude`, `gemini-2.5-flash`)

### 2b: Production Hardening
- Batch-generate questions on first request or cron schedule
- Cache generated questions (Vercel KV or in-memory)
- Serve from pool — don't generate per-request (slow + expensive)
- Replenish pool when it runs low

### 2c: Quality & Variety
- Mix static seed questions with AI-generated ones
- Category-aware generation (enforce diversity, prevent drift)
- Validation strategy for generated questions (see design notes below)

### AI Question Generation — Design Notes

**What makes a good estimation question?**
- Single, verifiable numerical answer
- Interesting or surprising answer
- Covers a range of magnitudes and domains
- Not trivially Googleable mid-game

**Validation is the hard part.** If the model generates a question with an answer, how do we know it's right? Options (roughly in order of preference):
1. Use web search grounding to cite sources
2. Ask the model twice independently, flag disagreements
3. Stick to well-known factual domains where the model is reliable
4. Human review queue for flagged questions
5. Trust the AI and rely on user reporting to catch errors

**Duplicate prevention:**
- Provide recent questions in the prompt as negative examples
- Hash exact question text to catch perfect duplicates
- Semantic similarity check (embeddings) to catch near-duplicates

**Cost control:**
- Batch generation (20 questions per API call, not 1)
- Generated questions are reused across all users
- Cache aggressively, only regenerate when pool is low

---

## Phase 3: User Persistence & Auth

Move user data out of localStorage into a proper backend.

### Stack Addition: Supabase

Supabase covers almost everything:
- **PostgreSQL** database for questions, users, and responses
- **Built-in REST API** — CRUD on tables with no backend code
- **Built-in Auth** — social login, email/password, row-level security
- Free tier: 500MB storage, 2GB bandwidth

### What Changes

- User responses stored in Supabase instead of localStorage
- Per-user history synced to cloud
- Precision Score and Over/Under Confidence calculated server-side (or client-side from synced history)
- Questions table replaces `questions.json` — same data, queryable

### Migration

localStorage data can be migrated on first login: read from localStorage, POST to Supabase, clear localStorage.

---

## Phase 4: Multi-User Platform

Further out. Key ideas preserved below.

### Question Lifecycle

```
AI generates → "trial" status → served to users → metrics collected
    → after N responses: promote to "active" if quality OK, retire if not
    → time-sensitive questions flagged with expiry dates
    → user reports increment a counter; auto-retire after threshold
```

### Question DB Schema (target)

```
id, question, answer, unit, category, difficulty,
source, createdAt, lastVerified, generationModel,
timesShown, avgScore, reportCount, status, expiresAt
```

### Responses DB Schema (target)

```
id, userId, questionId,
userLow, userHigh, confidence, correctAnswer, isCorrect,
logScore, precisionScore, confidenceBiasScore,
answeredAt, responseTimeMs
```

### Periodic Services

- Question pool health check (replenish if low)
- Time-sensitive question expiry review
- Quality metrics recalculation
- These can run as Vercel Cron Jobs or a lightweight Railway worker

---

## Parallel Track: Analytics Dashboard

A separate frontend for operational visibility. Can begin alongside Phase 2 and evolve with later phases.

### Metrics to Track
- Total questions generated (by source/model)
- Total questions answered (by user, over time)
- Usage rates and trends (daily/weekly active users)
- Question quality signals (avg score, report rate, skip rate)
- Popular categories and difficulty distribution

### Implementation Notes
- Requires backend storage (Phase 3+) for meaningful data
- Could start with simple JSON logs, graduate to proper analytics
- Separate route (`/admin` or `/dashboard`) with basic auth
- Lightweight charting (Chart.js reuse or simple tables)

---

## Open Questions

1. **Validation strategy?** How much do we trust AI-generated answers? What's the user reporting flow?
2. **Question difficulty?** Adaptive difficulty, or random mix? Could track per-category difficulty from response data.
3. **Monetization?** Not a priority now — freemium, ads, or "pay for unlimited questions"?
4. **Multi-language?** Punt for now, but Supabase + serverless makes i18n relatively straightforward later.

---

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| AI generates wrong answers | Web search grounding + user reporting + human review queue |
| Question pool runs dry | Batch generation triggered when pool < threshold |
| localStorage data lost | Accept for now; cloud sync in Phase 3 handles long-term |
| Vercel cold starts slow | Serverless functions warm up fast; cache questions in memory |
| Cost of AI generation | Batch generation + aggressive caching + reuse across users |
