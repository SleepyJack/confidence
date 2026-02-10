# Confidence Calibration Game

A web-based game designed to help users improve their confidence calibration by making numerical estimates with confidence intervals.

## What is Confidence Calibration?

Confidence calibration measures how well your stated confidence matches reality. If you say you're 80% confident about 10 estimates, you should be correct about 8 of them. This game helps you discover if you're overconfident (correct less often than you claim) or underconfident (correct more often than you claim).

## How to Play

1. You'll be presented with a question that has a numerical answer (e.g., "What is the distance to the Moon in kilometers?")
2. Provide your estimate as a range:
   - **Low bound**: The lowest value you think is possible
   - **High bound**: The highest value you think is possible
   - **Confidence**: How confident you are that the true answer falls within your range (e.g., 80%)
3. The game reveals the correct answer
4. After multiple questions, you'll see your calibration score: how well your confidence matches your actual accuracy

## Example

**Question**: "What is the population of Russia?"

**Your answer**:
- Low bound: 120,000,000
- High bound: 180,000,000
- Confidence: 90%

**Result**: The actual population is ~144,000,000 - you were correct! If you're well-calibrated, you should be correct on 90% of questions where you claim 90% confidence.

## Scoring

The game tracks your performance across all questions and calculates:
- **Calibration by confidence level**: For each confidence level you use (50%, 80%, 90%, etc.), what percentage of the time were you actually correct?
- **Overall calibration score**: How close your stated confidence is to your actual accuracy
- **Overconfidence/underconfidence indicator**: Are you too sure of yourself, or too cautious?

## Tech Stack

- **Frontend**: HTML, CSS, vanilla JavaScript
- **Backend**: Vercel serverless functions (`api/`)
- **Database**: Supabase (Postgres) — schema in `sql/schema.sql`
- **Question generation**: Google Gemini API
- **Hosting**: Vercel (deploys from `live` branch)

## Getting Started

1. Clone the repo and run `npm install`
2. Set up [Supabase](docs/supabase-setup.md) (database) and [Vercel](docs/vercel-setup.md) (hosting)
3. Run locally with `vercel dev`
4. Run tests with `npm test` (unit) or `npm run test:integration` (database)

## Future Enhancements

- User accounts and persistent score history
- AI-generated questions for unlimited variety
- Multiplayer mode or leaderboards
- Different question categories and difficulty levels
- Calibration curve visualization
- Question packs from different domains (science, history, geography, etc.)

## Why This Matters

Good calibration is a critical skill for:
- Decision-making under uncertainty
- Risk assessment
- Forecasting and prediction
- Understanding the limits of your knowledge

By practicing with this game, you can become more aware of your cognitive biases and improve your judgment over time.
