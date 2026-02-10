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
  const insertedIds = [];

  // Create a question with a specific created_at (ISO string)
  function makeQuestion(createdAt, opts = {}) {
    const id = crypto.randomUUID();
    insertedIds.push(id);
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
      created_at: createdAt,
      response_count: opts.response_count || 0
    };
  }

  beforeAll(async () => {
    process.env.SUPABASE_SCHEMA = 'test';

    const { resetClient, getClient } = require('../api/lib/supabase');
    resetClient();
    supabase = getClient();
    handler = require('../api/stats');

    // Clean the test table
    await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert test data: 2 questions today, 2 from 3 days ago, 1 inactive
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3
    )).toISOString().slice(0, 10);

    const questions = [
      makeQuestion(`${todayStr}T10:00:00+00:00`, { response_count: 3 }),
      makeQuestion(`${todayStr}T14:00:00+00:00`, { response_count: 1 }),
      makeQuestion(`${threeDaysAgo}T08:00:00+00:00`, { response_count: 2 }),
      makeQuestion(`${threeDaysAgo}T20:00:00+00:00`),
      makeQuestion(`${threeDaysAgo}T12:00:00+00:00`, { status: 'retired' })
    ];

    const { error } = await supabase.from('questions').insert(questions);
    if (error) throw error;
  });

  afterAll(async () => {
    if (supabase && insertedIds.length > 0) {
      await supabase.from('questions').delete().in('id', insertedIds);
    }
  });

  test('returns correct aggregate counts', async () => {
    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.totalQuestions).toBe(5);
    expect(res._json.activeQuestions).toBe(4);
  });

  test('computes avg responses only from questions with responses', async () => {
    const { req, res } = mockReqRes();
    await handler(req, res);

    // 3 questions have responses: counts 3, 1, 2 → avg = 2.0
    expect(res._json.avgResponsesPerQuestion).toBe(2);
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
});
