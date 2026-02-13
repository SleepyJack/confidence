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

// Load prompts from shared files
const SUMMARY_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'prompts', 'summary.txt'),
  'utf8'
);
const QUESTION_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'prompts', 'question.txt'),
  'utf8'
);

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
 * Generate embedding for text using Gemini's embedding model
 * Returns 768-dimensional vector
 */
async function generateEmbedding(text) {
  const client = getGeminiClient();

  // Use gemini-embedding-001 (newer model, more reliable)
  // Request 768 dimensions to match our DB schema
  const model = client.getGenerativeModel({ model: 'gemini-embedding-001' });

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768
  });

  return result.embedding.values;
}

/**
 * Check if a summary is a duplicate via embedding similarity
 * Uses cosine similarity (0.85+ = semantic duplicate)
 */
async function checkDuplicate(summary, embedding) {
  const supabase = getSupabase();

  // Format embedding as PostgreSQL vector literal
  const vectorStr = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('check_duplicate_embedding', {
    query_embedding: vectorStr,
    threshold: 0.85
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
 * Returns: { wait: ms, isDaily: boolean } or null if not a rate limit error
 */
function parseRateLimitWait(error) {
  const msg = error.message || '';

  // Check for rate limit indicators
  const isRateLimit = msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('Too Many Requests');

  if (!isRateLimit) {
    return null;
  }

  // Log full error for debugging
  console.log('Rate limit error details:', msg);

  // Try to extract wait time from message
  // Patterns: "retry after 37s", "wait 2 minutes", "retry in 30.834s"
  const timePatterns = [
    /retry\s*(?:after|in)\s*([\d.]+)\s*(s|sec|second|m|min|minute|h|hour)/i,
    /wait\s*([\d.]+)\s*(s|sec|second|m|min|minute|h|hour)/i,
    /try\s*again\s*in\s*([\d.]+)\s*(s|sec|second|m|min|minute|h|hour)/i,
    /([\d.]+)\s*(s|sec|second|m|min|minute|h|hour)\s*(?:remaining|left|until)/i
  ];

  for (const pattern of timePatterns) {
    const match = msg.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      let waitMs;

      if (unit.startsWith('h')) {
        waitMs = value * 60 * 60 * 1000;
      } else if (unit.startsWith('m')) {
        waitMs = value * 60 * 1000;
      } else {
        waitMs = value * 1000;
      }

      // Per-minute limits typically ask for <5 min wait
      const isDaily = waitMs > 5 * 60 * 1000;
      console.log(`Parsed rate limit: wait ${waitMs}ms, isDaily=${isDaily}`);
      return { wait: waitMs, isDaily };
    }
  }

  // Check for daily/quota keywords (per-day, daily, 24h, RPD)
  const isDaily = /daily|per.?day|24.?h|RPD|requests?.?per.?day/i.test(msg);

  // Default: if looks like daily limit, return long wait; otherwise 1 minute
  const wait = isDaily ? 60 * 60 * 1000 : 60 * 1000;
  console.log(`Default rate limit: wait ${wait}ms, isDaily=${isDaily}`);

  return { wait, isDaily };
}

/**
 * Validate a summary string
 * Returns null if invalid, or the cleaned summary if valid
 */
function validateSummary(text) {
  if (!text) return null;

  // Clean up: remove quotes, trim
  let cleaned = text.replace(/^["']|["']$/g, '').trim();

  // Reject JSON or too long
  if (cleaned.length > 200 || cleaned.startsWith('{')) {
    return null;
  }

  // Reject too short (likely truncated or incomplete)
  // "speed of light" = 14 chars, so use 10 as minimum
  if (cleaned.length < 10) {
    console.warn(`Summary too short: "${cleaned}"`);
    return null;
  }

  // Reject if it looks truncated (ends with quote, ellipsis, possessive, or incomplete word)
  if (/['"]\s*$/.test(cleaned) || cleaned.endsWith('...') || /'\s*$/.test(cleaned)) {
    console.warn(`Summary looks truncated: "${cleaned}"`);
    return null;
  }

  // Reject fragments that end with articles, prepositions, or possessives
  if (/\s(the|a|an|of|in|on|at|to|for|with|'s)\s*$/i.test(cleaned)) {
    console.warn(`Summary ends with incomplete phrase: "${cleaned}"`);
    return null;
  }

  // Require at least 3 words
  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount < 3) {
    console.warn(`Summary has too few words (${wordCount}): "${cleaned}"`);
    return null;
  }

  return cleaned;
}

/**
 * Generate a summary (Phase 1)
 * Retries on invalid summaries - worth it to catch duplicates early
 * and avoid wasting a full question generation call
 */
async function generateSummary(model) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: SUMMARY_PROMPT }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 64 }
    });

    const text = result.response.text().trim();
    const validated = validateSummary(text);

    if (validated) {
      return validated;
    }

    if (attempt < maxAttempts) {
      console.log(`Summary attempt ${attempt} invalid ("${text}"), retrying...`);
    }
  }

  console.warn('All summary attempts failed, skipping to phase 2');
  return null;
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
 * Persist question to DB with embedding
 */
