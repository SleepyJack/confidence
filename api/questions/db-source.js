/**
 * Database-backed question source
 * Serves questions from the Supabase questions table
 */

const { getClient } = require('../lib/supabase');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Map a DB row (snake_case) to the API response shape (camelCase)
 */
function mapRow(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    unit: row.unit,
    category: row.category,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    creator: row.creator
  };
}

/**
 * Query one random active question, optionally excluding seen IDs.
 * Uses Supabase's PostgREST — random ordering isn't directly supported,
 * so we use an RPC wrapper or fetch all IDs and pick one.
 *
 * For simplicity and correctness with small-to-medium tables,
 * we fetch matching IDs and pick randomly client-side.
 */
async function fetchRandom(supabase, excludeIds) {
  let query = supabase
    .from('questions')
    .select('*')
    .eq('status', 'active');

  if (excludeIds.length > 0) {
    // PostgREST "not in" filter
    query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`DB query failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  // Pick a random row client-side
  return data[Math.floor(Math.random() * data.length)];
}

/**
 * Get next question from the database
 * @param {Set<string>} seenIds - Set of question IDs already seen
 * @returns {Promise<{question: object, poolReset: boolean}>}
 */
async function getNextQuestion(seenIds) {
  const supabase = getClient();
  const seenArray = Array.from(seenIds).filter(id => UUID_RE.test(id));

  // Try unseen questions first
  if (seenArray.length > 0) {
    const row = await fetchRandom(supabase, seenArray);
    if (row) {
      return { question: mapRow(row), poolReset: false };
    }
  }

  // Either no seen IDs or all questions seen — query without filter
  const row = await fetchRandom(supabase, []);
  if (!row) {
    throw new Error('No questions available in database');
  }

  return {
    question: mapRow(row),
    poolReset: seenArray.length > 0  // true if we had to reset, false if pool was never filtered
  };
}

module.exports = { getNextQuestion };
