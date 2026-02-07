const mockQuestions = [
  { id: 'q1', question: 'Question 1?', answer: 100, unit: 'm',  category: 'test', creator: 'demo (claude)' },
  { id: 'q2', question: 'Question 2?', answer: 200, unit: 'kg', category: 'science', creator: 'demo (claude)' },
  { id: 'q3', question: 'Question 3?', answer: 300, unit: 's',  category: 'geography', creator: 'demo (claude)' },
];

const mockConfig = {
  questionSources: ['json']
};

// Helpers ---------------------------------------------------------------
function req(method = 'GET', query = {}) {
  return { method, query };
}

function res() {
  const r = {};
  r.status = jest.fn(() => r);
  r.json   = jest.fn(() => r);
  return r;
}

function createFsMock(questions = mockQuestions, config = mockConfig) {
  return {
    readFileSync: jest.fn((filePath) => {
      if (filePath.includes('config.json')) {
        return JSON.stringify(config);
      }
      return JSON.stringify(questions);
    }),
  };
}

// next-question.js caches config at module scope, so we need a fresh
// require for each test to avoid cross-test pollution.
let handler;
beforeEach(() => {
  jest.resetModules();
  jest.doMock('fs', () => createFsMock());
  handler = require('../api/next-question');
});

// -----------------------------------------------------------------------
describe('next-question', () => {
  test('rejects non-GET with 405', async () => {
    const r = res();
    await handler(req('POST'), r);
    expect(r.status).toHaveBeenCalledWith(405);
    expect(r.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('returns a valid question and poolReset: false when nothing seen', async () => {
    const r = res();
    await handler(req('GET', {}), r);
    expect(r.status).toHaveBeenCalledWith(200);

    const { question, poolReset } = r.json.mock.calls[0][0];
    expect(mockQuestions).toContainEqual(question);
    expect(poolReset).toBe(false);
  });

  test('excludes seen questions', async () => {
    const r = res();
    await handler(req('GET', { seen: 'q1,q2' }), r);

    const { question, poolReset } = r.json.mock.calls[0][0];
    expect(question.id).toBe('q3');
    expect(poolReset).toBe(false);
  });

  test('sets poolReset: true when every question has been seen', async () => {
    const r = res();
    await handler(req('GET', { seen: 'q1,q2,q3' }), r);

    const { question, poolReset } = r.json.mock.calls[0][0];
    expect(mockQuestions).toContainEqual(question);
    expect(poolReset).toBe(true);
  });

  test('ignores unknown IDs in seen list', async () => {
    const r = res();
    await handler(req('GET', { seen: 'q1,q2,unknown-id' }), r);

    const { question, poolReset } = r.json.mock.calls[0][0];
    expect(question.id).toBe('q3');       // only q3 is unseen
    expect(poolReset).toBe(false);
  });

  test('returned question has expected shape', async () => {
    const r = res();
    await handler(req('GET'), r);

    const { question } = r.json.mock.calls[0][0];
    expect(question).toHaveProperty('id');
    expect(question).toHaveProperty('question');
    expect(question).toHaveProperty('answer');
    expect(question).toHaveProperty('unit');
    expect(question).toHaveProperty('category');
    expect(question).toHaveProperty('creator');
  });

  test('returns 500 when all sources fail', async () => {
    jest.resetModules();
    jest.doMock('fs', () => createFsMock([], mockConfig));
    const emptyHandler = require('../api/next-question');

    const r = res();
    await emptyHandler(req('GET'), r);
    expect(r.status).toHaveBeenCalledWith(500);

    const body = r.json.mock.calls[0][0];
    expect(body.error).toBe('All question sources failed');
    expect(body.errors).toContain('json: No questions available in JSON source');
  });

  test('returns 500 when questionSources not configured', async () => {
    jest.resetModules();
    jest.doMock('fs', () => createFsMock(mockQuestions, {}));
    const badConfigHandler = require('../api/next-question');

    const r = res();
    await badConfigHandler(req('GET'), r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json).toHaveBeenCalledWith({
      error: 'questionSources not configured in config.json'
    });
  });
});
