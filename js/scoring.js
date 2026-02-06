/**
 * Scoring module - calculates calibration metrics using logarithmic scoring
 */

const Scoring = {
  /**
   * Check if an answer is correct
   */
  isAnswerCorrect(userLow, userHigh, correctAnswer) {
    return correctAnswer >= userLow && correctAnswer <= userHigh;
  },

  /**
   * Calculate parameters for normal distribution from user's range and confidence
   * Returns {mean, sigma}
   */
  getNormalParams(userLow, userHigh, confidence) {
    const mean = (userLow + userHigh) / 2;
    const confidenceDecimal = confidence / 100;

    // Calculate z-score for the confidence level
    // For confidence C, we want P(userLow < X < userHigh) = C
    // This means we need the z-score where P(-z < Z < z) = C
    // So P(Z < z) = (1 + C) / 2
    const z = this.getZScore((1 + confidenceDecimal) / 2);

    // Calculate sigma such that mean ± z*sigma = [userLow, userHigh]
    const sigma = (userHigh - mean) / z;

    return {mean, sigma};
  },

  /**
   * Approximate inverse normal CDF (z-score calculation)
   * Uses rational approximation for Φ^(-1)(p)
   */
  getZScore(p) {
    if (p <= 0 || p >= 1) return 0;

    // Rational approximation coefficients (Abramowitz and Stegun)
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;

    let t, z;
    if (p < 0.5) {
      t = Math.sqrt(-2 * Math.log(p));
      z = -(t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
    } else {
      t = Math.sqrt(-2 * Math.log(1 - p));
      z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    }

    return z;
  },

  /**
   * Calculate normal distribution PDF at x
   */
  normalPDF(x, mean, sigma) {
    const coefficient = 1 / (sigma * Math.sqrt(2 * Math.PI));
    const exponent = -Math.pow(x - mean, 2) / (2 * sigma * sigma);
    return coefficient * Math.exp(exponent);
  },

  /**
   * Calculate log score for a single answer using z-score (scale-invariant)
   * Returns a log score (0 = perfect, negative = worse, where higher is better)
   * Based on log of relative likelihood: log(exp(-z²/2)) = -z²/2
   */
  calculateLogScore(userLow, userHigh, confidence, correctAnswer) {
    const rangeWidth = userHigh - userLow;

    // Prevent division by zero
    if (rangeWidth <= 0) return this.LOG_SCORE_FLOOR;

    // Get normal distribution parameters
    const {mean, sigma} = this.getNormalParams(userLow, userHigh, confidence);

    // Calculate z-score (how many standard deviations from mean)
    // This is scale-invariant - same z whether working in billions or units
    const z = (correctAnswer - mean) / sigma;

    // Log of relative likelihood: -z²/2
    // z=0 (perfect center) → 0, z=1 → -0.5, z=2 → -2, z=3 → -4.5
    return -(z * z) / 2;
  },

  /**
   * Calculate average log score across all answers
   * Individual scores are clamped to LOG_SCORE_FLOOR to prevent
   * a single extreme outlier from dominating the average.
   * Floor of -8 corresponds to z ≈ 4 (very far from mean)
   */
  LOG_SCORE_FLOOR: -8,
  EMA_ALPHA: 0.3, // 30% new value, 70% old value
  EMA_ALPHA_FIRST: 0.6, // Double gain for first sample
  PRECISION_INITIAL: 50, // Initial precision score (%)

  getAverageLogScore(history) {
    if (history.length === 0) return null;

    const totalLogScore = history.reduce((sum, answer) => {
      const raw = this.calculateLogScore(
        answer.userLow,
        answer.userHigh,
        answer.confidence,
        answer.correctAnswer
      );
      return sum + Math.max(raw, this.LOG_SCORE_FLOOR);
    }, 0);

    return totalLogScore / history.length;
  },

  /**
   * Calculate EMA (Exponential Moving Average) of precision scores
   * Returns the smoothed score using EMA filter
   */
  getCalibrationScoreEMA(history) {
    if (history.length === 0) return null;

    let ema = this.PRECISION_INITIAL;

    history.forEach((answer, index) => {
      const logScore = Math.max(
        this.calculateLogScore(
          answer.userLow,
          answer.userHigh,
          answer.confidence,
          answer.correctAnswer
        ),
        this.LOG_SCORE_FLOOR
      );
      const normalizedScore = this.normalizeLogScore(logScore);

      // Use double gain for first sample, normal gain thereafter
      const alpha = index === 0 ? this.EMA_ALPHA_FIRST : this.EMA_ALPHA;
      ema = alpha * normalizedScore + (1 - alpha) * ema;
    });

    return ema;
  },

  /**
   * Normalize log score to 0-100% range (higher is better)
   * Uses range [LOG_SCORE_FLOOR, 0] mapped to [0, 100]
   * 0 = perfect (answer at center of range), LOG_SCORE_FLOOR = worst
   */
  normalizeLogScore(logScore) {
    const floor = this.LOG_SCORE_FLOOR;
    const ceiling = 0;
    const clamped = Math.max(floor, Math.min(ceiling, logScore));

    // Map [floor, 0] to [0, 100]
    const normalized = ((clamped - floor) / (ceiling - floor)) * 100;

    return normalized;
  },

  /**
   * Calculate Calibration Score (0-100%, higher is better)
   * Based on logarithmic scoring
   */
  getCalibrationScore(history) {
    const logScore = this.getAverageLogScore(history);
    if (logScore === null) return null;

    return this.normalizeLogScore(logScore);
  },

  /**
   * Calculate actual accuracy (% correct)
   */
  getActualAccuracy(history) {
    if (history.length === 0) return null;

    const correct = history.filter(answer => answer.isCorrect).length;
    return (correct / history.length) * 100;
  },

  /**
   * Calculate average confidence across all answers
   */
  getAverageConfidence(history) {
    if (history.length === 0) return null;

    const totalConfidence = history.reduce((sum, answer) => sum + answer.confidence, 0);
    return totalConfidence / history.length;
  },

  /**
   * Calculate calibration bias
   * Positive = overconfident, Negative = underconfident
   * Range: -100 to +100
   */
  getCalibrationBias(history) {
    const avgConfidence = this.getAverageConfidence(history);
    const actualAccuracy = this.getActualAccuracy(history);

    if (avgConfidence === null || actualAccuracy === null) return null;

    return avgConfidence - actualAccuracy;
  },

  /**
   * Calculate confidence bias score for a single answer
   * Formula: Right: (confidence - 100), Wrong: confidence
   * This averages to 0 for perfectly calibrated users
   * Positive = overconfident (being too bold)
   * Negative = underconfident (playing it safe)
   */
  calculateConfidenceBiasScore(confidence, isCorrect) {
    if (isCorrect) {
      return confidence - 100;
    } else {
      return confidence;
    }
  },

  /**
   * Calculate average confidence bias score across all answers
   * Averages to 0 for perfectly calibrated users
   * Positive = overconfident, Negative = underconfident
   */
  getConfidenceBiasScore(history) {
    if (history.length === 0) return null;

    const totalScore = history.reduce((sum, answer) => {
      return sum + this.calculateConfidenceBiasScore(answer.confidence, answer.isCorrect);
    }, 0);

    return totalScore / history.length;
  },

  /**
   * Calculate EMA of confidence bias scores
   * Returns the smoothed bias using EMA filter, starting at 0
   */
  getConfidenceBiasScoreEMA(history) {
    if (history.length === 0) return null;

    let ema = 0; // Start at 0 (perfectly calibrated)

    history.forEach((answer, index) => {
      const score = this.calculateConfidenceBiasScore(answer.confidence, answer.isCorrect);
      // Use double gain for first sample, normal gain thereafter
      const alpha = index === 0 ? this.EMA_ALPHA_FIRST : this.EMA_ALPHA;
      ema = alpha * score + (1 - alpha) * ema;
    });

    return ema;
  },

  /**
   * Determine calibration status based on bias
   */
  getCalibrationStatus(bias) {
    if (bias === null) return 'No data yet';

    const absBias = Math.abs(bias);

    if (absBias < 5) return 'Well-calibrated';
    if (bias > 5) return 'Overconfident';
    if (bias < -5) return 'Underconfident';

    return 'Well-calibrated';
  },

  /**
   * Calculate all metrics at once
   * Uses EMA for precision score and confidence bias score
   */
  calculateAllMetrics(history) {
    if (history.length === 0) {
      return {
        calibrationScore: null,
        logScore: null,
        calibrationBias: null,
        confidenceBiasScore: null,
        actualAccuracy: null,
        averageConfidence: null,
        status: 'No data yet',
        totalAnswered: 0
      };
    }

    const logScore = this.getAverageLogScore(history);
    const calibrationScore = this.getCalibrationScoreEMA(history); // Use EMA
    const calibrationBias = this.getCalibrationBias(history);
    const confidenceBiasScore = this.getConfidenceBiasScoreEMA(history); // Use EMA
    const actualAccuracy = this.getActualAccuracy(history);
    const averageConfidence = this.getAverageConfidence(history);

    // Status based on confidence bias score
    // Positive = overconfident, Negative = underconfident
    let status = 'No data yet';
    if (confidenceBiasScore !== null) {
      const absBias = Math.abs(confidenceBiasScore);
      if (absBias < 5) status = 'Well-calibrated';
      else if (confidenceBiasScore > 0) status = 'Overconfident';
      else status = 'Underconfident';
    }

    return {
      calibrationScore: calibrationScore,
      logScore: logScore,
      calibrationBias: calibrationBias,
      confidenceBiasScore: confidenceBiasScore,
      actualAccuracy: actualAccuracy,
      averageConfidence: averageConfidence,
      status: status,
      totalAnswered: history.length
    };
  },

  /**
   * Get confidence bias data points for time-series chart
   * Returns both raw scores and EMA smoothed values
   * Includes a 0th point showing the initial EMA value (no scatter point)
   */
  getConfidenceBiasTimeSeriesData(history) {
    const data = [];
    let ema = 0; // Start at 0 (perfectly calibrated)

    // Add 0th point showing initial EMA value (null = no scatter point)
    data.push({
      questionNumber: 0,
      confidenceBias: null,      // No scatter point for initial value
      confidenceBiasEMA: ema,    // Starting point for trend line
      timestamp: null
    });

    history.forEach((answer, index) => {
      const rawScore = this.calculateConfidenceBiasScore(answer.confidence, answer.isCorrect);

      // Use double gain for first sample, normal gain thereafter
      const alpha = index === 0 ? this.EMA_ALPHA_FIRST : this.EMA_ALPHA;
      ema = alpha * rawScore + (1 - alpha) * ema;

      data.push({
        questionNumber: index + 1,
        confidenceBias: rawScore,      // Raw score for scatter
        confidenceBiasEMA: ema,         // Smoothed for line
        timestamp: answer.timestamp
      });
    });

    return data;
  },

  /**
   * Get data points for time-series chart (Precision Score)
   * Returns both raw scores and EMA smoothed values
   * Includes a 0th point showing the initial EMA value (no scatter point)
   */
  getTimeSeriesData(history) {
    const data = [];
    let ema = this.PRECISION_INITIAL;

    // Add 0th point showing initial EMA value (null score = no scatter point)
    data.push({
      questionNumber: 0,
      score: null,           // No scatter point for initial value
      scoreEMA: ema,         // Starting point for trend line
      timestamp: null
    });

    history.forEach((answer, index) => {
      const logScore = Math.max(
        this.calculateLogScore(
          answer.userLow,
          answer.userHigh,
          answer.confidence,
          answer.correctAnswer
        ),
        this.LOG_SCORE_FLOOR
      );
      const rawScore = this.normalizeLogScore(logScore);

      // Use double gain for first sample, normal gain thereafter
      const alpha = index === 0 ? this.EMA_ALPHA_FIRST : this.EMA_ALPHA;
      ema = alpha * rawScore + (1 - alpha) * ema;

      data.push({
        questionNumber: index + 1,
        score: rawScore,      // Raw score for scatter
        scoreEMA: ema,        // Smoothed for line
        timestamp: answer.timestamp
      });
    });

    return data;
  }
};
