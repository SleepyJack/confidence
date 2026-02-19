/**
 * Shared Supabase client
 * Lazy-initialized, cached at module level (same pattern as gemini-source.js)
 * Uses service role key since all access is server-side
 *
 * Set SUPABASE_SCHEMA=test to use test schema for integration tests
 */

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required'
      );
    }

    const schema = process.env.SUPABASE_SCHEMA || 'public';
    supabase = createClient(url, key, {
      db: { schema }
    });
  }
  return supabase;
}

/**
 * Reset the cached client (useful for tests that need to switch schemas)
 */
function resetClient() {
  supabase = null;
}

module.exports = { getClient, resetClient };
