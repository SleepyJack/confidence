/**
 * Kimi K2.5-based question source
 * Generates questions using Moonshot AI's Kimi API (OpenAI-compatible)
 */

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

/**
 * System prompt for question generation
 */
const SYSTEM_PROMPT = `You are a trivia question generator for a calibration game. Generate a single trivia question that has a NUMERICAL answer.

Requirements:
1. The question must have a specific, factual numerical answer
2. The question text MUST specify the unit of measurement (e.g., "in kilometers", "in millions of people", "in degrees Celsius")
3. Provide both a source name and source URL for the data
4. Choose interesting topics: science, geography, history, economics, sports statistics, demographics, engineering, nature, etc.
5. Avoid questions that are too easy (like "how many days in a week") or too obscure

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "question": "What is the average distance from Earth to the Moon in kilometers?",
  "answer": 384400,
  "unit": "km",
  "category": "astronomy",
  "sourceName": "NASA",
  "sourceUrl": "https://example.com/source-url"
}

The "question" MUST include the unit (e.g., "in kilometers", "in years", "in USD").
The "unit" should be a short label matching the unit in the question: km, m, years, people, kg, celsius, USD, etc.
The "category" should be one of: astronomy, geography, biology, physics, history, chemistry, economics, sports, demographics, engineering, nature, technology
The "sourceName" should be a short name for the source (e.g., "NASA", "Wikipedia", "WHO")
The "sourceUrl" MUST be a valid URL where this data can be verified.`;

/**
 * Validate that a source URL is reachable (returns 2xx or 3xx)
 * @param {string} url - The URL to validate
 * @returns {Promise<boolean>} - True if URL is valid
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
    console.warn(`Source URL validation failed for ${url}:`, error.message);
    return false;
  }
}

const MAX_RETRIES = 3;
const KIMI_API_BASE = 'https://api.moonshot.cn/v1';

/**
 * Attempt a single question generation via Kimi API
 */
async function attemptGeneration(apiKey, modelName) {
  const response = await fetch(`${KIMI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: 'Generate a trivia question with a numerical answer. Respond with JSON only.'
        }
      ],
      temperature: 0.6,  // Instant mode for faster responses
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Kimi API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  // Extract the content from the response
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Empty response from Kimi API');
  }

  // Check finish reason
  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    throw new Error('Kimi response was truncated due to token limit');
  }

  // Parse the JSON response
  let questionData;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    questionData = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    throw new Error(`Failed to parse Kimi response as JSON: ${parseError.message}\nResponse was: ${text}`);
  }

  // Validate required fields
  const required = ['question', 'answer', 'unit', 'category', 'sourceName', 'sourceUrl'];
  for (const field of required) {
    if (!(field in questionData)) {
      throw new Error(`Missing required field '${field}' in Kimi response`);
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
    sourceName: questionData.sourceName,
    sourceUrl: questionData.sourceUrl,
    creator: modelName
  };
}

/**
 * Get next question from Kimi
 * @param {Set<string>} seenIds - Set of question IDs already seen (unused for Kimi, always generates new)
 * @returns {Promise<{question: object, poolReset: boolean}>}
 */
async function getNextQuestion(seenIds) {
  // Get API key from environment
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    throw new Error('KIMI_API_KEY environment variable is not set');
  }

  // Get the model name from config
  const cfg = getConfig();
  const modelName = cfg.kimi?.model || 'kimi-k2.5';

  // Retry logic
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const question = await attemptGeneration(apiKey, modelName);

      // Persist to DB (non-blocking — failure is logged but doesn't break the request)
      if (cfg.persistQuestions === false) {
        // Skip persistence when disabled in config
      } else try {
        const supabase = getSupabase();
        const { error: insertError } = await supabase.from('questions').insert({
          id: question.id,
          question: question.question,
          answer: question.answer,
          unit: question.unit,
          category: question.category,
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

      return {
        question,
        poolReset: false  // Never resets for Kimi (infinite questions)
      };
    } catch (error) {
      lastError = error;
      console.error(`Kimi question generation attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  throw new Error(`Kimi failed to generate question after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

module.exports = { getNextQuestion };
