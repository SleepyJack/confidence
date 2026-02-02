/**
 * Game module - manages game state and logic
 */

const Game = {
  questions: [],
  currentQuestion: null,
  seenQuestions: [],

  /**
   * Initialize the game
   */
  async init() {
    await this.loadQuestions();
    this.seenQuestions = Storage.getSeenQuestions();
  },

  /**
   * Load questions from JSON file
   */
  async loadQuestions() {
    try {
      const response = await fetch('data/questions.json');
      this.questions = await response.json();
    } catch (error) {
      console.error('Failed to load questions:', error);
      this.questions = [];
    }
  },

  /**
   * Get a random question (prefer unseen ones)
   */
  getNextQuestion() {
    if (this.questions.length === 0) return null;

    // Get unseen questions
    const unseenQuestions = this.questions.filter(
      q => !this.seenQuestions.includes(q.id)
    );

    // If all questions seen, reset and start over
    let availableQuestions = unseenQuestions.length > 0 ? unseenQuestions : this.questions;

    // Pick random question
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    this.currentQuestion = availableQuestions[randomIndex];

    // If we're resetting (all seen), clear seen list
    if (unseenQuestions.length === 0) {
      this.seenQuestions = [];
      Storage.clearHistory(); // Optional: could keep history but reset seen
    }

    return this.currentQuestion;
  },

  /**
   * Submit an answer
   */
  submitAnswer(userLow, userHigh, confidence) {
    if (!this.currentQuestion) return null;

    const correctAnswer = this.currentQuestion.answer;
    const isCorrect = Scoring.isAnswerCorrect(userLow, userHigh, correctAnswer);

    const answerData = {
      questionId: this.currentQuestion.id,
      question: this.currentQuestion.question,
      userLow: userLow,
      userHigh: userHigh,
      confidence: confidence,
      correctAnswer: correctAnswer,
      isCorrect: isCorrect,
      category: this.currentQuestion.category
    };

    // Save answer
    Storage.saveAnswer(answerData);
    Storage.markQuestionSeen(this.currentQuestion.id);
    this.seenQuestions.push(this.currentQuestion.id);

    return answerData;
  },

  /**
   * Get current game state and statistics
   */
  getGameState() {
    const history = Storage.loadHistory();
    const metrics = Scoring.calculateAllMetrics(history);

    return {
      history: history,
      metrics: metrics,
      questionsRemaining: this.questions.length - this.seenQuestions.length
    };
  },

  /**
   * Reset the game
   */
  reset() {
    Storage.clearHistory();
    this.seenQuestions = [];
    this.currentQuestion = null;
  }
};
