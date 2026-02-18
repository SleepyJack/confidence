/**
 * Stats API — aggregate metrics for the admin dashboard
 * GET /api/stats?days=30
 */

const { getClient } = require('./lib/supabase');

/**
 * Fill date gaps in a time series with zero-count entries.
 * @param {Object} countsByDate - { 'YYYY-MM-DD': count }
 * @param {Date|null} startDate - range start (UTC) or null for auto
 * @param {Date} now - current date
 * @param {Array} rows - raw rows (used to find first date if startDate is null)
 * @param {string} dateField - the field name containing the timestamp
 * @returns {Array<{date: string, count: number}>}
 */
function buildTimeSeries(countsByDate, startDate, now, rows, dateField) {
  const timeSeries = [];
  if (rows.length === 0) return timeSeries;

  const first = startDate || new Date(rows[0][dateField]);
  const cursor = new Date(Date.UTC(
    first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()
  ));
  const endDate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ));

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    timeSeries.push({ date: dateStr, count: countsByDate[dateStr] || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return timeSeries;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getClient();

  // Parse days param (7, 30, 90, or 0/absent = all time)
  const daysParam = parseInt(req.query.days, 10);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 0;

  try {
    // Use UTC throughout to match Supabase TIMESTAMPTZ values
    const now = new Date();
    let startDate;
    if (days > 0) {
      startDate = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days
      ));
    }

    // ── Questions ──────────────────────────────────────────────

    // Total questions (all statuses)
    const { count: totalQuestions, error: totalErr } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true });
    if (totalErr) throw totalErr;

    // Active questions only
    const { count: activeQuestions, error: activeErr } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    if (activeErr) throw activeErr;

    // Average responses per question (only questions that have responses)
    const { data: avgData, error: avgErr } = await supabase
      .from('questions')
      .select('response_count')
      .gt('response_count', 0);
    if (avgErr) throw avgErr;

    let avgResponsesPerQuestion = 0;
    if (avgData.length > 0) {
      const sum = avgData.reduce((acc, row) => acc + row.response_count, 0);
      avgResponsesPerQuestion = Math.round((sum / avgData.length) * 10) / 10;
    }

    // Questions time series
    let qQuery = supabase
      .from('questions')
      .select('created_at')
      .order('created_at', { ascending: true });
    if (startDate) {
      qQuery = qQuery.gte('created_at', startDate.toISOString());
    }
    const { data: qRows, error: tsErr } = await qQuery;
    if (tsErr) throw tsErr;

    const qCountsByDate = {};
    for (const row of qRows) {
      const day = row.created_at.slice(0, 10);
      qCountsByDate[day] = (qCountsByDate[day] || 0) + 1;
    }
    const timeSeries = buildTimeSeries(qCountsByDate, startDate, now, qRows, 'created_at');

    // ── Responses ─────────────────────────────────────────────
    // These tables may not exist in all environments (e.g. test schema),
    // so errors are caught and defaults returned.

    let totalResponses = 0;
    let avgScoreAll = 0;
    let avgConfidenceAll = 0;
    let responsesTimeSeries = [];

    const { count: _respCount, error: respCountErr } = await supabase
      .from('user_responses')
      .select('*', { count: 'exact', head: true });

    if (!respCountErr) {
      totalResponses = _respCount || 0;

      const { data: respAggData, error: respAggErr } = await supabase
        .from('user_responses')
        .select('score, confidence');

      if (!respAggErr && respAggData && respAggData.length > 0) {
        const scoreSum = respAggData.reduce((acc, r) => acc + Number(r.score), 0);
        avgScoreAll = Math.round((scoreSum / respAggData.length) * 10) / 10;

        const confRows = respAggData.filter(r => r.confidence != null);
        if (confRows.length > 0) {
          const confSum = confRows.reduce((acc, r) => acc + Number(r.confidence), 0);
          avgConfidenceAll = Math.round((confSum / confRows.length) * 10) / 10;
        }
      }

      let rQuery = supabase
        .from('user_responses')
        .select('answered_at')
        .order('answered_at', { ascending: true });
      if (startDate) {
        rQuery = rQuery.gte('answered_at', startDate.toISOString());
      }
      const { data: rRows, error: rTsErr } = await rQuery;

      if (!rTsErr && rRows) {
        const rCountsByDate = {};
        for (const row of rRows) {
          const day = row.answered_at.slice(0, 10);
          rCountsByDate[day] = (rCountsByDate[day] || 0) + 1;
        }
        responsesTimeSeries = buildTimeSeries(rCountsByDate, startDate, now, rRows, 'answered_at');
      }
    }

    // ── Users ─────────────────────────────────────────────────

    let totalUsers = 0;
    let usersTimeSeries = [];

    const { count: _usersCount, error: usersCountErr } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    if (!usersCountErr) {
      totalUsers = _usersCount || 0;

      let uQuery = supabase
        .from('user_profiles')
        .select('created_at')
        .order('created_at', { ascending: true });
      if (startDate) {
        uQuery = uQuery.gte('created_at', startDate.toISOString());
      }
      const { data: uRows, error: uTsErr } = await uQuery;

      if (!uTsErr && uRows) {
        const uCountsByDate = {};
        for (const row of uRows) {
          const day = row.created_at.slice(0, 10);
          uCountsByDate[day] = (uCountsByDate[day] || 0) + 1;
        }
        usersTimeSeries = buildTimeSeries(uCountsByDate, startDate, now, uRows, 'created_at');
      }
    }

    // ── Response ──────────────────────────────────────────────

    res.status(200).json({
      totalQuestions,
      activeQuestions,
      avgResponsesPerQuestion,
      timeSeries,
      totalResponses,
      avgScoreAll,
      avgConfidenceAll,
      responsesTimeSeries,
      totalUsers,
      usersTimeSeries
    });
  } catch (error) {
    console.error('Stats API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
