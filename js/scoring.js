/**
 * Scoring module - calculates calibration metrics using Brier score
 */

const Scoring = {
  /**
   * Check if an answer is correct
   */
  isAnswerCorrect(userLow, userHigh, correctAnswer) {
    return correctAnswer >= userLow && correctAnswer <= userHigh;
  },

  /**
   * Calculate Brier score for a single answer
   * Returns a value between 0 (perfect) and 1 (worst)
   */
  calculateBrierScore(confidence, isCorrect) {
    const confidenceDecimal = confidence / 100;
    const outcome = isCorrect ? 1 : 0;
    return Math.pow(confidenceDecimal - outcome, 2);
  },

  /**
   * Calculate average Brier score across all answers
   */
  getAverageBrierScore(history) {
    if (history.length === 0) return null;

    const totalBrier = history.reduce((sum, answer) => {
      return sum + this.calculateBrierScore(answer.confidence, answer.isCorrect);
    }, 0);

    return totalBrier / history.length;
  },

  /**
   * Calculate Calibration Score (0-100%, higher is better)
   * This is (1 - Brier) * 100
   */
  getCalibrationScore(history) {
    const brierScore = this.getAverageBrierScore(history);
    if (brierScore === null) return null;

    return (1 - brierScore) * 100;
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
        brierScore: null,
        calibrationBias: null,
        actualAccuracy: null,
        averageConfidence: null,
        status: 'No data yet',
        totalAnswered: 0
      };
    }

    const brierScore = this.getAverageBrierScore(history);
    const calibrationScore = this.getCalibrationScore(history);
    const calibrationBias = this.getCalibrationBias(history);
    const actualAccuracy = this.getActualAccuracy(history);
    const averageConfidence = this.getAverageConfidence(history);
    const status = this.getCalibrationStatus(calibrationBias);

    return {
      calibrationScore: calibrationScore,
      brierScore: brierScore,
      calibrationBias: calibrationBias,
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
