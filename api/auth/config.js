/**
 * Public Supabase config endpoint
 * Returns the project URL and anon key for the browser-side Supabase client.
 * These are public values (safe to expose — RLS enforces access control).
 */

const fs = require('fs');
const path = require('path');

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../../config.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn('Failed to load config.json:', err.message);
    return {};
  }
}

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return res.status(503).json({ error: 'Auth not configured' });
  }

  // Load config fresh each request (allows runtime changes)
  const appConfig = loadConfig();

  res.json({
    url,
    anonKey,
    emailConfirmation: appConfig.auth?.emailConfirmation ?? true
  });
};
