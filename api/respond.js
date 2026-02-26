/**
 * Guest respond endpoint — saves an anonymous response to response_stats.
 *
 * POST /api/respond
 * No auth required.
 * Body: { questionId, score, confidence }
 */

const { getClient } = require('./_lib/supabase');
const { createRateLimiter, checkBodySize } = require('./_lib/rate-limit');

const limiter = createRateLimiter('guestRespond');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (limiter.check(req, res)) return;
  if (checkBodySize(req, res)) return;

  const { questionId, score, confidence } = req.body || {};

  if (!questionId || score == null) {
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

    // Verify the question exists
    const { count, error: qErr } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('id', questionId);

    if (qErr || count === 0) {
      return res.status(400).json({ error: 'Invalid question' });
    }

    // Insert anonymous stat record
    const { error: insertError } = await supabase
      .from('response_stats')
      .insert({
        question_id: questionId,
        player_type: 'guest',
        score: score,
        confidence: confidence
      });

    if (insertError) {
      console.error('Guest response insert error:', insertError);
      return res.status(500).json({ error: 'Failed to save response' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Guest respond error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
