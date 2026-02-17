/**
 * Migration endpoint — bulk-inserts localStorage history into user_responses
 * Called once on first login to migrate anonymous data to the user's account.
 *
 * Expects: POST { responses: [{ questionId, userLow, userHigh, confidence, correctAnswer, isCorrect, answeredAt }] }
 * Auth: Bearer token (Supabase JWT)
 */

const { createClient } = require('@supabase/supabase-js');

// Scoring constants (must match client-side scoring.js)
const LOG_SCORE_FLOOR = -8;

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

/**
 * Calculate z-score for a given probability (inverse normal CDF)
 */
function getZScore(p) {
  if (p <= 0 || p >= 1) return 0;
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  let t, z;
  if (p < 0.5) {
    t = Math.sqrt(-2 * Math.log(p));
    z = -(t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
  } else {
    t = Math.sqrt(-2 * Math.log(1 - p));
    z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  }
  return z;
}

/**
 * Calculate normalized score (0-100) from answer data
 */
function calculateScore(userLow, userHigh, confidence, correctAnswer) {
  const rangeWidth = userHigh - userLow;
  if (rangeWidth <= 0) return 0;

  const mean = (userLow + userHigh) / 2;
  const confidenceDecimal = confidence / 100;
  const zConf = getZScore((1 + confidenceDecimal) / 2);
  const sigma = (userHigh - mean) / zConf;
  const z = (correctAnswer - mean) / sigma;
  const logScore = Math.max(-(z * z) / 2, LOG_SCORE_FLOOR);

  // Normalize to 0-100
  return ((logScore - LOG_SCORE_FLOOR) / (0 - LOG_SCORE_FLOOR)) * 100;
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

    // Build rows for bulk insert with full answer data
    const rows = responses
      .filter(r => r.questionId && r.userLow != null && r.userHigh != null && r.correctAnswer != null)
      .map(r => ({
        user_id: user.id,
        question_id: r.questionId,
        answer: (r.userLow + r.userHigh) / 2,
        user_low: r.userLow,
        user_high: r.userHigh,
        correct_answer: r.correctAnswer,
        is_correct: r.isCorrect,
        score: calculateScore(r.userLow, r.userHigh, r.confidence, r.correctAnswer),
        confidence: r.confidence,
        answered_at: r.answeredAt ? new Date(r.answeredAt).toISOString() : new Date().toISOString()
      }));

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid responses to migrate' });
    }

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
