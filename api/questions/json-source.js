/**
 * JSON-based question source
 * Returns questions from the static questions.json file
 */

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

/**
 * Get next question from JSON pool
 * @param {Set<string>} seenIds - Set of question IDs already seen
 * @returns {{question: object, poolReset: boolean}}
 */
function getNextQuestion(seenIds) {
  const allQuestions = getQuestions();
  if (!allQuestions || allQuestions.length === 0) {
    throw new Error('No questions available in JSON source');
  }

  // Filter to unseen questions
  const unseen = allQuestions.filter(q => !seenIds.has(q.id));

  // Pick from unseen if available, otherwise full pool (implicit reset)
  const pool = unseen.length > 0 ? unseen : allQuestions;
  const question = pool[Math.floor(Math.random() * pool.length)];

  return {
    question,
    poolReset: unseen.length === 0
  };
}

module.exports = { getNextQuestion };
