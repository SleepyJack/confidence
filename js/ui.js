/**
 * UI module - handles DOM manipulation and rendering
 */

const UI = {
  elements: {},
  currentAnswer: null,

  /**
   * Initialize UI elements
   */
  init() {
    this.elements = {
      questionText: document.getElementById('question-text'),
      questionCategory: document.getElementById('question-category'),
      lowInput: document.getElementById('low-input'),
      highInput: document.getElementById('high-input'),
      confidenceSlider: document.getElementById('confidence-slider'),
      confidenceValue: document.getElementById('confidence-value'),
      submitBtn: document.getElementById('submit-btn'),
      nextBtn: document.getElementById('next-btn'),
      questionContainer: document.getElementById('question-container'),
      feedbackContainer: document.getElementById('feedback-container'),
      feedbackText: document.getElementById('feedback-text'),
      correctAnswer: document.getElementById('correct-answer'),
      questionScore: document.getElementById('question-score'),
      validationMessage: document.getElementById('validation-message'),
      distributionCanvas: document.getElementById('distribution-canvas'),
      statsTotal: document.getElementById('stats-total'),
      statsTotalLabel: document.getElementById('stats-total-label'),
      statsScore: document.getElementById('stats-score'),
      statsBias: document.getElementById('stats-bias'),
      statsStatus: document.getElementById('stats-status'),
      statsAccuracy: document.getElementById('stats-accuracy'),
      statsAvgConfidence: document.getElementById('stats-avg-confidence'),
      chartCanvas: document.getElementById('chart-canvas'),
      welcomeModal: document.getElementById('welcome-modal'),
      startBtn: document.getElementById('start-btn'),
      resetBtn: document.getElementById('reset-btn')
    };

    this.attachEventListeners();
    Chart.init(this.elements.chartCanvas);
    Distribution.init(this.elements.distributionCanvas);

    // Show welcome modal on first visit
    if (Storage.loadHistory().length === 0) {
      this.showWelcome();
    }
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Confidence slider
    this.elements.confidenceSlider.addEventListener('input', (e) => {
      this.elements.confidenceValue.textContent = e.target.value + '%';
    });

    // Submit button
    this.elements.submitBtn.addEventListener('click', () => this.handleSubmit());

    // Next button
    this.elements.nextBtn.addEventListener('click', () => this.handleNext());

    // Start button
    this.elements.startBtn.addEventListener('click', () => this.handleStart());

    // Reset button
    this.elements.resetBtn.addEventListener('click', () => this.handleReset());

    // Enter key in inputs
    [this.elements.lowInput, this.elements.highInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleSubmit();
      });
    });
  },

  /**
   * Show welcome modal
   */
  showWelcome() {
    this.elements.welcomeModal.classList.add('active');
  },

  /**
   * Hide welcome modal and start game
   */
  handleStart() {
    this.elements.welcomeModal.classList.remove('active');
    this.loadNewQuestion();
  },

  /**
   * Load and display a new question
   */
  loadNewQuestion() {
    const question = Game.getNextQuestion();
    if (!question) {
      this.showError('Failed to load questions');
      return;
    }

    this.elements.questionText.textContent = question.question;

    // Update category eyebrow
    if (this.elements.questionCategory) {
      this.elements.questionCategory.textContent = question.category || 'Question';
    }

    // Reset inputs
    this.elements.lowInput.value = '';
    this.elements.highInput.value = '';
    this.elements.confidenceSlider.value = 80;
    this.elements.confidenceValue.textContent = '80%';

    // Show question, hide feedback
    this.hideValidation();
    this.elements.questionContainer.classList.add('active');
    this.elements.feedbackContainer.classList.remove('active');
    this.elements.submitBtn.disabled = false;

    // Focus on first input
    this.elements.lowInput.focus();

    // Update stats
    this.updateStats();
  },

  /**
   * Show inline validation error
   */
  showValidation(message) {
    const el = this.elements.validationMessage;
    el.textContent = message;
    el.classList.remove('visible', 'shake');
    // Force reflow so re-adding classes restarts animations
    void el.offsetWidth;
    el.classList.add('visible', 'shake');

    // Auto-hide after a few seconds
    clearTimeout(this._validationTimer);
    this._validationTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 4000);
  },

  /**
   * Hide inline validation error
   */
  hideValidation() {
    this.elements.validationMessage.classList.remove('visible');
    clearTimeout(this._validationTimer);
  },

  /**
   * Handle answer submission
   */
  handleSubmit() {
    const low = parseFloat(this.elements.lowInput.value);
    const high = parseFloat(this.elements.highInput.value);
    const confidence = parseFloat(this.elements.confidenceSlider.value);

    // Validate inputs
    if (isNaN(low) || isNaN(high)) {
      this.showValidation('Enter a number for both bounds');
      return;
    }

    if (low >= high) {
      this.showValidation('Low bound must be less than high bound');
      return;
    }

    this.hideValidation();

    // Submit answer
    this.currentAnswer = Game.submitAnswer(low, high, confidence);

    // Show feedback
    this.showFeedback();
  },

  /**
   * Show feedback after answer submission
   */
  showFeedback() {
    if (!this.currentAnswer) return;

    // Hide question, show feedback
    this.elements.questionContainer.classList.remove('active');
    this.elements.feedbackContainer.classList.add('active');

    // Display result
    const isCorrect = this.currentAnswer.isCorrect;
    this.elements.feedbackText.innerHTML = isCorrect
      ? '<strong>Correct</strong> — The answer was within your range.'
      : '<strong>Incorrect</strong> — The answer was outside your range.';

    this.elements.feedbackText.className = 'feedback-message ' + (isCorrect ? 'correct' : 'incorrect');

    // Show correct answer
    const q = Game.currentQuestion;
    this.elements.correctAnswer.textContent =
      `The correct answer is: ${q.answer} ${q.unit}`;

    // Calculate and show score for this question
    const logScore = Scoring.calculateLogScore(
      this.currentAnswer.userLow,
      this.currentAnswer.userHigh,
      this.currentAnswer.confidence,
      this.currentAnswer.correctAnswer
    );
    const normalizedScore = Scoring.normalizeLogScore(logScore);

    this.elements.questionScore.textContent =
      `Score: ${normalizedScore.toFixed(1)}%  (log score: ${logScore.toFixed(2)})`;

    // Draw probability distribution visualization
    Distribution.draw(
      this.currentAnswer.userLow,
      this.currentAnswer.userHigh,
      this.currentAnswer.confidence,
      this.currentAnswer.correctAnswer
    );

    // Update stats
    this.updateStats();
  },

  /**
   * Handle next question button
   */
  handleNext() {
    this.loadNewQuestion();
  },

  /**
   * Update statistics display
   */
  updateStats() {
    const state = Game.getGameState();
    const m = state.metrics;

    // Total questions
    this.elements.statsTotal.textContent = m.totalAnswered;
    if (this.elements.statsTotalLabel) {
      this.elements.statsTotalLabel.textContent = m.totalAnswered + ' answered';
    }

    // Display metrics
    if (m.calibrationScore !== null) {
      // Calibration Score (headline metric)
      this.elements.statsScore.textContent = m.calibrationScore.toFixed(1) + '%';

      // Calibration Bias (over/under confident)
      const biasSign = m.calibrationBias >= 0 ? '+' : '';
      this.elements.statsBias.textContent = biasSign + m.calibrationBias.toFixed(1) + '%';

      // Status (based on bias)
      this.elements.statsStatus.textContent = m.status;

      // Status color based on bias
      const absBias = Math.abs(m.calibrationBias);
      if (absBias < 5) {
        this.elements.statsStatus.className = 'metric-status status-good';
        this.elements.statsBias.className = 'metric-value-medium bias-good';
      } else if (m.calibrationBias > 0) {
        this.elements.statsStatus.className = 'metric-status status-overconfident';
        this.elements.statsBias.className = 'metric-value-medium bias-overconfident';
      } else {
        this.elements.statsStatus.className = 'metric-status status-underconfident';
        this.elements.statsBias.className = 'metric-value-medium bias-underconfident';
      }

      // Secondary metrics (accuracy and avg confidence)
      this.elements.statsAccuracy.textContent = m.actualAccuracy.toFixed(0) + '%';
      this.elements.statsAvgConfidence.textContent = m.averageConfidence.toFixed(0) + '%';

      // Update chart
      Chart.draw(state.history);
    } else {
      this.elements.statsScore.textContent = '\u2014';
      this.elements.statsBias.textContent = '\u2014';
      this.elements.statsBias.className = 'metric-value-medium';
      this.elements.statsStatus.textContent = 'No data yet';
      this.elements.statsStatus.className = 'metric-status';
      this.elements.statsAccuracy.textContent = '\u2014';
      this.elements.statsAvgConfidence.textContent = '\u2014';
      Chart.drawEmpty();
    }
  },

  /**
   * Handle game reset
   */
  handleReset() {
    if (confirm('This will clear all your progress. Are you sure?')) {
      Game.reset();
      this.updateStats();
      this.showWelcome();
    }
  },

  /**
   * Show error message
   */
  showError(message) {
    alert('Error: ' + message);
  }
};
