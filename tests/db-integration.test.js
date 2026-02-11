/**
 * Integration tests for database operations
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

// Skip if Supabase env vars not set
const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeIf = hasSupabase ? describe : describe.skip;

describeIf('db-integration', () => {
  let supabase;
  let dbSource;

  // Test fixture
  const testQuestion = {
    id: crypto.randomUUID(),
    question: 'What is the test value in units?',
    answer: 42,
    unit: 'units',
    category: 'test',
    summary: 'test value for integration testing',
    source_name: 'Test Suite',
    source_url: 'https://example.com/test',
    creator: 'test-runner',
    status: 'active'
  };

  beforeAll(async () => {
    // Ensure we're using the test schema
    process.env.SUPABASE_SCHEMA = 'test';

    // Reset and get fresh client
    const { resetClient, getClient } = require('../api/lib/supabase');
    resetClient();
    supabase = getClient();

    // Load db-source after schema is set
    dbSource = require('../api/questions/db-source');

    // Clean the test table
    await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  afterAll(async () => {
    // Clean up test data
    if (supabase) {
      await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
  });

  test('inserts a question and queries it back', async () => {
    // Insert
    const { error: insertError } = await supabase.from('questions').insert(testQuestion);
    expect(insertError).toBeNull();

    // Query
    const { data, error: queryError } = await supabase
      .from('questions')
      .select('*')
      .eq('id', testQuestion.id)
      .single();

    expect(queryError).toBeNull();
    expect(data).toBeTruthy();
    expect(data.question).toBe(testQuestion.question);
    expect(Number(data.answer)).toBe(testQuestion.answer);
    expect(data.unit).toBe(testQuestion.unit);
    expect(data.creator).toBe(testQuestion.creator);
  });

  test('db-source.getNextQuestion returns the inserted question', async () => {
    const result = await dbSource.getNextQuestion(new Set());

    expect(result).toBeTruthy();
    expect(result.question).toBeTruthy();
    expect(result.question.id).toBe(testQuestion.id);
    expect(result.question.question).toBe(testQuestion.question);
    expect(result.question.answer).toBe(testQuestion.answer);
    expect(result.poolReset).toBe(false);
  });

  test('db-source.getNextQuestion respects seenIds', async () => {
    // With the only question marked as seen, should get poolReset: true
    const seenIds = new Set([testQuestion.id]);
    const result = await dbSource.getNextQuestion(seenIds);

    expect(result).toBeTruthy();
    expect(result.question.id).toBe(testQuestion.id); // Still returns it (pool reset)
    expect(result.poolReset).toBe(true);
  });

  test('check_duplicate_summary detects similar summaries', async () => {
    // The test question has summary: "test value for integration testing"
    // A similar candidate should match
    const { data, error } = await supabase.rpc('check_duplicate_summary', {
      candidate: 'test value for integration',
      threshold: 0.3
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].id).toBe(testQuestion.id);
    expect(data[0].sim).toBeGreaterThan(0.3);
  });

  test('check_duplicate_summary catches substring-style duplicates', async () => {
    // Insert a question with a short summary
    const shortQ = {
      id: crypto.randomUUID(),
      question: 'What is the orbital speed of Earth in km/s?',
      answer: 29.78,
      unit: 'km/s',
      category: 'astronomy',
      summary: "Earth's average orbital speed",
      source_name: 'NASA',
      source_url: 'https://example.com',
      creator: 'test-runner',
      status: 'active'
    };
    await supabase.from('questions').insert(shortQ);

    // A longer candidate that contains the short summary should be detected
    const { data, error } = await supabase.rpc('check_duplicate_summary', {
      candidate: "Earth's average orbital speed around the Sun",
      threshold: 0.4
    });

    expect(error).toBeNull();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(shortQ.id);
    expect(data[0].sim).toBeGreaterThan(0.4);

    // Clean up
    await supabase.from('questions').delete().eq('id', shortQ.id);
  });

  test('check_duplicate_summary returns empty for unrelated summaries', async () => {
    const { data, error } = await supabase.rpc('check_duplicate_summary', {
      candidate: 'completely unrelated topic about zebras',
      threshold: 0.4
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('inserting duplicate ID fails', async () => {
    const { error } = await supabase.from('questions').insert(testQuestion);

    expect(error).toBeTruthy();
    expect(error.code).toBe('23505'); // Postgres unique violation
  });
});
