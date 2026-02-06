/**
 * Next Question API - Router/Wrapper
 * Delegates to the appropriate question source based on config
 */

const fs = require('fs');
const path = require('path');

// Load config at module level
let config = null;
function getConfig() {
  if (!config) {
    const configPath = path.join(process.cwd(), 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return config;
}

// Question source modules (lazy loaded)
const sources = {
  json: () => require('./questions/json-source'),
  gemini: () => require('./questions/gemini-source')
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = getConfig();
  const sourceName = cfg.questionSource || 'json';

  // Validate source exists
  if (!sources[sourceName]) {
    return res.status(500).json({
      error: `Unknown question source: ${sourceName}. Valid options: ${Object.keys(sources).join(', ')}`
    });
  }

  // Parse seen IDs from query string: ?seen=id1,id2,id3
  const seenParam = req.query.seen || '';
  const seenIds = new Set(seenParam ? seenParam.split(',') : []);

  // Try primary source, fall back to json on failure
  let result;
  let usedFallback = false;
  let primaryError = null;

  try {
    const source = sources[sourceName]();
    result = await source.getNextQuestion(seenIds);
  } catch (error) {
    primaryError = error;
    console.error(`Primary source (${sourceName}) failed:`, error.message);

    // If primary source wasn't json, try json as fallback
    if (sourceName !== 'json') {
      try {
        console.log('Falling back to json source');
        const fallbackSource = sources.json();
        result = await fallbackSource.getNextQuestion(seenIds);
        usedFallback = true;
      } catch (fallbackError) {
        console.error('Fallback source also failed:', fallbackError.message);
        return res.status(500).json({
          error: 'All question sources failed',
          primaryError: primaryError.message,
          fallbackError: fallbackError.message
        });
      }
    } else {
      // Primary was json and it failed, no fallback available
      return res.status(500).json({
        error: error.message || 'Failed to get next question'
      });
    }
  }

  // Include metadata about the response
  res.status(200).json({
    ...result,
    usedFallback,
    ...(usedFallback && { fallbackReason: primaryError?.message })
  });
};
