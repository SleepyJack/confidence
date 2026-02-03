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
      z = -((c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
    } else {
      t = Math.sqrt(-2 * Math.log(1 - p));
      z = (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
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
   * Calculate log score for a single answer using normal distribution
   * Returns a log score (typically -10 to -0.1, where higher is better)
   */
  calculateLogScore(userLow, userHigh, confidence, correctAnswer) {
    const rangeWidth = userHigh - userLow;

    // Prevent division by zero
    if (rangeWidth <= 0) return -10; // Worst possible score

    // Get normal distribution parameters
    const {mean, sigma} = this.getNormalParams(userLow, userHigh, confidence);

    // Calculate probability density at the correct answer
    let density = this.normalPDF(correctAnswer, mean, sigma);

    // Prevent log(0) or log(negative)
    density = Math.max(density, 1e-10);

    return Math.log(density);
  },

  /**
   * Calculate average log score across all answers
   */
  getAverageLogScore(history) {
    if (history.length === 0) return null;

    const totalLogScore = history.reduce((sum, answer) => {
      return sum + this.calculateLogScore(
        answer.userLow,
        answer.userHigh,
        answer.confidence,
        answer.correctAnswer
      );
    }, 0);

    return totalLogScore / history.length;
  },

  /**
   * Normalize log score to 0-100% range (higher is better)
   * Typical log scores range from -8 (terrible) to -1 (excellent)
   * Adjusted based on realistic usage patterns
   */
  normalizeLogScore(logScore) {
    // Clamp to realistic range based on actual usage
    const clamped = Math.max(-8, Math.min(-1, logScore));

    // Map [-8, -1] to [0, 100]
    const normalized = ((clamped + 8) / 7) * 100;

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
   * Formula: Right: (100 - confidence), Wrong: -confidence
   * This averages to 0 for perfectly calibrated users
   * Positive = underconfident (playing it safe)
   * Negative = overconfident (being too bold)
   */
  calculateConfidenceBiasScore(confidence, isCorrect) {
    if (isCorrect) {
      return 100 - confidence;
    } else {
      return -confidence;
    }
  },

  /**
   * Calculate average confidence bias score across all answers
   * Averages to 0 for perfectly calibrated users
   * Positive = underconfident, Negative = overconfident
   */
  getConfidenceBiasScore(history) {
    if (history.length === 0) return null;

    const totalScore = history.reduce((sum, answer) => {
      return sum + this.calculateConfidenceBiasScore(answer.confidence, answer.isCorrect);
    }, 0);

    return totalScore / history.length;
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
    const calibrationScore = this.getCalibrationScore(history);
    const calibrationBias = this.getCalibrationBias(history);
    const confidenceBiasScore = this.getConfidenceBiasScore(history);
    const actualAccuracy = this.getActualAccuracy(history);
    const averageConfidence = this.getAverageConfidence(history);
    const status = this.getCalibrationStatus(calibrationBias);

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
   * Get data points for time-series chart (using Calibration Score)
   */
  getTimeSeriesData(history) {
    const data = [];
    let runningHistory = [];

    history.forEach((answer, index) => {
      runningHistory.push(answer);

      // Calculate calibration score at this point
      if (runningHistory.length >= 1) {
        const calibrationScore = this.getCalibrationScore(runningHistory);
        data.push({
          questionNumber: index + 1,
          score: calibrationScore,
          timestamp: answer.timestamp
        });
      }
    });

    return data;
  }
};
