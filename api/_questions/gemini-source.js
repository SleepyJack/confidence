/**
 * Gemini-based question source (fallback only)
 *
 * Generates questions on-demand using Google's Gemini API.
 * Used as a fallback when DB source fails.
 * Questions generated here are NOT persisted (use cron job for that).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
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

// Load prompt from shared file
const QUESTION_PROMPT = fs.readFileSync(
  path.join(process.cwd(), 'prompts', 'question.txt'),
  'utf8'
);

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
 * Validate that a source URL is reachable (returns 2xx or 3xx)
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

/**
 * Attempt a single question generation
 */
async function attemptGeneration(model, modelName) {
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: QUESTION_PROMPT }]
    }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 2048
    }
  });

  const response = result.response;

  // Check if response was truncated
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response was truncated due to token limit');
  }

  const text = response.text();

  // Parse the JSON response
  let questionData;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    questionData = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    throw new Error(`Failed to parse Gemini response as JSON: ${parseError.message}`);
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

  // Build the question object
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
 * Get next question from Gemini (fallback, no persistence)
 * @param {Set<string>} seenIds - Set of question IDs already seen (unused for Gemini)
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
    tools: [{ googleSearch: {} }]
  });

  // Retry logic
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const question = await attemptGeneration(model, modelName);
      return {
        question,
        poolReset: false
      };
    } catch (error) {
      lastError = error;
      console.error(`Question generation attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  throw new Error(`Gemini failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

module.exports = { getNextQuestion };
