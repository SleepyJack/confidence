# Confidence Calibration Game — Expansion Ideas

Outstanding work and future directions. For a description of what's built, see README.md.

---

## Phase 2b: AI Question Production Hardening

- Batch-generate questions on a cron schedule rather than per-request
- Serve from a pre-built pool — replenish when it runs low
- Cache generated questions (Vercel KV or in-memory) to avoid cold generation latency

---

## Phase 2c: AI Question Quality & Variety

- Category-aware generation: enforce diversity, prevent topic drift
- Duplicate prevention via two-phase generation:

  1. **Summary only** — Ask the AI for a short datum summary (max 10 words), e.g. "height of Mount Everest". Cheap.
  2. **Similarity check** — Compare against existing summaries in the DB. Reject near-matches and request another.
  3. **Full question** — Only when the summary is confirmed unique, generate the full question + answer + metadata.

  The `summary` field is stored and indexed on each question. Recommended algorithm: PostgreSQL `pg_trgm` (`similarity(a, b) > 0.4`). Graduate to embeddings if needed.

  ```sql
  SELECT id, summary, similarity(summary, 'height of Mount Everest') AS sim
  FROM questions
  WHERE similarity(summary, 'height of Mount Everest') > 0.4
  ORDER BY sim DESC;
  ```

- Validation strategy options (in order of preference):
  1. Web search grounding to cite sources
  2. Ask the model twice independently, flag disagreements
  3. Stick to well-known factual domains
  4. Human review queue for flagged questions
  5. Trust the AI and rely on user reporting to catch errors

---

## Phase 3b: Social Auth & Cloud-Only History

- Social login (OAuth providers)
- Server-side metric calculation from Supabase history
- Full cloud-only mode (drop localStorage for logged-in users)

---

## Phase 4: Multi-User Platform

### Question Lifecycle

```
AI generates → "trial" status → served to users → metrics collected
    → after N responses: promote to "active" if quality OK, retire if not
    → time-sensitive questions flagged with expiry dates
    → user reports increment a counter; auto-retire after threshold
```

### Target DB Schema

**Questions** (additions to current schema):
```
difficulty, timesShown, avgScore, reportCount, status, expiresAt, lastVerified
```

**Responses** (additions to current schema):
```
responseTimeMs, logScore (computed server-side)
```

### Periodic Services

- Question pool health check (replenish when low)
- Time-sensitive question expiry review
- Quality metrics recalculation
- Vercel Cron Jobs or lightweight Railway worker

---

## Analytics Dashboard

Partially implemented at `/stats` (questions, users, responses counts). Outstanding:

- Question quality signals (avg score, report rate, skip rate)
- Category and difficulty distribution
- Question pool health and replenishment visibility
- Daily/weekly active user trends

---

## Open Questions

1. **Validation strategy?** How much do we trust AI-generated answers? What's the user reporting flow?
2. **Question difficulty?** Adaptive difficulty, or random mix? Could track per-category difficulty from response data.
3. **Monetization?** Not a priority now — freemium, ads, or "pay for unlimited questions"?
4. **Multi-language?** Punt for now, but Supabase + serverless makes i18n relatively straightforward later.
