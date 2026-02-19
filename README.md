# Confidence Calibration Game

A web-based game to improve your confidence calibration by making numerical estimates with confidence intervals.

## What is Confidence Calibration?

Confidence calibration measures how well your stated confidence matches reality. If you say you're 80% confident about 10 estimates, you should be correct about 8 of them. This game helps you discover if you're overconfident (correct less often than you claim) or underconfident (correct more often than you claim).

## How to Play

1. You'll be presented with a question that has a numerical answer (e.g., "What is the distance to the Moon in kilometers?")
2. Provide your estimate as a range:
   - **Low bound**: The lowest value you think is possible
   - **High bound**: The highest value you think is possible
   - **Confidence**: How confident you are that the true answer falls within your range (50–99%)
3. The game reveals the correct answer and shows a bell curve of your estimate
4. After multiple questions, your scores trend over time on two charts

## Scoring

The game tracks two metrics. See [docs/scoring-system.md](docs/scoring-system.md) for full details.

- **Precision Score** (0–100%): Rewards both accuracy and narrow ranges using logarithmic scoring — a proper scoring rule that can't be gamed by hedging.
- **Over/Under Confidence Score**: Measures systematic confidence bias. Averages to 0 for a perfectly calibrated player. Negative = overconfident, positive = underconfident.

Both metrics use Exponential Moving Average (EMA) smoothing so trends are clear and recent improvement is reflected quickly.

## Tech Stack

- **Frontend**: HTML, CSS, vanilla JavaScript
- **Backend**: Vercel serverless functions (`api/`)
- **Database**: Supabase (Postgres) — schema in `sql/schema.sql`
- **Question generation**: Google Gemini API with web search grounding
- **Hosting**: Vercel (deploys from `live` branch via GitHub Actions)
- **Auth**: Supabase email/password auth with per-user response history

## Getting Started

1. Clone the repo and run `npm install`
2. Set up [Supabase](docs/supabase-setup.md) (database + auth) and [Vercel](docs/vercel-setup.md) (hosting)
3. Set up [Gemini](docs/gemini-setup.md) (AI question generation)
4. Run locally with `vercel dev`
5. Run tests with `npm test` (unit) or `npm run test:integration` (database)

## Deployment

Setup guides:

- [Vercel setup](docs/vercel-setup.md) — hosting, env vars, releases, local dev, troubleshooting
- [Supabase setup](docs/supabase-setup.md) — database schema, test schema, integration tests
- [Gemini setup](docs/gemini-setup.md) — AI question generation API key and config

## Future Directions

See [PLAN.md](PLAN.md) for outstanding work and expansion ideas.

## Why This Matters

Good calibration is a critical skill for:
- Decision-making under uncertainty
- Risk assessment
- Forecasting and prediction
- Understanding the limits of your knowledge

By practicing with this game, you can become more aware of your cognitive biases and improve your judgment over time.
