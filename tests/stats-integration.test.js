/**
 * Integration tests for the stats API endpoint
 *
 * Prerequisites:
 *   1. Run sql/setup-test-schema.sql then sql/schema.sql in Supabase (see docs/supabase-setup.md)
 *   2. Set environment variables:
 *      - SUPABASE_URL
 *      - SUPABASE_SERVICE_ROLE_KEY
 *      - SUPABASE_SCHEMA=test
 *
 * Run with: npm run test:integration
 */

const crypto = require('crypto');

const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeIf = hasSupabase ? describe : describe.skip;

// Minimal mock for Vercel req/res
function mockReqRes(query = {}) {
  const req = { method: 'GET', query };
  const res = {
    _status: null,
    _json: null,
    status(code) { this._status = code; return this; },
    json(body) { this._json = body; return this; }
  };
  return { req, res };
}

describeIf('stats-integration', () => {
  let supabase;
  let handler;
  let hasResponseStats = false;
  const insertedQuestionIds = [];
  const insertedStatIds = [];

  // Create a question with a specific created_at (ISO string)
  function makeQuestion(createdAt, opts = {}) {
    const id = crypto.randomUUID();
    insertedQuestionIds.push(id);
    return {
      id,
      question: `Stats test question ${id.slice(0, 8)}`,
      answer: 100,
      unit: 'units',
      category: 'test',
      summary: `stats test ${id.slice(0, 8)}`,
      source_name: 'Test Suite',
      source_url: 'https://example.com/test',
      creator: 'stats-test',
      status: opts.status || 'active',
      created_at: createdAt
    };
  }

  beforeAll(async () => {
    process.env.SUPABASE_SCHEMA = 'test';

    const { resetClient, getClient } = require('../api/_lib/supabase');
    resetClient();
    supabase = getClient();
    handler = require('../api/stats');

    // Check if response_stats table exists in test schema
    // (head:true count queries falsely return no error for missing tables,
    //  so use a column select which reliably reports schema-cache misses)
    try {
      const { error: probeErr } = await supabase
        .from('response_stats')
        .select('id')
        .limit(1);
      hasResponseStats = !probeErr;
    } catch (e) {
      hasResponseStats = false;
    }

    // Clean the test tables
    try {
      if (hasResponseStats) {
        await supabase.from('response_stats').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
    } catch (e) { /* table may not exist */ }
    await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert test data: 2 questions today, 2 from 3 days ago, 1 inactive
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3
    )).toISOString().slice(0, 10);

    const questions = [
      makeQuestion(`${todayStr}T10:00:00+00:00`),
      makeQuestion(`${todayStr}T14:00:00+00:00`),
      makeQuestion(`${threeDaysAgo}T08:00:00+00:00`),
      makeQuestion(`${threeDaysAgo}T20:00:00+00:00`),
      makeQuestion(`${threeDaysAgo}T12:00:00+00:00`, { status: 'retired' })
    ];

    const { error } = await supabase.from('questions').insert(questions);
    if (error) throw error;

    // Insert response_stats (only if table exists)
    if (hasResponseStats) {
      const responseStats = [
        { question_id: questions[0].id, player_type: 'user', score: 80, confidence: 70, answered_at: `${todayStr}T11:00:00+00:00` },
        { question_id: questions[0].id, player_type: 'guest', score: 60, confidence: 50, answered_at: `${todayStr}T12:00:00+00:00` },
        { question_id: questions[1].id, player_type: 'user', score: 90, confidence: 80, answered_at: `${todayStr}T15:00:00+00:00` },
        { question_id: questions[2].id, player_type: 'guest', score: 40, confidence: 30, answered_at: `${threeDaysAgo}T09:00:00+00:00` },
      ];

      const { data: statRows, error: statErr } = await supabase
        .from('response_stats')
        .insert(responseStats)
        .select('id');
      if (statErr) throw statErr;
      statRows.forEach(r => insertedStatIds.push(r.id));
    }
  });

  afterAll(async () => {
    if (supabase) {
      if (hasResponseStats && insertedStatIds.length > 0) {
        await supabase.from('response_stats').delete().in('id', insertedStatIds);
      }
      if (insertedQuestionIds.length > 0) {
        await supabase.from('questions').delete().in('id', insertedQuestionIds);
      }
    }
  });

  test('returns correct aggregate counts', async () => {
    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.totalQuestions).toBe(5);
    expect(res._json.activeQuestions).toBe(4);
  });

  test('time series includes today with correct count', async () => {
    const { req, res } = mockReqRes({ days: '7' });
    await handler(req, res);

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayEntry = res._json.timeSeries.find(e => e.date === todayStr);

    expect(todayEntry).toBeDefined();
    expect(todayEntry.count).toBe(2);
  });

  test('time series includes past dates with correct count', async () => {
    const { req, res } = mockReqRes({ days: '7' });
    await handler(req, res);

    const now = new Date();
    const threeDaysAgo = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3
    )).toISOString().slice(0, 10);

    const entry = res._json.timeSeries.find(e => e.date === threeDaysAgo);
    expect(entry).toBeDefined();
    expect(entry.count).toBe(3); // 2 active + 1 retired (no status filter on time series)
  });

  test('time series fills date gaps with zeros', async () => {
    const { req, res } = mockReqRes({ days: '7' });
    await handler(req, res);

    // Should have 8 entries (7 days ago through today inclusive)
    expect(res._json.timeSeries.length).toBe(8);

    // 8 total days, 2 have data (day -3 and day 0), so 6 zero days
    const zeroDays = res._json.timeSeries.filter(e => e.count === 0);
    expect(zeroDays.length).toBe(6);
  });

  test('days=0 returns all-time data', async () => {
    const { req, res } = mockReqRes({ days: '0' });
    await handler(req, res);

    expect(res._status).toBe(200);
    // Should start from the earliest question date
    const firstDate = res._json.timeSeries[0]?.date;
    const now = new Date();
    const threeDaysAgo = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3
    )).toISOString().slice(0, 10);
    expect(firstDate).toBe(threeDaysAgo);
  });

  test('rejects non-GET methods', async () => {
    const req = { method: 'POST', query: {} };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(body) { this._json = body; return this; }
    };

    await handler(req, res);
    expect(res._status).toBe(405);
  });

  // ── Response stats tests (skipped if table doesn't exist) ──

  const describeStats = () => hasResponseStats ? describe : describe.skip;

  // Use a function that lazily checks since hasResponseStats is set in beforeAll
  describe('response_stats', () => {
    test('returns total responses', async () => {
      if (!hasResponseStats) return;
      const { req, res } = mockReqRes();
      await handler(req, res);
      expect(res._json.totalResponses).toBe(4);
    });

    test('returns avg score and confidence', async () => {
      if (!hasResponseStats) return;
      const { req, res } = mockReqRes();
      await handler(req, res);
      // Scores: 80, 60, 90, 40 → avg = 67.5
      expect(res._json.avgScoreAll).toBe(67.5);
      // Confidences: 70, 50, 80, 30 → avg = 57.5
      expect(res._json.avgConfidenceAll).toBe(57.5);
    });

    test('type=user filters to user responses only', async () => {
      if (!hasResponseStats) return;
      const { req, res } = mockReqRes({ type: 'user' });
      await handler(req, res);
      expect(res._json.totalResponses).toBe(2);
      // User scores: 80, 90 → avg = 85.0
      expect(res._json.avgScoreAll).toBe(85);
    });

    test('type=guest filters to guest responses only', async () => {
      if (!hasResponseStats) return;
      const { req, res } = mockReqRes({ type: 'guest' });
      await handler(req, res);
      expect(res._json.totalResponses).toBe(2);
      // Guest scores: 60, 40 → avg = 50.0
      expect(res._json.avgScoreAll).toBe(50);
    });

    test('responses time series respects type filter', async () => {
      if (!hasResponseStats) return;
      const { req, res } = mockReqRes({ days: '7', type: 'user' });
      await handler(req, res);

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayEntry = res._json.responsesTimeSeries.find(e => e.date === todayStr);

      // Today has 2 user responses
      expect(todayEntry).toBeDefined();
      expect(todayEntry.count).toBe(2);
    });
  });
});
