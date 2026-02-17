/**
 * UI module - handles DOM manipulation and rendering
 */

const UI = {
  elements: {},
  currentAnswer: null,
  isLoading: false,

  /**
   * Initialize UI elements
   */
  init() {
    this.elements = {
      // Question view
      questionText: document.getElementById('question-text'),
      questionCategory: document.getElementById('question-category'),
      questionCreator: document.getElementById('question-creator'),
      questionContainer: document.getElementById('question-container'),
      // Feedback view
      feedbackQuestionText: document.getElementById('feedback-question-text'),
      feedbackCategory: document.getElementById('feedback-category'),
      feedbackCreator: document.getElementById('feedback-creator'),
      feedbackSource: document.getElementById('feedback-source'),
      feedbackContainer: document.getElementById('feedback-container'),
      feedbackText: document.getElementById('feedback-text'),
      correctAnswer: document.getElementById('correct-answer'),
      questionScore: document.getElementById('question-score'),
      // Loading view
      loadingContainer: document.getElementById('loading-container'),
      loadingStatus: document.getElementById('loading-status'),
      loadingDetail: document.getElementById('loading-detail'),
      // Error view
      errorContainer: document.getElementById('error-container'),
      errorMessage: document.getElementById('error-message'),
      errorDetail: document.getElementById('error-detail'),
      retryBtn: document.getElementById('retry-btn'),
      // Inputs
      lowInput: document.getElementById('low-input'),
      highInput: document.getElementById('high-input'),
      confidenceSlider: document.getElementById('confidence-slider'),
      confidenceValue: document.getElementById('confidence-value'),
      submitBtn: document.getElementById('submit-btn'),
      nextBtn: document.getElementById('next-btn'),
      validationMessage: document.getElementById('validation-message'),
      distributionCanvas: document.getElementById('distribution-canvas'),
      // Stats
      statsTotalLabel: document.getElementById('stats-total-label'),
      statsScore: document.getElementById('stats-score'),
      statsConfidenceBias: document.getElementById('stats-confidence-bias'),
      statsConfidenceStatus: document.getElementById('stats-confidence-status'),
      chartCanvas: document.getElementById('chart-canvas'),
      confidenceBiasChartCanvas: document.getElementById('confidence-bias-chart-canvas'),
      // Modal
      welcomeModal: document.getElementById('welcome-modal'),
      startBtn: document.getElementById('start-btn'),
      welcomeAuthBtn: document.getElementById('welcome-auth-btn'),
      resetBtn: document.getElementById('reset-btn')
    };

    this.attachEventListeners();
    Chart.init(this.elements.chartCanvas, this.elements.confidenceBiasChartCanvas);
    Distribution.init(this.elements.distributionCanvas);

    // Show welcome modal on first visit, otherwise resume game
    if (Storage.loadHistory().length === 0) {
      this.showWelcome();
    } else {
      // Resume existing session - load next question and show stats
      this.loadNewQuestion();
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

    // Start button (continue as guest)
    this.elements.startBtn.addEventListener('click', () => this.handleStart());

    // Welcome auth button (sign up / log in from welcome screen)
    if (this.elements.welcomeAuthBtn) {
      this.elements.welcomeAuthBtn.addEventListener('click', () => {
        this.elements.welcomeModal.classList.remove('active');
        AuthUI.showModal('signup');
      });
    }

    // Reset button
    this.elements.resetBtn.addEventListener('click', () => this.handleReset());

    // Retry button
    this.elements.retryBtn.addEventListener('click', () => this.loadNewQuestion());

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
  async handleStart() {
    this.elements.startBtn.disabled = true;
    this.elements.welcomeModal.classList.remove('active');
    await this.loadNewQuestion();
    this.elements.startBtn.disabled = false;
  },

  /**
   * Hide all game area containers
   */
  hideAllContainers() {
    this.elements.questionContainer.classList.remove('active');
    this.elements.feedbackContainer.classList.remove('active');
    this.elements.loadingContainer.classList.remove('active');
    this.elements.errorContainer.classList.remove('active');
  },

  /**
   * Show loading state with status message
   */
  showLoading(status = 'Generating your question', detail = '') {
    this.hideAllContainers();
    this.elements.loadingStatus.textContent = status;
    this.elements.loadingDetail.textContent = detail;
    this.elements.loadingContainer.classList.add('active');
    this.elements.nextBtn.disabled = true;
  },

  /**
   * Update loading status message
   */
  updateLoadingStatus(status, detail = '') {
    this.elements.loadingStatus.textContent = status;
    this.elements.loadingDetail.textContent = detail;
  },

  /**
   * Show error state with message
   */
  showError(message = 'Unable to generate question', detail = '') {
    this.hideAllContainers();
    this.elements.errorMessage.textContent = message;
    this.elements.errorDetail.textContent = detail;
    this.elements.errorContainer.classList.add('active');
    this.elements.nextBtn.disabled = false;
  },

  /**
   * Load and display a new question
   */
  async loadNewQuestion() {
    // Prevent concurrent loads
    if (this.isLoading) return;
    this.isLoading = true;

    // Show loading state
    this.showLoading('Generating your question');

    try {
      const result = await Game.getNextQuestion();
      if (!result || !result.question) {
        this.showError('No question available', 'The question pool may be empty');
        return;
      }

      const { question, usedFallback, fallbackReason } = result;

      // Log fallback usage for debugging
      if (usedFallback) {
        console.log('Used fallback question source:', fallbackReason);
      }

      // Hide loading, prepare question view
      this.hideAllContainers();

      this.elements.questionText.textContent = question.question;

      // Update category eyebrow
      if (this.elements.questionCategory) {
        this.elements.questionCategory.textContent = question.category || 'Question';
      }

      // Update creator (source is shown only after submission)
      if (this.elements.questionCreator) {
        this.elements.questionCreator.textContent = question.creator || 'unknown';
      }

      // Reset inputs
      this.elements.lowInput.value = '';
      this.elements.highInput.value = '';
      this.elements.confidenceSlider.value = 80;
      this.elements.confidenceValue.textContent = '80%';

      // Show question container
      this.hideValidation();
      this.elements.questionContainer.classList.add('active');
      this.elements.submitBtn.disabled = false;

      // Focus on first input
      this.elements.lowInput.focus();

      // Update stats
      this.updateStats();
    } catch (error) {
      console.error('Failed to load question:', error);
      this.showError(
        'Failed to generate question',
        error.message || 'An unexpected error occurred'
      );
    } finally {
      this.isLoading = false;
      this.elements.nextBtn.disabled = false;
    }
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

    const q = Game.currentQuestion;

    // Populate question info in feedback view (with source revealed)
    this.elements.feedbackQuestionText.textContent = q.question;
    this.elements.feedbackCategory.textContent = q.category || 'Question';
    this.elements.feedbackCreator.textContent = q.creator || 'unknown';
    if (q.sourceName && q.sourceUrl) {
      this.elements.feedbackSource.textContent = q.sourceName;
      this.elements.feedbackSource.href = q.sourceUrl;
    } else {
      this.elements.feedbackSource.textContent = 'unknown';
      this.elements.feedbackSource.removeAttribute('href');
    }

    // Hide all containers, show feedback
    this.hideAllContainers();
    this.elements.feedbackContainer.classList.add('active');

    // Display result
    const isCorrect = this.currentAnswer.isCorrect;
    this.elements.feedbackText.innerHTML = isCorrect
      ? '<strong>Correct</strong> — The answer was within your range.'
      : '<strong>Incorrect</strong> — The answer was outside your range.';

    this.elements.feedbackText.className = 'feedback-message ' + (isCorrect ? 'correct' : 'incorrect');

    // Show correct answer
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

    this.elements.questionScore.textContent = `Precision: ${normalizedScore.toFixed(1)}%`;

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
  async handleNext() {
    await this.loadNewQuestion();
  },

  /**
   * Update statistics display
   */
  updateStats() {
    const state = Game.getGameState();
    const m = state.metrics;

    // Total questions
    if (this.elements.statsTotalLabel) {
      this.elements.statsTotalLabel.textContent = m.totalAnswered + ' answered';
    }

    // Display metrics
    if (m.calibrationScore !== null) {
      // Precision Score (headline metric)
      this.elements.statsScore.textContent = m.calibrationScore.toFixed(1) + '%';

      // Over/Under Confidence Score
      const confBiasSign = m.confidenceBiasScore >= 0 ? '+' : '';
      this.elements.statsConfidenceBias.textContent = confBiasSign + m.confidenceBiasScore.toFixed(1);

      // Status for confidence bias
      let confBiasStatus = '';
      const absConfBias = Math.abs(m.confidenceBiasScore);
      if (absConfBias < 5) {
        confBiasStatus = 'Well-calibrated';
        this.elements.statsConfidenceStatus.className = 'metric-status status-good';
        this.elements.statsConfidenceBias.className = 'metric-value-medium bias-good';
      } else if (m.confidenceBiasScore > 0) {
        confBiasStatus = 'Overconfident';
        this.elements.statsConfidenceStatus.className = 'metric-status status-overconfident';
        this.elements.statsConfidenceBias.className = 'metric-value-medium bias-overconfident';
      } else {
        confBiasStatus = 'Underconfident';
        this.elements.statsConfidenceStatus.className = 'metric-status status-underconfident';
        this.elements.statsConfidenceBias.className = 'metric-value-medium bias-underconfident';
      }
      this.elements.statsConfidenceStatus.textContent = confBiasStatus;

      // Update chart
      Chart.draw(state.history);
    } else {
      this.elements.statsScore.textContent = '\u2014';
      this.elements.statsConfidenceBias.textContent = '\u2014';
      this.elements.statsConfidenceBias.className = 'metric-value-medium';
      this.elements.statsConfidenceStatus.textContent = 'No data yet';
      this.elements.statsConfidenceStatus.className = 'metric-status';
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
  }
};