async function persistQuestion(question, embedding) {
  const supabase = getSupabase();

  const row = {
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
  };

  // Add embedding if provided (as PostgreSQL vector literal)
  if (embedding) {
    row.embedding = `[${embedding.join(',')}]`;
  }

  const { error } = await supabase.from('questions').insert(row);

  if (error) {
    throw new Error(`DB insert failed: ${error.message}`);
  }
}

/**
 * Attempt to generate and persist one question
 * Returns: { success: true, question } or { success: false, error, rateLimit? }
 * where rateLimit = { wait: ms, isDaily: boolean }
 *
 * @param {object} summaryModel - Simple model for summary generation
 * @param {object} questionModel - Model with Google Search for full questions
 * @param {string} modelName - Model name for creator field
 */
async function generateOneQuestion(summaryModel, questionModel, modelName) {
  try {
    // Phase 1: Generate summary, get embedding, check for duplicates
    let summary = null;
    let embedding = null;

    try {
      summary = await generateSummary(summaryModel);
      if (summary) {
        // Generate embedding for semantic duplicate check
        embedding = await generateEmbedding(summary);

        const { duplicate, match } = await checkDuplicate(summary, embedding);
        if (duplicate) {
          return {
            success: false,
            error: `Duplicate: "${summary}" ≈ "${match.summary}" (${(match.similarity * 100).toFixed(0)}%)`
          };
        }
      }
    } catch (phase1Error) {
      // Check if rate limited
      const rateLimit = parseRateLimitWait(phase1Error);
      if (rateLimit) {
        return { success: false, error: phase1Error.message, rateLimit };
      }
      // Otherwise continue without summary/embedding
      console.warn('Phase 1 failed, continuing:', phase1Error.message);
    }

    // Phase 2: Generate full question (uses model with Google Search)
    const question = await generateQuestion(questionModel, modelName, summary);

    // Post-generation duplicate check if summary changed
    if (question.summary && question.summary !== summary) {
      const newEmbedding = await generateEmbedding(question.summary);
      const { duplicate, match } = await checkDuplicate(question.summary, newEmbedding);
      if (duplicate) {
        return {
          success: false,
          error: `Duplicate post-gen: "${question.summary}" ≈ "${match.summary}"`
        };
      }
      // Use the new embedding for storage
      embedding = newEmbedding;
    }

    // Persist to DB with embedding
    await persistQuestion(question, embedding);

    return { success: true, question };

  } catch (error) {
    const rateLimit = parseRateLimitWait(error);
    return {
      success: false,
      error: error.message,
      rateLimit: rateLimit || undefined
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
    rateLimitWaits: [],
    dailyLimitHit: false
  };

  // Vercel functions have a 60s timeout (hobby) or 300s (pro)
  // Leave buffer for response handling
  const maxRuntime = 55 * 1000;
  const startTime = Date.now();

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

    // Initialize Gemini models
    const client = getGeminiClient();

    // Simple model for summary generation (no tools, more focused)
    const summaryModel = client.getGenerativeModel({ model: modelName });

    // Model with Google Search for full question generation
    const questionModel = client.getGenerativeModel({
      model: modelName,
      tools: [{ googleSearch: {} }]
    });

    // Generate questions until target reached, daily limit hit, or timeout
    const needed = target - results.initialCount;

    while (results.generated < needed) {
      // Check if we're running out of time
      if (Date.now() - startTime > maxRuntime) {
        console.log('Approaching timeout, stopping');
        break;
      }

      const result = await generateOneQuestion(summaryModel, questionModel, modelName);

      if (result.success) {
        results.generated++;
        console.log(`Generated: ${result.question.summary}`);
      } else if (result.rateLimit) {
        const { wait, isDaily } = result.rateLimit;

        if (isDaily) {
          // Daily limit - stop entirely
          results.dailyLimitHit = true;
          results.errors.push(`Daily limit: ${result.error}`);
          console.log('Daily rate limit hit, stopping');
          break;
        } else {
          // Per-minute limit - wait and continue if we have time
          results.rateLimitWaits.push(wait);
          console.log(`Per-minute limit, waiting ${wait}ms`);

          if (Date.now() - startTime + wait > maxRuntime) {
            console.log('Not enough time to wait, stopping');
            break;
          }

          await new Promise(r => setTimeout(r, wait));
          // Don't count this as an error, just continue
        }
      } else if (result.error.includes('Duplicate')) {
        results.duplicates++;
        console.log(result.error);
      } else {
        results.errors.push(result.error);
        console.error(`Error: ${result.error}`);
      }

      // Brief pause between generations
      await new Promise(r => setTimeout(r, 1000));
    }

    results.finalCount = await getActiveQuestionCount();

    return res.status(200).json({
      ...results,
      message: results.dailyLimitHit
        ? `Daily limit hit after generating ${results.generated} questions`
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
