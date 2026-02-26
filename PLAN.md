# Confidence Calibration Game — Expansion Ideas

Outstanding work and future directions. For a description of what's built, see README.md.

## Question Quality & Variety

- Category-aware generation: enforce diversity, prevent topic drift
- AI review of question set: periodic scan of the DB for duplicates, badly formed questions, etc
- User rating / flagging system
- Use of aggregated response stats to flag outliers: extremely easy or hard questions

### Question Lifecycle

```
AI generates → "trial" status → served to users → metrics collected
    → after N responses: promote to "active" if quality OK, retire if not
    → time-sensitive questions flagged with expiry dates
    → user reports increment a counter; auto-retire after threshold
```
