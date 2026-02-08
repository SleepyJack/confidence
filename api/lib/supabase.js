/**
 * Shared Supabase client
 * Lazy-initialized, cached at module level (same pattern as gemini-source.js)
 * Uses service role key since all access is server-side
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
    supabase = createClient(url, key);
  }
  return supabase;
}

module.exports = { getClient };
