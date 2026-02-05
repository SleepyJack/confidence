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
2. Use web search to find accurate, current data
3. Provide both a source name and source URL for the data
4. Choose interesting topics: science, geography, history, economics, sports statistics, demographics, engineering, nature, etc.
5. Avoid questions that are too easy (like "how many days in a week") or too obscure

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "question": "Your question here?",
  "answer": 12345,
  "unit": "km",
  "category": "geography",
  "sourceName": "NASA",
  "sourceUrl": "https://example.com/source-url"
}

The "unit" should be a short label like: km, m, years, people, kg, celsius, USD, etc.
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

  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT }]
    }],
    generationConfig: {
      temperature: 1.0,  // Higher temperature for variety
      maxOutputTokens: 500
    }
  });

  const response = result.response;
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

  // Build the question object with generated ID and creator
  const question = {
    id: generateId(questionData.question),
    question: questionData.question,
    answer: questionData.answer,
    unit: questionData.unit,
    category: questionData.category,
    sourceName: questionData.sourceName,
    sourceUrl: questionData.sourceUrl,
    creator: modelName
  };

  return {
    question,
    poolReset: false  // Never resets for Gemini (infinite questions)
  };
}

module.exports = { getNextQuestion };
