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
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(padding, baselineY);
    this.ctx.lineTo(width - padding, baselineY);
    this.ctx.stroke();

    // Draw axis labels
    this.ctx.fillStyle = '#666';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';

    // Min label
    this.ctx.fillText(displayMin.toFixed(0), padding, height - padding + 15);

    // Max label
    this.ctx.fillText(displayMax.toFixed(0), width - padding, height - padding + 15);

    // Mid label
    const midValue = (displayMin + displayMax) / 2;
    this.ctx.fillText(midValue.toFixed(0), width / 2, height - padding + 15);

    // Draw background probability (1 - confidence)
    this.ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
    this.ctx.fillRect(
      padding,
      baselineY - maxDensityHeight * 0.15,
      width - 2 * padding,
      maxDensityHeight * 0.15
    );

    // Draw label for background probability
    this.ctx.fillStyle = '#999';
    this.ctx.font = '10px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(
      `${(100 - confidence).toFixed(0)}% probability elsewhere`,
      padding + 5,
      baselineY - maxDensityHeight * 0.15 - 5
    );

    // Draw user's range (the confidence interval)
    const rangeX1 = xScale(userLow);
    const rangeX2 = xScale(userHigh);
    const rangeBarWidth = rangeX2 - rangeX1;

    // Gradient for the range bar
    const gradient = this.ctx.createLinearGradient(0, baselineY - densityHeight, 0, baselineY);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(
      rangeX1,
      baselineY - densityHeight,
      rangeBarWidth,
      densityHeight
    );

    // Border for range
    this.ctx.strokeStyle = '#4a5fbe';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      rangeX1,
      baselineY - densityHeight,
      rangeBarWidth,
      densityHeight
    );

    // Label for user's range
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    const labelY = baselineY - densityHeight / 2;
    this.ctx.fillText(`Your ${confidence}%`, (rangeX1 + rangeX2) / 2, labelY - 10);
    this.ctx.fillText('confidence', (rangeX1 + rangeX2) / 2, labelY + 5);

    // Draw range bounds labels
    this.ctx.fillStyle = '#333';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(userLow.toFixed(0), rangeX1, baselineY - densityHeight - 5);
    this.ctx.fillText(userHigh.toFixed(0), rangeX2, baselineY - densityHeight - 5);

    // Draw correct answer marker
    const answerX = xScale(correctAnswer);
    const isInside = correctAnswer >= userLow && correctAnswer <= userHigh;

    // Arrow pointing to answer
    this.ctx.strokeStyle = isInside ? '#28a745' : '#dc3545';
    this.ctx.fillStyle = isInside ? '#28a745' : '#dc3545';
    this.ctx.lineWidth = 3;

    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 20);
    this.ctx.lineTo(answerX, baselineY);
    this.ctx.stroke();

    // Arrow head
    this.ctx.beginPath();
    this.ctx.moveTo(answerX, padding + 20);
    this.ctx.lineTo(answerX - 6, padding + 30);
    this.ctx.lineTo(answerX + 6, padding + 30);
    this.ctx.closePath();
    this.ctx.fill();

    // Label for correct answer
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('True Answer', answerX, padding + 12);

    // Additional info at bottom
    this.ctx.fillStyle = '#666';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'left';

    const infoText = isInside
      ? '✓ Answer captured! Narrower ranges with high confidence score better.'
      : '✗ Answer missed! High confidence outside your range = large penalty.';

    this.ctx.fillText(infoText, padding, height - 5);
  },

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
