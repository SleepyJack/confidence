/**
 * Recompute and update question aggregate stats from user_responses.
 *
 * Updates: response_count, avg_response_prec (avg score), avg_response_conf (avg confidence)
 *
 * Recomputes from the raw data every time so the stored averages are always
 * reconstructible from user_responses — no floating-point drift.
 */

const { getClient } = require('./supabase');

/**
 * Update stats for a single question by recomputing from user_responses.
 * @param {string} questionId - UUID of the question
 * @param {object} [client] - optional Supabase client (defaults to shared service client)
 */
async function updateQuestionStats(questionId, client) {
  const supabase = client || getClient();

  const { data, error } = await supabase
    .from('user_responses')
    .select('score, confidence')
    .eq('question_id', questionId);

  if (error) {
    console.error('Failed to fetch responses for question stats:', error.message);
    return;
  }

  const count = data.length;
  let avgPrec = null;
  let avgConf = null;

  if (count > 0) {
    const totalScore = data.reduce((sum, r) => sum + Number(r.score), 0);
    const totalConf = data.reduce((sum, r) => sum + Number(r.confidence), 0);
    avgPrec = totalScore / count;
    avgConf = totalConf / count;
  }

  const { error: updateError } = await supabase
    .from('questions')
    .update({
      response_count: count,
      avg_response_prec: avgPrec,
      avg_response_conf: avgConf
    })
    .eq('id', questionId);

  if (updateError) {
    console.error('Failed to update question stats:', updateError.message);
  }
}

/**
 * Update stats for multiple questions (e.g. after bulk migration).
 * @param {string[]} questionIds - array of question UUIDs (duplicates are deduplicated)
 * @param {object} [client] - optional Supabase client
 */
async function updateQuestionStatsBatch(questionIds, client) {
  const unique = [...new Set(questionIds)];
  await Promise.all(unique.map(id => updateQuestionStats(id, client)));
}

module.exports = { updateQuestionStats, updateQuestionStatsBatch };
