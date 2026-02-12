/**
 * Background question generation cron job
 *
 * Generates questions via Gemini and persists to DB.
 * Handles rate limiting with exponential backoff.
 *
 * Vercel cron: configure in vercel.json
 * Manual trigger: GET /api/cron/generate-questions
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getClient: getSupabase } = require('../lib/supabase');

// Load config
let config = null;
function getConfig() {
  if (!config) {
    const configPath = path.join(process.cwd(), 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return config;
}

// Initialize Gemini client
let genAI = null;
function getGeminiClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Summary-only prompt for Phase 1 (cheap duplicate check)
 */
const SUMMARY_PROMPT = `Generate a brief summary (max 10 words) of an interesting numerical trivia datum.
Examples: "depth of the Mariana Trench", "population of Tokyo", "speed of light in km/s"
Respond with ONLY the summary text, nothing else.`;

/**
 * Full question generation prompt
 */
const QUESTION_PROMPT = `You are a trivia question generator for a calibration game. Generate a single trivia question that has a NUMERICAL answer.

Requirements:
1. The question must have a specific, factual numerical answer
2. The question text MUST specify the unit of measurement (e.g., "in kilometers", "in millions of people", "in degrees Celsius")
3. Use web search to find accurate, current data
4. Provide both a source name and source URL for the data
5. Choose interesting topics: science, geography, history, economics, sports statistics, demographics, engineering, nature, etc.
6. Avoid questions that are too easy (like "how many days in a week") or too obscure

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "question": "What is the average distance from Earth to the Moon in kilometers?",
  "answer": 384400,
  "unit": "km",
  "category": "astronomy",
  "summary": "average distance from Earth to the Moon",
  "sourceName": "NASA",
  "sourceUrl": "https://example.com/source-url"
}

The "question" MUST include the unit (e.g., "in kilometers", "in years", "in USD").
The "unit" should be a short label matching the unit in the question: km, m, years, people, kg, celsius, USD, etc.
The "category" should be one of: astronomy, geography, biology, physics, history, chemistry, economics, sports, demographics, engineering, nature, technology
The "summary" should be a brief (max 10 words) description of the core datum, e.g. "depth of the Mariana Trench".
The "sourceName" should be a short name for the source (e.g., "NASA", "Wikipedia", "WHO")
The "sourceUrl" MUST be a valid URL where this data can be verified.`;

/**
 * Get count of active questions in DB
 */
async function getActiveQuestionCount() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) {
    throw new Error(`Failed to count questions: ${error.message}`);
  }
  return count || 0;
}

/**
 * Validate that a source URL is reachable
 */
async function validateSourceUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Calibrate-Bot/1.0)'
        }
      });
      controller.abort();
      return response.status >= 200 && response.status < 400;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return false;
  }
}

/**
 * Check if a summary is a duplicate via Supabase RPC
 */
async function checkDuplicate(summary) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('check_duplicate_summary', {
    candidate: summary,
    threshold: 0.4
  });

  if (error) {
    console.warn('Duplicate check RPC failed:', error.message);
    return { duplicate: false };
  }

  if (data && data.length > 0) {
    return { duplicate: true, match: data[0] };
  }
  return { duplicate: false };
}

/**
 * Parse rate limit info from Gemini error
 * Returns wait time in ms, or null if not a rate limit error
 */
function parseRateLimitWait(error) {
  const msg = error.message || '';

  // Check for rate limit indicators
  if (!msg.includes('429') && !msg.includes('RESOURCE_EXHAUSTED') && !msg.includes('quota')) {
    return null;
  }

  // Try to extract wait time from message (e.g., "retry after 37s")
  const match = msg.match(/(\d+)\s*(s|sec|second|m|min|minute)/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('m')) {
      return value * 60 * 1000;
    }
    return value * 1000;
  }

  // Default: assume daily limit hit, wait 1 hour
  return 60 * 60 * 1000;
}

/**
 * Generate a summary (Phase 1)
 */
async function generateSummary(model) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: SUMMARY_PROMPT }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 64 }
  });

  const text = result.response.text().trim();
  if (!text || text.length > 200 || text.startsWith('{')) {
    return null;
  }
  return text;
}

/**
 * Generate full question (Phase 2)
 */
async function generateQuestion(model, modelName, summary) {
  const prompt = summary
    ? `${QUESTION_PROMPT}\n\nGenerate a question about: ${summary}`
    : QUESTION_PROMPT;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }
  });

  const response = result.response;
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Response truncated');
  }

  const text = response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON in response');
  }

  const data = JSON.parse(jsonMatch[0]);

  // Validate required fields
  const required = ['question', 'answer', 'unit', 'category', 'summary', 'sourceName', 'sourceUrl'];
  for (const field of required) {
    if (!(field in data)) {
      throw new Error(`Missing field: ${field}`);
    }
  }

  if (typeof data.answer !== 'number') {
    throw new Error('Answer must be a number');
  }

  // Validate URL
  if (!await validateSourceUrl(data.sourceUrl)) {
    throw new Error(`Invalid source URL: ${data.sourceUrl}`);
  }

  return {
    id: crypto.randomUUID(),
    question: data.question,
    answer: data.answer,
    unit: data.unit,
    category: data.category,
    summary: data.summary || summary,
    sourceName: data.sourceName,
    sourceUrl: data.sourceUrl,
    creator: modelName
  };
}

