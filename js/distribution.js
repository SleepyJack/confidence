/**
 * Distribution module - visualizes probability distributions
 * Dark theme variant
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
   * Resize canvas buffer to match display size for sharp rendering
   */
  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    // Return CSS dimensions for drawing calculations
    return { width: rect.width, height: rect.height };
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

    const dims = this.resizeCanvas();
    const width = dims.width;
    const height = dims.height;
    const padding = 40;

    // Calculate normal distribution parameters
    const mean = (userLow + userHigh) / 2;
    const confidenceDecimal = confidence / 100;

    // Calculate sigma using same logic as scoring.js
    const z = Scoring.getZScore((1 + confidenceDecimal) / 2);
    const sigma = (userHigh - mean) / z;

    // Calculate display range (show +/-3sigma or enough to include correct answer)
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
    this.ctx.strokeStyle = '#3a3835';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(padding, baselineY);
    this.ctx.lineTo(width - padding, baselineY);
    this.ctx.stroke();

    // Draw axis labels
    this.ctx.fillStyle = '#5c5955';
    this.ctx.font = '500 10px JetBrains Mono, monospace';
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

    // Draw shaded area under the full curve
    const bgGradient = this.ctx.createLinearGradient(0, padding + 30, 0, baselineY);
    bgGradient.addColorStop(0, 'rgba(92, 89, 85, 0.12)');
    bgGradient.addColorStop(1, 'rgba(92, 89, 85, 0.02)');

    this.ctx.fillStyle = bgGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(curvePoints[0].x, baselineY);
    curvePoints.forEach(point => {
      this.ctx.lineTo(point.x, point.y);
    });
    this.ctx.lineTo(curvePoints[curvePoints.length - 1].x, baselineY);
    this.ctx.closePath();
    this.ctx.fill();

    // Draw shaded area within confidence bounds
    const rangeX1 = xScale(userLow);
    const rangeX2 = xScale(userHigh);

    const rangeGradient = this.ctx.createLinearGradient(0, padding + 30, 0, baselineY);
    rangeGradient.addColorStop(0, 'rgba(226, 168, 75, 0.3)');
    rangeGradient.addColorStop(0.5, 'rgba(226, 168, 75, 0.18)');
    rangeGradient.addColorStop(1, 'rgba(226, 168, 75, 0.06)');

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
      this.ctx.lineTo(rangeX1, yScale(this.normalPDF(userLow, mean, sigma)));
      this.ctx.lineTo(rangeX2, yScale(this.normalPDF(userHigh, mean, sigma)));
    }

    this.ctx.lineTo(rangeX2, baselineY);
    this.ctx.closePath();
    this.ctx.fill();

    // Draw the bell curve line
    this.ctx.strokeStyle = '#e2a84b';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Subtle glow
    this.ctx.shadowColor = 'rgba(226, 168, 75, 0.25)';
    this.ctx.shadowBlur = 6;

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
    this.ctx.strokeStyle = 'rgba(226, 168, 75, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);

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

    this.ctx.setLineDash([]);

    // Draw range bounds labels
    this.ctx.fillStyle = '#e2a84b';
    this.ctx.font = '600 10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';

    const boundsLabelY = Math.min(
      yScale(this.normalPDF(userLow, mean, sigma)),
      yScale(this.normalPDF(userHigh, mean, sigma))
    ) - 14;

    this.ctx.fillText(userLow.toFixed(0), rangeX1, boundsLabelY);
    this.ctx.fillText(userHigh.toFixed(0), rangeX2, boundsLabelY);

    // Label for confidence area
    this.ctx.fillStyle = 'rgba(226, 168, 75, 0.7)';
    this.ctx.font = '500 11px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';
    const labelY = baselineY - maxDensityHeight * 0.4;
    this.ctx.fillText(confidence + '% confidence', (rangeX1 + rangeX2) / 2, labelY);

    // Draw correct answer marker
    const answerX = xScale(correctAnswer);
    const answerY = yScale(this.normalPDF(correctAnswer, mean, sigma));
    const isInside = correctAnswer >= userLow && correctAnswer <= userHigh;

    const markerColor = isInside ? '#4ade80' : '#f87171';

    // Vertical line from answer to curve
    this.ctx.strokeStyle = markerColor;
    this.ctx.lineWidth = 2;

    // Glow effect
    this.ctx.shadowColor = markerColor;
    this.ctx.shadowBlur = 8;

    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 25);
    this.ctx.lineTo(answerX, baselineY);
    this.ctx.stroke();

    // Arrow head
    this.ctx.fillStyle = markerColor;
    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 25);
    this.ctx.lineTo(answerX - 6, padding + 34);
    this.ctx.lineTo(answerX + 6, padding + 34);
    this.ctx.closePath();
    this.ctx.fill();

    // Dot on the curve at the answer
    this.ctx.beginPath();
    this.ctx.arc(answerX, answerY, 5, 0, 2 * Math.PI);
    this.ctx.fill();

    // Dark center
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = '#1e2028';
    this.ctx.beginPath();
    this.ctx.arc(answerX, answerY, 2.5, 0, 2 * Math.PI);
    this.ctx.fill();

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;

    // Label for correct answer with dark background
    this.ctx.fillStyle = '#1e2028';
    this.ctx.fillRect(answerX - 42, padding + 2, 84, 18);
    this.ctx.strokeStyle = markerColor;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(answerX - 42, padding + 2, 84, 18);

    this.ctx.fillStyle = markerColor;
    this.ctx.font = '600 10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('True Answer', answerX, padding + 14);

    // Additional info at bottom
    this.ctx.fillStyle = isInside ? '#4ade80' : '#f87171';
    this.ctx.font = '500 10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'left';

    const infoText = isInside
      ? 'Captured — narrower ranges score better'
      : 'Missed — farther from peak = larger penalty';

    this.ctx.fillText(infoText, padding, height - 6);
  },

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
