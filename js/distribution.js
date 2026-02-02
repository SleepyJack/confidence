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
   * Draw probability distribution visualization
   */
  draw(userLow, userHigh, confidence, correctAnswer) {
    if (!this.ctx) return;

    this.clear();

    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 40;

    // Calculate display range (with some padding around the data)
    const rangeWidth = userHigh - userLow;
    const displayPadding = Math.max(rangeWidth * 0.5, 10);
    const displayMin = Math.min(userLow, correctAnswer) - displayPadding;
    const displayMax = Math.max(userHigh, correctAnswer) + displayPadding;
    const displayRange = displayMax - displayMin;

    // Scale functions
    const xScale = (value) => {
      return padding + ((value - displayMin) / displayRange) * (width - 2 * padding);
    };

    const maxDensityHeight = height - 2 * padding - 30;

    // Calculate density (probability per unit)
    const confidenceDecimal = confidence / 100;
    const density = confidenceDecimal / rangeWidth;

    // Normalize density for display (height)
    // We want the bar to be reasonably tall, so let's scale it
    const densityHeight = Math.min(maxDensityHeight * 0.7, maxDensityHeight);

    // Draw baseline
    const baselineY = height - padding - 10;
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

    // Draw background probability (1 - confidence)
    const bgGradient = this.ctx.createLinearGradient(0, baselineY - maxDensityHeight * 0.15, 0, baselineY);
    bgGradient.addColorStop(0, 'rgba(156, 163, 175, 0.15)');
    bgGradient.addColorStop(1, 'rgba(156, 163, 175, 0.05)');
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(
      padding,
      baselineY - maxDensityHeight * 0.15,
      width - 2 * padding,
      maxDensityHeight * 0.15
    );

    // Draw label for background probability
    this.ctx.fillStyle = '#9ca3af';
    this.ctx.font = '11px Inter, sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(
      `${(100 - confidence).toFixed(0)}% probability elsewhere`,
      padding + 5,
      baselineY - maxDensityHeight * 0.15 - 8
    );

    // Draw user's range (the confidence interval)
    const rangeX1 = xScale(userLow);
    const rangeX2 = xScale(userHigh);
    const rangeBarWidth = rangeX2 - rangeX1;

    // Gradient for the range bar
    const gradient = this.ctx.createLinearGradient(0, baselineY - densityHeight, 0, baselineY);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#a855f7');

    this.ctx.fillStyle = gradient;

    // Add subtle shadow before drawing
    this.ctx.shadowColor = 'rgba(99, 102, 241, 0.3)';
    this.ctx.shadowBlur = 15;
    this.ctx.shadowOffsetY = 4;

    this.ctx.fillRect(
      rangeX1,
      baselineY - densityHeight,
      rangeBarWidth,
      densityHeight
    );

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetY = 0;

    // Border for range
    this.ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      rangeX1,
      baselineY - densityHeight,
      rangeBarWidth,
      densityHeight
    );

    // Label for user's range
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    this.ctx.font = '600 13px Inter, sans-serif';
    this.ctx.textAlign = 'center';
    const labelY = baselineY - densityHeight / 2;
    this.ctx.fillText(`Your ${confidence}%`, (rangeX1 + rangeX2) / 2, labelY - 8);
    this.ctx.font = '500 11px Inter, sans-serif';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    this.ctx.fillText('confidence', (rangeX1 + rangeX2) / 2, labelY + 6);

    // Draw range bounds labels with background
    this.ctx.fillStyle = '#1f2937';
    this.ctx.font = '600 11px Inter, sans-serif';
    this.ctx.textAlign = 'center';

    // Add subtle background for better readability
    this.ctx.globalAlpha = 0.1;
    this.ctx.fillRect(rangeX1 - 20, baselineY - densityHeight - 20, 40, 16);
    this.ctx.fillRect(rangeX2 - 20, baselineY - densityHeight - 20, 40, 16);
    this.ctx.globalAlpha = 1;

    this.ctx.fillText(userLow.toFixed(0), rangeX1, baselineY - densityHeight - 8);
    this.ctx.fillText(userHigh.toFixed(0), rangeX2, baselineY - densityHeight - 8);

    // Draw correct answer marker
    const answerX = xScale(correctAnswer);
    const isInside = correctAnswer >= userLow && correctAnswer <= userHigh;

    // Arrow pointing to answer with gradient
    const markerColor = isInside ? '#10b981' : '#ef4444';
    this.ctx.strokeStyle = markerColor;
    this.ctx.fillStyle = markerColor;
    this.ctx.lineWidth = 3;

    // Add glow effect
    this.ctx.shadowColor = markerColor;
    this.ctx.shadowBlur = 10;

    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 25);
    this.ctx.lineTo(answerX, baselineY);
    this.ctx.stroke();

    // Arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 25);
    this.ctx.lineTo(answerX - 7, padding + 36);
    this.ctx.lineTo(answerX + 7, padding + 36);
    this.ctx.closePath();
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
      ? '✓ Answer captured! Narrower ranges with high confidence score better.'
      : '✗ Answer missed! High confidence outside your range = large penalty.';

    this.ctx.fillText(infoText, padding, height - 6);
  },

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
