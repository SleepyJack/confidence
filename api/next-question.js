const fs = require('fs');
const path = require('path');

// Load and cache questions at module level (survives warm invocations)
let questions = null;
function getQuestions() {
  if (!questions) {
    const filePath = path.join(process.cwd(), 'data', 'questions.json');
    questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return questions;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allQuestions = getQuestions();
  if (!allQuestions || allQuestions.length === 0) {
    return res.status(500).json({ error: 'No questions available' });
  }

  // Parse seen IDs from query string: ?seen=id1,id2,id3
  const seenParam = req.query.seen || '';
  const seenIds = new Set(seenParam ? seenParam.split(',') : []);

  // Filter to unseen questions
  const unseen = allQuestions.filter(q => !seenIds.has(q.id));

  // Pick from unseen if available, otherwise full pool (implicit reset)
  const pool = unseen.length > 0 ? unseen : allQuestions;
  const question = pool[Math.floor(Math.random() * pool.length)];

  // Return the question plus a flag indicating whether the pool was reset
  res.status(200).json({
    question,
    poolReset: unseen.length === 0
  });
};
