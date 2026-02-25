/**
 * Game module - manages game state and logic
 */

const Game = {
  currentQuestion: null,
  seenQuestions: [],

  /**
   * Initialize the game
   */
  init() {
    this.seenQuestions = Storage.getSeenQuestions();
  },

  /**
   * Fetch the next question from the API.
   * Sends seen IDs so the server can avoid repeats.
   * @returns {Promise<{question: object, usedFallback?: boolean, fallbackReason?: string}>}
   */
  async getNextQuestion() {
    const params = this.seenQuestions.length > 0
      ? '?seen=' + this.seenQuestions.join(',')
      : '';
    const response = await fetch('/api/next-question' + params);
    const data = await response.json();

    if (!response.ok) {
      // Build detailed error message from API response
      let errorMsg = data.error || `API returned ${response.status}`;
      if (data.primaryError) {
        errorMsg = data.primaryError;
      }
      throw new Error(errorMsg);
    }

    // Server signals pool exhaustion — clear seen list for next round
    if (data.poolReset) {
      this.seenQuestions = [];
      Storage.clearSeenQuestions();
    }

    this.currentQuestion = data.question;

    // Return question with metadata
    return {
      question: this.currentQuestion,
      usedFallback: data.usedFallback || false,
      fallbackReason: data.fallbackReason
    };
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

    // Always save to localStorage (fallback / anonymous)
    Storage.saveAnswer(answerData);
    Storage.markQuestionSeen(this.currentQuestion.id);
    this.seenQuestions.push(this.currentQuestion.id);

    // Save to server (fire-and-forget)
    if (Auth.isLoggedIn()) {
      Auth.saveResponse(answerData).catch(function () {});
    } else {
      // Guest: save anonymous stats
      var score = Scoring.normalizeLogScore(
        Math.max(
          Scoring.calculateLogScore(
            answerData.userLow, answerData.userHigh,
            answerData.confidence, answerData.correctAnswer
          ),
          Scoring.LOG_SCORE_FLOOR
        )
      );
      fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: answerData.questionId,
          score: score,
          confidence: answerData.confidence
        })
      }).catch(function () {});
    }

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
      metrics: metrics
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
