/**
 * Public Supabase config endpoint
 * Returns the project URL and anon key for the browser-side Supabase client.
 * These are public values (safe to expose — RLS enforces access control).
 */

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return res.status(503).json({ error: 'Auth not configured' });
  }

  // Cache aggressively — these values don't change
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ url, anonKey });
};
