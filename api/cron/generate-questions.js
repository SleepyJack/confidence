/**
 * Background question generation cron job
 *
 * Single-phase approach: generate full question, then check for duplicates.
 * Optimized for request rate limits (not token limits).
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

// Load question prompt
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
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ConfidenceBot/1.0)'
        }
      });
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
 */
async function generateEmbedding(text) {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: 'gemini-embedding-001' });

  const result = await model.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768
  });

  return result.embedding.values;
}

/**
 * Check if a summary is a duplicate via embedding similarity
 */
async function checkDuplicate(summary, embedding) {
  const supabase = getSupabase();
  const vectorStr = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('check_duplicate_embedding', {
    query_embedding: vectorStr,
    threshold: 0.85
  });

  if (error) {
    console.warn('Duplicate check failed:', error.message);
    return { duplicate: false };
  }

  if (data && data.length > 0) {
    return { duplicate: true, match: data[0] };
  }
  return { duplicate: false };
}

/**
 * Parse rate limit info from Gemini error
 */
function parseRateLimitWait(error) {
  const msg = error.message || '';

  const isRateLimit = msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('Too Many Requests');

  if (!isRateLimit) {
    return null;
  }

  console.log('Rate limit error:', msg);

  // Extract wait time (handles decimals like "30.834s")
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

      const isDaily = waitMs > 5 * 60 * 1000;
      console.log(`Parsed: wait ${Math.round(waitMs / 1000)}s, isDaily=${isDaily}`);
      return { wait: waitMs, isDaily };
    }
  }

  const isDaily = /daily|per.?day|24.?h|RPD/i.test(msg);
  const wait = isDaily ? 60 * 60 * 1000 : 60 * 1000;
  return { wait, isDaily };
}

/**
 * Validate summary from generated question
 */
function validateSummary(text) {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim();
  if (cleaned.length < 10 || cleaned.length > 200) return null;

  // Reject incomplete phrases
  if (/\s(the|a|an|of|in|on|at|to|for|with|'s)\s*$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Generate a full question with Google Search
 */
async function generateQuestion(model, modelName) {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: QUESTION_PROMPT }] }],
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

  // Validate summary
  const validatedSummary = validateSummary(data.summary);
  if (!validatedSummary) {
    throw new Error(`Invalid summary: "${data.summary}"`);
  }

  return {
    id: crypto.randomUUID(),
    question: data.question,
    answer: data.answer,
    unit: data.unit,
    category: data.category,
    summary: validatedSummary,
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
 * Single-phase: generate question -> validate URL -> check duplicate -> persist
 */
async function generateOneQuestion(model, modelName) {
  try {
    // Step 1: Generate full question (1 API call)
    console.log('Generating question...');
    const question = await generateQuestion(model, modelName);
    console.log(`Got question: "${question.summary}"`);

    // Step 2: Validate URL (no API call)
    console.log(`Validating URL: ${question.sourceUrl}`);
    if (!await validateSourceUrl(question.sourceUrl)) {
      return {
        success: false,
        error: `Invalid source URL: ${question.sourceUrl}`
      };
    }

    // Step 3: Generate embedding and check for duplicates (1 API call)
    console.log('Checking for duplicates...');
    const embedding = await generateEmbedding(question.summary);
    const { duplicate, match } = await checkDuplicate(question.summary, embedding);

    if (duplicate) {
      return {
        success: false,
        error: `Duplicate: "${question.summary}" ≈ "${match.summary}" (${(match.similarity * 100).toFixed(0)}%)`
      };
    }

    // Step 4: Persist to DB
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

  const maxRuntime = 55 * 1000;
  const startTime = Date.now();

  try {
    results.initialCount = await getActiveQuestionCount();

    if (results.initialCount >= target) {
      results.finalCount = results.initialCount;
      return res.status(200).json({
        ...results,
        message: `Target reached (${results.initialCount}/${target})`
      });
    }

    // Initialize Gemini with Google Search
    const client = getGeminiClient();
    const model = client.getGenerativeModel({
      model: modelName,
      tools: [{ googleSearch: {} }]
    });

    const needed = target - results.initialCount;

    while (results.generated < needed) {
      if (Date.now() - startTime > maxRuntime) {
        console.log('Timeout approaching, stopping');
        break;
      }

      const result = await generateOneQuestion(model, modelName);

      if (result.success) {
        results.generated++;
        console.log(`✓ Generated: ${result.question.summary}`);
      } else if (result.rateLimit) {
        const { wait, isDaily } = result.rateLimit;

        if (isDaily) {
          results.dailyLimitHit = true;
          results.errors.push(`Daily limit: ${result.error}`);
          console.log('Daily limit hit, stopping');
          break;
        } else {
          results.rateLimitWaits.push(wait);
          console.log(`Rate limit, waiting ${Math.round(wait / 1000)}s...`);

          if (Date.now() - startTime + wait > maxRuntime) {
            console.log('Not enough time to wait, stopping');
            break;
          }

          await new Promise(r => setTimeout(r, wait));
        }
      } else if (result.error.includes('Duplicate')) {
        results.duplicates++;
        console.log(`⊘ ${result.error}`);
      } else {
        results.errors.push(result.error);
        console.log(`✗ Error: ${result.error}`);
      }

      // Brief pause between attempts
      await new Promise(r => setTimeout(r, 1000));
    }

    results.finalCount = await getActiveQuestionCount();

    return res.status(200).json({
      ...results,
      message: results.dailyLimitHit
        ? `Daily limit after ${results.generated} questions`
        : `Generated ${results.generated} questions (${results.finalCount}/${target})`
    });

  } catch (error) {
    results.errors.push(error.message);
    return res.status(500).json({ ...results, error: error.message });
  }
};
