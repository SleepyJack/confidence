/**
 * Gemini-based question source
 * Generates questions using Google's Gemini API with grounding
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

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
  "sourceName": "NASA",
  "sourceUrl": "https://example.com/source-url"
}

The "question" MUST include the unit (e.g., "in kilometers", "in years", "in USD").
The "unit" should be a short label matching the unit in the question: km, m, years, people, kg, celsius, USD, etc.
The "category" should be one of: astronomy, geography, biology, physics, history, chemistry, economics, sports, demographics, engineering, nature, technology
The "sourceName" should be a short name for the source (e.g., "NASA", "Wikipedia", "WHO")
The "sourceUrl" MUST be a valid URL where this data can be verified.`;

/**
 * Generate a unique ID from the question text
 */
function generateId(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
    + '-' + Date.now().toString(36);
}

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
 * Attempt a single question generation
 */
async function attemptGeneration(model, modelName) {
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT }]
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
  const required = ['question', 'answer', 'unit', 'category', 'sourceName', 'sourceUrl'];
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

  // Build the question object with generated ID and creator
  return {
    id: generateId(questionData.question),
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

  // Retry logic
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const question = await attemptGeneration(model, modelName);
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
