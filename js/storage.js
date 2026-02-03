/**
 * Storage module - handles localStorage operations
 */

const Storage = {
  KEYS: {
    HISTORY: 'confidence_game_history',
    SEEN_QUESTIONS: 'confidence_game_seen_questions'
  },

  /**
   * Save a new answer to history
   */
  saveAnswer(answer) {
    const history = this.loadHistory();
    history.push({
      ...answer,
      timestamp: Date.now()
    });
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
  },

  /**
   * Load all answer history
   */
  loadHistory() {
    const data = localStorage.getItem(this.KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  },

  /**
   * Clear all history (for testing or reset)
   */
  clearHistory() {
    localStorage.removeItem(this.KEYS.HISTORY);
    localStorage.removeItem(this.KEYS.SEEN_QUESTIONS);
  },

  /**
   * Clear only the seen-questions list (keeps answer history)
   */
  clearSeenQuestions() {
    localStorage.removeItem(this.KEYS.SEEN_QUESTIONS);
  },

  /**
   * Mark a question as seen
   */
  markQuestionSeen(questionId) {
    const seen = this.getSeenQuestions();
    if (!seen.includes(questionId)) {
      seen.push(questionId);
      localStorage.setItem(this.KEYS.SEEN_QUESTIONS, JSON.stringify(seen));
    }
  },

  /**
   * Get list of seen question IDs
   */
  getSeenQuestions() {
    const data = localStorage.getItem(this.KEYS.SEEN_QUESTIONS);
    return data ? JSON.parse(data) : [];
  },

  /**
   * Get statistics for display
   */
  getStats() {
    const history = this.loadHistory();
    return {
      totalAnswered: history.length,
      history: history
    };
  }
};
