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
      statsTotal: document.getElementById('stats-total'),
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

    // Reset inputs
    this.elements.lowInput.value = '';
    this.elements.highInput.value = '';
    this.elements.confidenceSlider.value = 80;
    this.elements.confidenceValue.textContent = '80%';

    // Show question, hide feedback
    this.elements.questionContainer.classList.add('active');
    this.elements.feedbackContainer.classList.remove('active');
    this.elements.submitBtn.disabled = false;

    // Focus on first input
    this.elements.lowInput.focus();

    // Update stats
    this.updateStats();
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
      alert('Please enter valid numbers for both bounds');
      return;
    }

    if (low >= high) {
      alert('Low bound must be less than high bound');
      return;
    }

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
      ? '✓ <strong>Correct!</strong> The answer was within your range.'
      : '✗ <strong>Incorrect.</strong> The answer was outside your range.';

    this.elements.feedbackText.className = isCorrect ? 'correct' : 'incorrect';

    // Show correct answer
    const q = Game.currentQuestion;
    this.elements.correctAnswer.textContent =
      `The correct answer is: ${q.answer} ${q.unit}`;

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
        this.elements.statsStatus.className = 'status-good';
        this.elements.statsBias.className = 'bias-good';
      } else if (m.calibrationBias > 0) {
        this.elements.statsStatus.className = 'status-overconfident';
        this.elements.statsBias.className = 'bias-overconfident';
      } else {
        this.elements.statsStatus.className = 'status-underconfident';
        this.elements.statsBias.className = 'bias-underconfident';
      }

      // Secondary metrics (accuracy and avg confidence)
      this.elements.statsAccuracy.textContent = m.actualAccuracy.toFixed(0) + '%';
      this.elements.statsAvgConfidence.textContent = m.averageConfidence.toFixed(0) + '%';

      // Update chart
      Chart.draw(state.history);
    } else {
      this.elements.statsScore.textContent = '-';
      this.elements.statsBias.textContent = '-';
      this.elements.statsStatus.textContent = 'No data yet';
      this.elements.statsStatus.className = '';
      this.elements.statsBias.className = '';
      this.elements.statsAccuracy.textContent = '-';
      this.elements.statsAvgConfidence.textContent = '-';
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
