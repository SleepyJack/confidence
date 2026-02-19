/**
 * Respond endpoint — saves a single user response and updates question stats.
 *
 * POST /api/auth/respond
 * Auth: Bearer token (Supabase JWT)
 * Body: { questionId, userLow, userHigh, confidence, correctAnswer, isCorrect, score }
 */

const { getClient } = require('../_lib/supabase');
const { updateQuestionStats } = require('../_lib/update-question-stats');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const accessToken = authHeader.slice(7);

  const { questionId, userLow, userHigh, confidence, correctAnswer, isCorrect, score } = req.body || {};

  if (!questionId || userLow == null || userHigh == null || correctAnswer == null || score == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const supabase = getClient();

    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Insert the response
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

    // Update question aggregate stats (fire-and-forget is fine here,
    // but we await to keep it simple and ensure consistency)
    await updateQuestionStats(questionId, supabase);

    res.json({ ok: true });
  } catch (err) {
    console.error('Respond error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
