# Gemini API Setup Guide

This guide explains how to set up the Gemini API for AI-generated questions in Calibrate.

## 1. Create a Google AI Studio Account

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Accept the terms of service

## 2. Get an API Key

1. In Google AI Studio, click **Get API Key** in the left sidebar
2. Click **Create API Key**
3. Choose a Google Cloud project (or create a new one)
4. Copy the generated API key - you'll need this for the next step

**Important**: Keep your API key secret. Never commit it to version control.

## 3. Local Development Setup

For local development, create a `.env` file in the project root:

```bash
# .env (do NOT commit this file)
GEMINI_API_KEY=your-api-key-here
```

Make sure `.env` is in your `.gitignore` file.

To load environment variables locally, you can use a package like `dotenv` or set them in your shell:

```bash
export GEMINI_API_KEY=your-api-key-here
```

## 4. Vercel Deployment Setup

For production deployment on Vercel:

1. Go to your project in the [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Settings** > **Environment Variables**
3. Add a new environment variable:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: Your API key from step 2
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**

The next deployment will automatically use this environment variable.

## 5. Enable Gemini Question Source

Edit `config.json` in the project root:

```json
{
  "version": "0.1.12",
  "questionSource": "gemini",
  "gemini": {
    "model": "gemini-2.5-flash"
  }
}
```

Change `questionSource` from `"json"` to `"gemini"` to enable AI-generated questions.

## 6. Test the Setup

### Local Testing

```bash
# Start the development server
vercel dev

# Or if using npm
npm run dev
```

Then open the app and try getting a question. Check the browser console and terminal for any errors.

### Verify API Key

You can test your API key directly:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

## Troubleshooting

### "GEMINI_API_KEY environment variable is not set"

- Ensure the environment variable is set in your shell or `.env` file
- On Vercel, check that the environment variable is configured in project settings

### "Failed to parse Gemini response as JSON"

- The model occasionally returns malformed JSON
- This is a known issue; refreshing usually works
- Consider adding retry logic for production use

### Rate Limits

The free tier includes:
- 500 requests per day with grounding (Google Search)
- 1,500 requests per day without grounding

For higher limits, you'll need to enable billing on your Google Cloud project.

## API Costs

**Free Tier** (no credit card required):
- 500 grounded requests/day
- Gemini 2.5 Flash: $0.10 / $0.40 per 1M input/output tokens

For a calibration game generating ~50-100 questions/day, you should stay well within free tier limits.

## Security Notes

1. **Never expose your API key in client-side code** - the key should only be used in server-side API routes
2. **Use environment variables** - never hardcode the key
3. **Rotate keys if compromised** - you can create new keys and delete old ones in Google AI Studio

## Model Options

You can change the model in `config.json`. Available options:
- `gemini-2.5-flash` (recommended) - Fast, cheap, good quality
- `gemini-2.5-pro` - Higher quality, slower, more expensive
- `gemini-2.0-flash` - Previous generation, being deprecated

The model can also be overridden via environment variable:
```bash
GEMINI_MODEL=gemini-2.5-pro
```
