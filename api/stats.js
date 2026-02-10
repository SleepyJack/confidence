/**
 * Stats API — aggregate metrics for the admin dashboard
 * GET /api/stats?days=30
 */

const { getClient } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getClient();

  // Parse days param (7, 30, 90, or 0/absent = all time)
  const daysParam = parseInt(req.query.days, 10);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 0;

  try {
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

    // Time series: fetch created_at for questions within range
    let query = supabase
      .from('questions')
      .select('created_at')
      .order('created_at', { ascending: true });

    // Use UTC throughout to match Supabase TIMESTAMPTZ values
    const now = new Date();
    let startDate;
    if (days > 0) {
      startDate = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days
      ));
      query = query.gte('created_at', startDate.toISOString());
    }

    const { data: rows, error: tsErr } = await query;
    if (tsErr) throw tsErr;

    // Group by UTC day
    const countsByDate = {};
    for (const row of rows) {
      const day = row.created_at.slice(0, 10); // YYYY-MM-DD (UTC)
      countsByDate[day] = (countsByDate[day] || 0) + 1;
    }

    // Fill gaps with zero-count entries (all UTC)
    const timeSeries = [];
    if (rows.length > 0) {
      const first = startDate || new Date(rows[0].created_at);
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
    }

    res.status(200).json({
      totalQuestions,
      activeQuestions,
      avgResponsesPerQuestion,
      timeSeries
    });
  } catch (error) {
    console.error('Stats API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
