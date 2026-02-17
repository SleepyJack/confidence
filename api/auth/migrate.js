/**
 * Migration endpoint — bulk-inserts localStorage history into user_responses
 * Called once on first login to migrate anonymous data to the user's account.
 *
 * Expects: POST { responses: [{ questionId, answer, score, confidence, answeredAt }] }
 * Auth: Bearer token (Supabase JWT)
 */

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const accessToken = authHeader.slice(7);

  const { responses } = req.body || {};
  if (!Array.isArray(responses) || responses.length === 0) {
    return res.status(400).json({ error: 'No responses to migrate' });
  }

  // Cap at 500 to prevent abuse
  if (responses.length > 500) {
    return res.status(400).json({ error: 'Too many responses (max 500)' });
  }

  try {
    const serviceClient = getServiceClient();
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Build rows for bulk insert
    const rows = responses
      .filter(r => r.questionId && r.score != null)
      .map(r => ({
        user_id: user.id,
        question_id: r.questionId,
        answer: r.answer,
        score: r.score,
        confidence: r.confidence,
        answered_at: r.answeredAt ? new Date(r.answeredAt).toISOString() : new Date().toISOString()
      }));

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid responses to migrate' });
    }

    // Use upsert-like approach: insert and skip conflicts on (user_id, question_id)
    // Since there's no unique constraint on that pair, just insert all
    const { error: insertError } = await serviceClient
      .from('user_responses')
      .insert(rows);

    if (insertError) {
      console.error('Migration insert error:', insertError);
      return res.status(500).json({ error: 'Failed to migrate responses' });
    }

    res.json({ migrated: rows.length });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
