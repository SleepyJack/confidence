/**
 * Distribution module - visualizes probability distributions
 */

const Distribution = {
  canvas: null,
  ctx: null,

  /**
   * Initialize with canvas element
   */
  init(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
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
   * Draw probability distribution visualization with bell curve
   */
  draw(userLow, userHigh, confidence, correctAnswer) {
    if (!this.ctx) return;

    this.clear();

    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 40;

    // Calculate normal distribution parameters
    const mean = (userLow + userHigh) / 2;
    const confidenceDecimal = confidence / 100;

    // Calculate sigma using same logic as scoring.js
    const z = Scoring.getZScore((1 + confidenceDecimal) / 2);
    const sigma = (userHigh - mean) / z;

    // Calculate display range (show ±3σ or enough to include correct answer)
    const rangeWidth = userHigh - userLow;
    const displayPadding = Math.max(rangeWidth * 0.8, sigma * 3);
    const displayMin = Math.min(mean - displayPadding, correctAnswer - 10);
    const displayMax = Math.max(mean + displayPadding, correctAnswer + 10);
    const displayRange = displayMax - displayMin;

    // Scale functions
    const xScale = (value) => {
      return padding + ((value - displayMin) / displayRange) * (width - 2 * padding);
    };

    const baselineY = height - padding - 10;
    const maxDensityHeight = baselineY - padding - 30;

    // Calculate peak density for scaling
    const peakDensity = this.normalPDF(mean, mean, sigma);
    const yScale = (density) => {
      return baselineY - (density / peakDensity) * maxDensityHeight * 0.85;
    };

    // Draw baseline
    this.ctx.strokeStyle = '#9ca3af';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(padding, baselineY);
    this.ctx.lineTo(width - padding, baselineY);
    this.ctx.stroke();

    // Draw axis labels
    this.ctx.fillStyle = '#6b7280';
    this.ctx.font = '500 11px Inter, sans-serif';
    this.ctx.textAlign = 'center';

    // Min label
    this.ctx.fillText(displayMin.toFixed(0), padding, height - padding + 15);

    // Max label
    this.ctx.fillText(displayMax.toFixed(0), width - padding, height - padding + 15);

    // Mid label
    const midValue = (displayMin + displayMax) / 2;
    this.ctx.fillText(midValue.toFixed(0), width / 2, height - padding + 15);

    // Generate points for the bell curve
    const numPoints = 200;
    const curvePoints = [];
    for (let i = 0; i <= numPoints; i++) {
      const value = displayMin + (i / numPoints) * displayRange;
      const density = this.normalPDF(value, mean, sigma);
      const x = xScale(value);
      const y = yScale(density);
      curvePoints.push({x, y, value});
    }

    // Draw shaded area under the full curve (light gray)
    const bgGradient = this.ctx.createLinearGradient(0, padding + 30, 0, baselineY);
    bgGradient.addColorStop(0, 'rgba(156, 163, 175, 0.15)');
    bgGradient.addColorStop(1, 'rgba(156, 163, 175, 0.02)');

    this.ctx.fillStyle = bgGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(curvePoints[0].x, baselineY);
    curvePoints.forEach(point => {
      this.ctx.lineTo(point.x, point.y);
    });
    this.ctx.lineTo(curvePoints[curvePoints.length - 1].x, baselineY);
    this.ctx.closePath();
    this.ctx.fill();

    // Draw shaded area within confidence bounds (colored gradient)
    const rangeX1 = xScale(userLow);
    const rangeX2 = xScale(userHigh);

    const rangeGradient = this.ctx.createLinearGradient(0, padding + 30, 0, baselineY);
    rangeGradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
    rangeGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.25)');
    rangeGradient.addColorStop(1, 'rgba(139, 92, 246, 0.1)');

    this.ctx.fillStyle = rangeGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(rangeX1, baselineY);

    // Only draw curve points within the range
    const rangePoints = curvePoints.filter(p => p.value >= userLow && p.value <= userHigh);
    if (rangePoints.length > 0) {
      rangePoints.forEach(point => {
        this.ctx.lineTo(point.x, point.y);
      });
    } else {
      // If no points in range, just draw a line at the bounds
      this.ctx.lineTo(rangeX1, yScale(this.normalPDF(userLow, mean, sigma)));
      this.ctx.lineTo(rangeX2, yScale(this.normalPDF(userHigh, mean, sigma)));
    }

    this.ctx.lineTo(rangeX2, baselineY);
    this.ctx.closePath();
    this.ctx.fill();

    // Draw the bell curve line with gradient
    const lineGradient = this.ctx.createLinearGradient(padding, 0, width - padding, 0);
    lineGradient.addColorStop(0, '#6366f1');
    lineGradient.addColorStop(0.5, '#8b5cf6');
    lineGradient.addColorStop(1, '#a855f7');

    this.ctx.strokeStyle = lineGradient;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Add subtle glow to the curve
    this.ctx.shadowColor = 'rgba(139, 92, 246, 0.3)';
    this.ctx.shadowBlur = 8;

    this.ctx.beginPath();
    curvePoints.forEach((point, i) => {
      if (i === 0) {
        this.ctx.moveTo(point.x, point.y);
      } else {
        this.ctx.lineTo(point.x, point.y);
      }
    });
    this.ctx.stroke();

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;

    // Draw vertical lines at bounds
    this.ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);

    // Left bound
    this.ctx.beginPath();
    this.ctx.moveTo(rangeX1, baselineY);
    this.ctx.lineTo(rangeX1, yScale(this.normalPDF(userLow, mean, sigma)));
    this.ctx.stroke();

    // Right bound
    this.ctx.beginPath();
    this.ctx.moveTo(rangeX2, baselineY);
    this.ctx.lineTo(rangeX2, yScale(this.normalPDF(userHigh, mean, sigma)));
    this.ctx.stroke();

    this.ctx.setLineDash([]); // Reset dash

    // Draw range bounds labels
    this.ctx.fillStyle = '#6366f1';
    this.ctx.font = '600 11px Inter, sans-serif';
    this.ctx.textAlign = 'center';

    const boundsLabelY = Math.min(
      yScale(this.normalPDF(userLow, mean, sigma)),
      yScale(this.normalPDF(userHigh, mean, sigma))
    ) - 15;

    this.ctx.fillText(userLow.toFixed(0), rangeX1, boundsLabelY);
    this.ctx.fillText(userHigh.toFixed(0), rangeX2, boundsLabelY);

    // Label for confidence area
    this.ctx.fillStyle = '#6366f1';
    this.ctx.font = '600 12px Inter, sans-serif';
    this.ctx.textAlign = 'center';
    const labelY = baselineY - maxDensityHeight * 0.4;
    this.ctx.fillText(`${confidence}% confidence interval`, (rangeX1 + rangeX2) / 2, labelY);

    // Draw correct answer marker
    const answerX = xScale(correctAnswer);
    const answerY = yScale(this.normalPDF(correctAnswer, mean, sigma));
    const isInside = correctAnswer >= userLow && correctAnswer <= userHigh;

    // Vertical line from answer to curve
    const markerColor = isInside ? '#10b981' : '#ef4444';
    this.ctx.strokeStyle = markerColor;
    this.ctx.lineWidth = 3;

    // Add glow effect
    this.ctx.shadowColor = markerColor;
    this.ctx.shadowBlur = 10;

    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 25);
    this.ctx.lineTo(answerX, baselineY);
    this.ctx.stroke();

    // Arrow head
    this.ctx.fillStyle = markerColor;
    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 25);
    this.ctx.lineTo(answerX - 7, padding + 36);
    this.ctx.lineTo(answerX + 7, padding + 36);
    this.ctx.closePath();
    this.ctx.fill();

    // Dot on the curve at the answer
    this.ctx.beginPath();
    this.ctx.arc(answerX, answerY, 6, 0, 2 * Math.PI);
    this.ctx.fill();

    // White center
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(answerX, answerY, 3, 0, 2 * Math.PI);
    this.ctx.fill();

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;

    // Label for correct answer with background
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(answerX - 45, padding + 2, 90, 18);
    this.ctx.strokeStyle = markerColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(answerX - 45, padding + 2, 90, 18);

    this.ctx.fillStyle = markerColor;
    this.ctx.font = '700 12px Inter, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('True Answer', answerX, padding + 15);

    // Additional info at bottom
    this.ctx.fillStyle = isInside ? '#059669' : '#dc2626';
    this.ctx.font = '600 11px Inter, sans-serif';
    this.ctx.textAlign = 'left';

    const infoText = isInside
      ? '✓ Answer captured! Narrower ranges (taller peaks) score better.'
      : '✗ Answer missed! The farther from the peak, the larger the penalty.';

    this.ctx.fillText(infoText, padding, height - 6);
  },

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
