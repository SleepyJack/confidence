# Kimi K2.5 Setup Guide

Kimi K2.5 is Moonshot AI's frontier model. It serves as a fallback when Gemini is unavailable.

## Quick Start

1. **Create account**: Go to [platform.moonshot.ai](https://platform.moonshot.ai/) and sign up (Google login works)
2. **Get API key**: Visit [API Keys page](https://platform.moonshot.ai/console/api-keys) → Create API Key → Save the `sk-...` key
3. **Add balance**: Top up at [Payment page](https://platform.moonshot.ai/console/pay) (new accounts may get free credits)
4. **Add to Vercel**: Set `KIMI_API_KEY` in your Vercel project environment variables

## Pricing

| Type | Cost |
|------|------|
| Input | $0.60 / million tokens |
| Output | $2.50 / million tokens |

Comparable to Gemini Flash pricing. Context window: 256K tokens.

## API Details

Kimi uses an **OpenAI-compatible API**, so integration is straightforward.

**Base URL**: `https://api.moonshot.cn/v1`

**Model ID**: `kimi-k2.5` (or `moonshot-v1-auto` for auto-routing)

**Example request**:
```bash
curl https://api.moonshot.cn/v1/chat/completions \
  -H "Authorization: Bearer $KIMI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.5",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.6
  }'
```

## Recommended Settings

| Mode | Temperature | top_p | Use Case |
|------|-------------|-------|----------|
| Instant | 0.6 | 0.95 | Fast responses (our default) |
| Thinking | 1.0 | 0.95 | Extended reasoning |

For question generation, we use **Instant mode** (faster, no reasoning chain).

## Environment Variables

Add to Vercel (Settings → Environment Variables):

```
KIMI_API_KEY=sk-your-key-here
```

## Fallback Order

The app tries question sources in this order:
1. **Gemini** (with Google Search grounding)
2. **Kimi K2.5** (if Gemini fails)
3. **Demo questions** (static JSON fallback)

## Troubleshooting

**"Invalid API key"**: Double-check the key starts with `sk-` and was copied correctly.

**"Insufficient balance"**: Top up at [platform.moonshot.ai/console/pay](https://platform.moonshot.ai/console/pay).

**Rate limits**: Moonshot has rate limits per account tier. If you hit them, the app falls back to demo questions.

## Alternative Access

If direct Moonshot access is problematic, Kimi K2.5 is also available via:
- [OpenRouter](https://openrouter.ai/moonshotai/kimi-k2.5)
- [Together AI](https://www.together.ai/models/kimi-k2-5)

These providers offer the same model with their own pricing/auth.

## Resources

- [Moonshot Platform](https://platform.moonshot.ai/)
- [Kimi K2.5 GitHub](https://github.com/MoonshotAI/Kimi-K2.5)
- [API Documentation](https://platform.moonshot.ai/docs/guide/start-using-kimi-api)
- Support: support@moonshot.cn
