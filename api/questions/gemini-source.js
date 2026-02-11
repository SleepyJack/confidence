/**
 * Gemini-based question source
 * Generates questions using Google's Gemini API with grounding
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

// Initialize client (API key from environment)
let genAI = null;
function getClient() {
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
 * System prompt for question generation
 */
const SYSTEM_PROMPT = `You are a trivia question generator for a calibration game. Generate a single trivia question that has a NUMERICAL answer.

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
 * Validate that a source URL is reachable (returns 2xx or 3xx)
 * @param {string} url - The URL to validate
 * @returns {Promise<boolean>} - True if URL is valid
 */
async function validateSourceUrl(url) {
  try {
    // Basic URL format check
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Use GET (not HEAD — many servers handle HEAD inconsistently)
    // Abort as soon as we get the status code to avoid downloading the body
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

      // Got the status — abort the body download
      controller.abort();

      return response.status >= 200 && response.status < 400;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn(`Source URL validation failed for ${url}:`, error.message);
    return false;
  }
}

const MAX_RETRIES = 3;

/**
 * Phase 1: Generate a summary-only candidate (cheap, few tokens)
 */
async function generateSummary(model) {
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: SUMMARY_PROMPT }]
    }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 64
    }
  });

  const text = result.response.text().trim();
  // Validate it's a non-empty short string (not JSON, not garbage)
  if (!text || text.length > 200 || text.startsWith('{')) {
    return null;
  }
  return text;
}

/**
 * Check if a summary is a duplicate of an existing question via Supabase RPC
 * @returns {{ duplicate: boolean, match?: { id: string, summary: string, sim: number } }}
 */
async function checkDuplicate(summary) {
  try {
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
  } catch (err) {
    console.warn('Duplicate check failed:', err.message);
    return { duplicate: false };
  }
}

/**
 * Attempt a single question generation
 */
async function attemptGeneration(model, modelName, summary) {
  const prompt = summary
    ? `${SYSTEM_PROMPT}\n\nGenerate a question about: ${summary}`
    : SYSTEM_PROMPT;

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 1.0,  // Higher temperature for variety
      maxOutputTokens: 2048
    }
  });

  const response = result.response;

  // Check if response was truncated
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was truncated due to token limit');
  }

  const text = response.text();

  // Parse the JSON response
  let questionData;
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    questionData = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    throw new Error(`Failed to parse Gemini response as JSON: ${parseError.message}\nResponse was: ${text}`);
  }

  // Validate required fields
  const required = ['question', 'answer', 'unit', 'category', 'summary', 'sourceName', 'sourceUrl'];
  for (const field of required) {
    if (!(field in questionData)) {
      throw new Error(`Missing required field '${field}' in Gemini response`);
    }
  }

  // Validate answer is a number
  if (typeof questionData.answer !== 'number') {
    throw new Error(`Answer must be a number, got: ${typeof questionData.answer}`);
  }

  // Validate source URL is reachable
  const isValidUrl = await validateSourceUrl(questionData.sourceUrl);
  if (!isValidUrl) {
    throw new Error(`Source URL is not reachable: ${questionData.sourceUrl}`);
  }

  // Build the question object with UUID and creator
  return {
    id: crypto.randomUUID(),
    question: questionData.question,
    answer: questionData.answer,
    unit: questionData.unit,
    category: questionData.category,
    summary: questionData.summary || summary,
    sourceName: questionData.sourceName,
    sourceUrl: questionData.sourceUrl,
    creator: modelName
  };
}

/**
 * Get next question from Gemini
 * @param {Set<string>} seenIds - Set of question IDs already seen (unused for Gemini, always generates new)
 * @returns {Promise<{question: object, poolReset: boolean}>}
 */
async function getNextQuestion(seenIds) {
  const client = getClient();

  // Get the model name from config
  const cfg = getConfig();
  const modelName = cfg.gemini?.model;
  if (!modelName) {
    throw new Error('gemini.model not configured in config.json');
  }

  // Get the model with grounding enabled
  const model = client.getGenerativeModel({
    model: modelName,
    // Enable grounding with Google Search
    tools: [{
      googleSearch: {}
    }]
  });

  const shouldPersist = cfg.persistQuestions !== false;

  // Retry logic — two-phase generation
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Phase 1: Generate a cheap summary and check for duplicates
      let summary = null;
      if (shouldPersist) {
        try {
          summary = await generateSummary(model);
          if (summary) {
            const { duplicate, match } = await checkDuplicate(summary);
            if (duplicate) {
              console.warn(
                `Duplicate topic detected (attempt ${attempt}/${MAX_RETRIES}): "${summary}" ` +
                `≈ "${match.summary}" (similarity: ${match.sim.toFixed(2)})`
              );
              throw new Error(`Duplicate topic: "${summary}"`);
            }
            console.log(`Phase 1 passed — unique summary: "${summary}"`);
          }
        } catch (phase1Error) {
          if (phase1Error.message.startsWith('Duplicate topic:')) {
            throw phase1Error;  // Let the retry loop handle it
          }
          // Phase 1 failure (e.g. model error) — fall through to Phase 2 without summary
          console.warn('Phase 1 (summary) failed, proceeding without duplicate check:', phase1Error.message);
        }
      }

      // Phase 2: Generate the full question
      const question = await attemptGeneration(model, modelName, summary);

      // Post-Phase-2 duplicate check: the final summary may differ from Phase 1's
      if (shouldPersist && question.summary && question.summary !== summary) {
        const { duplicate, match } = await checkDuplicate(question.summary);
        if (duplicate) {
          console.warn(
            `Duplicate detected post-generation (attempt ${attempt}/${MAX_RETRIES}): "${question.summary}" ` +
            `≈ "${match.summary}" (similarity: ${match.sim.toFixed(2)})`
          );
          throw new Error(`Duplicate topic: "${question.summary}"`);
        }
      }

      // Persist to DB
      if (shouldPersist) {
        try {
          const supabase = getSupabase();
          const { error: insertError } = await supabase.from('questions').insert({
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
          if (insertError) {
            console.warn('Failed to persist question to DB:', insertError.message);
          }
        } catch (dbError) {
          console.warn('Failed to persist question to DB:', dbError.message);
        }
      }

      return {
        question,
        poolReset: false  // Never resets for Gemini (infinite questions)
      };
    } catch (error) {
      lastError = error;
      console.error(`Question generation attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        // Brief pause before retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // All retries exhausted
  throw new Error('Failed to generate question. Please try again later.');
}

module.exports = { getNextQuestion };
