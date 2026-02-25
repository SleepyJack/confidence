/**
 * Guest respond endpoint — saves an anonymous response to response_stats.
 *
 * POST /api/respond
 * No auth required.
 * Body: { questionId, score, confidence }
 */

const { getClient } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { questionId, score, confidence } = req.body || {};

  if (!questionId || score == null) {
    return res.status(400).json({ error: 'Missing required fields' });
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