/**
 * Persist question to DB
 */
async function persistQuestion(question) {
  const supabase = getSupabase();
  const { error } = await supabase.from('questions').insert({
    id: question.id,
    question: question.question,
    answer: question.answer,
    unit: question.unit,
    category: question.category,
    summary: question.summary,
    source_name: question.sourceName,
    source_url: question.sourceUrl,
    creator: question.creator,
    status: 'active'
  });

  if (error) {
    throw new Error(`DB insert failed: ${error.message}`);
  }
}

/**
 * Attempt to generate and persist one question
 * Returns: { success: true, question } or { success: false, error, rateLimitWait? }
 */
async function generateOneQuestion(model, modelName) {
  try {
    // Phase 1: Generate summary and check for duplicates
    let summary = null;
    try {
      summary = await generateSummary(model);
      if (summary) {
        const { duplicate, match } = await checkDuplicate(summary);
        if (duplicate) {
          return {
            success: false,
            error: `Duplicate: "${summary}" ≈ "${match.summary}" (${match.sim.toFixed(2)})`
          };
        }
      }
    } catch (phase1Error) {
      // Check if rate limited
      const wait = parseRateLimitWait(phase1Error);
      if (wait) {
        return { success: false, error: phase1Error.message, rateLimitWait: wait };
      }
      // Otherwise continue without summary
      console.warn('Phase 1 failed, continuing:', phase1Error.message);
    }

    // Phase 2: Generate full question
    const question = await generateQuestion(model, modelName, summary);

    // Post-generation duplicate check
    if (question.summary && question.summary !== summary) {
      const { duplicate, match } = await checkDuplicate(question.summary);
      if (duplicate) {
        return {
          success: false,
          error: `Duplicate post-gen: "${question.summary}" ≈ "${match.summary}"`
        };
      }
    }

    // Persist to DB
    await persistQuestion(question);

    return { success: true, question };

  } catch (error) {
    const wait = parseRateLimitWait(error);
    return {
      success: false,
      error: error.message,
      rateLimitWait: wait || undefined
    };
  }
}

/**
 * Main cron handler
 */
module.exports = async function handler(req, res) {
  // Allow GET for manual trigger, POST for Vercel cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = getConfig();
  const target = cfg.targetActiveQuestions || 100;
  const modelName = cfg.gemini?.model;

  if (!modelName) {
    return res.status(500).json({ error: 'gemini.model not configured' });
  }

  const results = {
    startTime: new Date().toISOString(),
    target,
    initialCount: 0,
    finalCount: 0,
    generated: 0,
    duplicates: 0,
    errors: [],
    rateLimited: false,
    rateLimitWait: null
  };

  try {
    // Check current count
    results.initialCount = await getActiveQuestionCount();

    if (results.initialCount >= target) {
      results.finalCount = results.initialCount;
      return res.status(200).json({
        ...results,
        message: `Target reached (${results.initialCount}/${target}), no generation needed`
      });
    }

    // Initialize Gemini
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: modelName,
      tools: [{ googleSearch: {} }]
    });

    // Generate questions until target reached or rate limited
    const needed = target - results.initialCount;
    const maxAttempts = Math.min(needed * 2, 10); // Cap attempts per run

    for (let i = 0; i < maxAttempts && results.generated < needed; i++) {
      const result = await generateOneQuestion(model, modelName);

      if (result.success) {
        results.generated++;
        console.log(`Generated: ${result.question.summary}`);
      } else if (result.rateLimitWait) {
        results.rateLimited = true;
        results.rateLimitWait = result.rateLimitWait;
        results.errors.push(result.error);
        console.log(`Rate limited, wait ${result.rateLimitWait}ms`);
        break;
      } else if (result.error.includes('Duplicate')) {
        results.duplicates++;
        console.log(result.error);
      } else {
        results.errors.push(result.error);
        console.error(`Error: ${result.error}`);
      }

      // Brief pause between generations to avoid rapid-fire requests
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    results.finalCount = await getActiveQuestionCount();

    return res.status(200).json({
      ...results,
      message: results.rateLimited
        ? `Rate limited after generating ${results.generated} questions`
        : `Generated ${results.generated} questions (${results.finalCount}/${target})`
    });

  } catch (error) {
    results.errors.push(error.message);
    return res.status(500).json({
      ...results,
      error: error.message
    });
  }
};
