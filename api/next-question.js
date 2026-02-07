/**
 * Next Question API - Router/Wrapper
 * Delegates to the appropriate question source based on config
 * Tries sources in order defined by questionSources in config.json
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
  gemini: () => require('./questions/gemini-source'),
  kimi: () => require('./questions/kimi-source')
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cfg = getConfig();

  // Get source chain from config (default to json-only if not specified)
  const chain = cfg.questionSources || ['json'];

  // Parse seen IDs from query string: ?seen=id1,id2,id3
  const seenParam = req.query.seen || '';
  const seenIds = new Set(seenParam ? seenParam.split(',') : []);

  // Try each source in the chain
  let result;
  let usedFallback = false;
  let fallbackReason = null;
  const errors = [];

  for (let i = 0; i < chain.length; i++) {
    const sourceName = chain[i];

    // Skip sources that don't exist
    if (!sources[sourceName]) {
      console.warn(`Unknown source in chain: ${sourceName}`);
      continue;
    }

    try {
      const source = sources[sourceName]();
      result = await source.getNextQuestion(seenIds);
      usedFallback = i > 0;
      if (usedFallback && errors.length > 0) {
        fallbackReason = errors[0].message;
      }
      break;  // Success, exit the chain
    } catch (error) {
      console.error(`Source '${sourceName}' failed:`, error.message);
      errors.push({ source: sourceName, message: error.message });
    }
  }

  // If no source succeeded, return error
  if (!result) {
    return res.status(500).json({
      error: 'All question sources failed',
      errors: errors.map(e => `${e.source}: ${e.message}`)
    });
  }

  // Include metadata about the response
  res.status(200).json({
    ...result,
    usedFallback,
    ...(usedFallback && { fallbackReason })
  });
};
