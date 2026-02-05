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

  try {
    const cfg = getConfig();
    const sourceName = cfg.questionSource || 'json';

    // Validate source exists
    if (!sources[sourceName]) {
      return res.status(500).json({
        error: `Unknown question source: ${sourceName}. Valid options: ${Object.keys(sources).join(', ')}`
      });
    }

    // Get the source module
    const source = sources[sourceName]();

    // Parse seen IDs from query string: ?seen=id1,id2,id3
    const seenParam = req.query.seen || '';
    const seenIds = new Set(seenParam ? seenParam.split(',') : []);

    // Get next question from the source
    const result = await source.getNextQuestion(seenIds);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting next question:', error);
    res.status(500).json({
      error: error.message || 'Failed to get next question'
    });
  }
};
