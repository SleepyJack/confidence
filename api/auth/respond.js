/**
 * Respond endpoint — saves a single user response.
 *
 * POST /api/auth/respond
 * Auth: Bearer token (Supabase JWT)
 * Body: { questionId, userLow, userHigh, confidence, correctAnswer, isCorrect, score }
 *
 * Writes to both:
 *   - user_responses (identity-linked history)
 *   - response_stats (anonymous aggregate, player_type='user')
 */

const { getClient } = require('../_lib/supabase');
const { createRateLimiter, checkBodySize } = require('../_lib/rate-limit');

const limiter = createRateLimiter('authRespond');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (limiter.check(req, res)) return;
  if (checkBodySize(req, res)) return;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const accessToken = authHeader.slice(7);

  const { questionId, userLow, userHigh, confidence, correctAnswer, isCorrect, score } = req.body || {};

  if (!questionId || userLow == null || userHigh == null || correctAnswer == null || score == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be between 0 and 100' });
  }
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 50 || confidence > 99)) {
    return res.status(400).json({ error: 'Confidence must be between 50 and 99' });
  }

  try {
    const supabase = getClient();

    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Insert identity-linked response
    const { error: insertError } = await supabase
      .from('user_responses')
      .insert({
        user_id: user.id,
        question_id: questionId,
        answer: (userLow + userHigh) / 2,
        user_low: userLow,
        user_high: userHigh,
        correct_answer: correctAnswer,
        is_correct: isCorrect,
        score: score,
        confidence: confidence
      });

    if (insertError) {
      console.error('Response insert error:', insertError);
      return res.status(500).json({ error: 'Failed to save response' });
    }

    // Insert anonymous stat record
    const { error: statsError } = await supabase
      .from('response_stats')
      .insert({
        question_id: questionId,
        player_type: 'user',
        score: score,
        confidence: confidence
      });

    if (statsError) {
      console.error('Response stats insert error:', statsError);
      // Non-fatal — the primary response was saved
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Respond error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
