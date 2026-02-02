/**
 * Chart module - simple time-series visualization
 */

const Chart = {
  canvas: null,
  ctx: null,

  /**
   * Initialize chart with canvas element
   */
  init(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
  },

  /**
   * Draw time-series chart
   */
  draw(history) {
    if (!this.ctx || history.length < 1) {
      this.drawEmpty();
      return;
    }

    const timeSeriesData = Scoring.getTimeSeriesData(history);
    if (timeSeriesData.length === 0) {
      this.drawEmpty();
      return;
    }

    this.clear();

    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 30;

    // Fixed scale for Calibration Score (0-100%)
    const maxScore = 100;
    const minScore = 0;

    const xScale = timeSeriesData.length > 1
      ? (width - 2 * padding) / (timeSeriesData.length - 1)
      : 0;
    const yScale = (height - 2 * padding) / (maxScore - minScore);

    // Draw axes
    this.ctx.strokeStyle = '#d1d5db';
    this.ctx.lineWidth = 2;

    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding, padding);
    this.ctx.lineTo(padding, height - padding);
    this.ctx.stroke();

    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding, height - padding);
    this.ctx.lineTo(width - padding, height - padding);
    this.ctx.stroke();

    // Draw grid lines (horizontal only, cleaner look)
    this.ctx.strokeStyle = '#e5e7eb';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);
    for (let i = 1; i <= 4; i++) { // Skip top and bottom
      const y = padding + (i * (height - 2 * padding) / 5);
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(width - padding, y);
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]); // Reset dash

    // Draw labels
    this.ctx.fillStyle = '#6b7280';
    this.ctx.font = '500 10px Inter, sans-serif';
    this.ctx.textAlign = 'right';

    // Y-axis labels (100, 80, 60, 40, 20, 0)
    for (let i = 0; i <= 5; i++) {
      const value = maxScore - (i * maxScore / 5);
      const y = padding + (i * (height - 2 * padding) / 5);
      this.ctx.fillText(value.toFixed(0) + '%', padding - 5, y + 3);
    }

    // Draw area fill under line first
    const areaGradient = this.ctx.createLinearGradient(0, padding, 0, height - padding);
    areaGradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
    areaGradient.addColorStop(1, 'rgba(139, 92, 246, 0.02)');

    this.ctx.fillStyle = areaGradient;
    this.ctx.beginPath();

    // Start from bottom left
    const firstX = timeSeriesData.length > 1 ? padding : width / 2;
    const firstY = height - padding - (timeSeriesData[0].score - minScore) * yScale;
    this.ctx.moveTo(firstX, height - padding);
    this.ctx.lineTo(firstX, firstY);

    // Draw line
    timeSeriesData.forEach((point, index) => {
      const x = timeSeriesData.length > 1
        ? padding + index * xScale
        : width / 2;
      const y = height - padding - (point.score - minScore) * yScale;
      this.ctx.lineTo(x, y);
    });

    // Close path to bottom right
    const lastX = timeSeriesData.length > 1
      ? padding + (timeSeriesData.length - 1) * xScale
      : width / 2;
    this.ctx.lineTo(lastX, height - padding);
    this.ctx.closePath();
    this.ctx.fill();

    // Now draw the line on top
    const lineGradient = this.ctx.createLinearGradient(padding, 0, width - padding, 0);
    lineGradient.addColorStop(0, '#6366f1');
    lineGradient.addColorStop(0.5, '#8b5cf6');
    lineGradient.addColorStop(1, '#a855f7');

    this.ctx.strokeStyle = lineGradient;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();

    timeSeriesData.forEach((point, index) => {
      const x = timeSeriesData.length > 1
        ? padding + index * xScale
        : width / 2;
      const y = height - padding - (point.score - minScore) * yScale;

      if (index === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();

    // Draw points with glow
    this.ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
    this.ctx.shadowBlur = 8;

    timeSeriesData.forEach((point, index) => {
      const x = timeSeriesData.length > 1
        ? padding + index * xScale
        : width / 2;
      const y = height - padding - (point.score - minScore) * yScale;

      // Gradient for points
      const pointGradient = this.ctx.createRadialGradient(x, y, 0, x, y, 5);
      pointGradient.addColorStop(0, '#8b5cf6');
      pointGradient.addColorStop(1, '#6366f1');

      this.ctx.fillStyle = pointGradient;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
      this.ctx.fill();

      // White center
      this.ctx.fillStyle = '#fff';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
      this.ctx.fill();
    });

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;

    // Draw axis labels
    this.ctx.fillStyle = '#374151';
    this.ctx.font = '600 11px Inter, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Questions Answered', width / 2, height - 5);

    this.ctx.save();
    this.ctx.translate(12, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Calibration Score (%)', 0, 0);
    this.ctx.restore();
  },

  /**
   * Draw empty state
   */
  drawEmpty() {
    this.clear();
    this.ctx.fillStyle = '#9ca3af';
    this.ctx.font = '500 13px Inter, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Answer questions to see your progress',
      this.canvas.width / 2, this.canvas.height / 2);
  },

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
