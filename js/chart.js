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
    if (!this.ctx || history.length < 3) {
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

    // Calculate scales
    const maxScore = Math.max(...timeSeriesData.map(d => d.score), 50);
    const minScore = 0;

    const xScale = (width - 2 * padding) / (timeSeriesData.length - 1);
    const yScale = (height - 2 * padding) / (maxScore - minScore);

    // Draw axes
    this.ctx.strokeStyle = '#ddd';
    this.ctx.lineWidth = 1;

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

    // Draw grid lines
    this.ctx.strokeStyle = '#f0f0f0';
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (i * (height - 2 * padding) / 5);
      this.ctx.beginPath();
      this.ctx.moveTo(padding, y);
      this.ctx.lineTo(width - padding, y);
      this.ctx.stroke();
    }

    // Draw labels
    this.ctx.fillStyle = '#666';
    this.ctx.font = '10px sans-serif';
    this.ctx.textAlign = 'right';

    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
      const value = maxScore - (i * maxScore / 5);
      const y = padding + (i * (height - 2 * padding) / 5);
      this.ctx.fillText(value.toFixed(0), padding - 5, y + 3);
    }

    // Draw line
    this.ctx.strokeStyle = '#4CAF50';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    timeSeriesData.forEach((point, index) => {
      const x = padding + index * xScale;
      const y = height - padding - (point.score - minScore) * yScale;

      if (index === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });

    this.ctx.stroke();

    // Draw points
    this.ctx.fillStyle = '#4CAF50';
    timeSeriesData.forEach((point, index) => {
      const x = padding + index * xScale;
      const y = height - padding - (point.score - minScore) * yScale;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
      this.ctx.fill();
    });

    // Draw axis labels
    this.ctx.fillStyle = '#333';
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Questions Answered', width / 2, height - 5);

    this.ctx.save();
    this.ctx.translate(12, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Calibration Error', 0, 0);
    this.ctx.restore();
  },

  /**
   * Draw empty state
   */
  drawEmpty() {
    this.clear();
    this.ctx.fillStyle = '#999';
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Answer more questions to see your progress',
      this.canvas.width / 2, this.canvas.height / 2);
  },

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
};
