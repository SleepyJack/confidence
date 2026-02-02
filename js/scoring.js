/**
 * Scoring module - calculates calibration metrics
 */

const Scoring = {
  /**
   * Check if an answer is correct
   */
  isAnswerCorrect(userLow, userHigh, correctAnswer) {
    return correctAnswer >= userLow && correctAnswer <= userHigh;
  },

  /**
   * Round confidence to nearest bucket (5% increments)
   */
  roundConfidence(confidence) {
    return Math.round(confidence / 5) * 5;
  },

  /**
   * Calculate calibration by confidence level
   */
  getCalibrationByConfidenceLevel(history) {
    const buckets = {};

    history.forEach(answer => {
      const bucket = this.roundConfidence(answer.confidence);
      if (!buckets[bucket]) {
        buckets[bucket] = { correct: 0, total: 0 };
      }
      buckets[bucket].total++;
      if (answer.isCorrect) {
        buckets[bucket].correct++;
      }
    });

    // Convert to array with calibration error
    const result = [];
    for (const [confidence, data] of Object.entries(buckets)) {
      const expectedAccuracy = parseFloat(confidence);
      const actualAccuracy = (data.correct / data.total) * 100;
      const calibrationError = Math.abs(expectedAccuracy - actualAccuracy);

      result.push({
        confidence: parseFloat(confidence),
        expected: expectedAccuracy,
        actual: actualAccuracy,
        correct: data.correct,
        total: data.total,
        error: calibrationError
      });
    }

    return result.sort((a, b) => a.confidence - b.confidence);
  },

  /**
   * Calculate overall calibration score
   */
  calculateOverallCalibration(history) {
    if (history.length === 0) return null;

    const byLevel = this.getCalibrationByConfidenceLevel(history);

    // Weighted average of calibration errors
    let totalError = 0;
    let totalWeight = 0;

    byLevel.forEach(level => {
      totalError += level.error * level.total;
      totalWeight += level.total;
    });

    return {
      score: totalWeight > 0 ? totalError / totalWeight : 0,
      byLevel: byLevel,
      totalAnswered: history.length
    };
  },

  /**
   * Get recent calibration (last N answers or time-weighted)
   */
  getRecentCalibration(history, windowSize = 20) {
    if (history.length === 0) return null;

    const recent = history.slice(-windowSize);
    return this.calculateOverallCalibration(recent);
  },

  /**
   * Determine if user is over/under/well-calibrated
   */
  getCalibrationStatus(calibration) {
    if (!calibration) return 'No data yet';

    const score = calibration.score;

    if (score < 10) return 'Well-calibrated';

    // Check if generally over or under confident
    let totalBias = 0;
    calibration.byLevel.forEach(level => {
      totalBias += (level.expected - level.actual);
    });

    const avgBias = totalBias / calibration.byLevel.length;

    if (avgBias > 5) return 'Overconfident';
    if (avgBias < -5) return 'Underconfident';
    return 'Moderately calibrated';
  },

  /**
   * Get data points for time-series chart
   */
  getTimeSeriesData(history) {
    const data = [];
    let runningHistory = [];

    history.forEach((answer, index) => {
      runningHistory.push(answer);

      // Calculate calibration at this point
      if (runningHistory.length >= 3) { // Need at least 3 answers
        const calibration = this.calculateOverallCalibration(runningHistory);
        data.push({
          questionNumber: index + 1,
          score: calibration.score,
          timestamp: answer.timestamp
        });
      }
    });

    return data;
  }
};
