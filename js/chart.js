/**
 * Chart module - time-series visualizations using Chart.js
 * Supports score chart and bias chart with shared styling
 */

const Chart = {
  scoreCanvas: null,
  biasCanvas: null,
  scoreChartInstance: null,
  biasChartInstance: null,

  /**
   * Initialize charts with canvas elements
   */
  init(scoreCanvasElement, biasCanvasElement) {
    this.scoreCanvas = scoreCanvasElement;
    this.biasCanvas = biasCanvasElement;
  },

  /**
   * Shared tooltip config
   */
  _tooltipConfig() {
    return {
      backgroundColor: '#1e2028',
      titleColor: '#e8e6e3',
      bodyColor: '#e8e6e3',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: 10,
      displayColors: false,
      titleFont: { family: 'JetBrains Mono, monospace', size: 11 },
      bodyFont: { family: 'JetBrains Mono, monospace', size: 11 },
    };
  },

  /**
   * Shared axis font config
   */
  _axisFont(size) {
    return { family: 'JetBrains Mono, monospace', size: size, weight: '500' };
  },

  /**
   * Draw both charts
   */
  draw(history) {
    this._drawScore(history);
    this._drawBias(history);
  },

  /**
   * Draw score time-series chart
   */
  _drawScore(history) {
    if (!this.scoreCanvas || history.length < 1) {
      this._drawEmpty(this.scoreCanvas, this.scoreChartInstance, 'scoreChartInstance');
      return;
    }

    const timeSeriesData = Scoring.getTimeSeriesData(history);
    if (timeSeriesData.length === 0) {
      this._drawEmpty(this.scoreCanvas, this.scoreChartInstance, 'scoreChartInstance');
      return;
    }

    const labels = timeSeriesData.map((_, i) => i + 1);
    const scores = timeSeriesData.map(p => p.score);

    const ctx = this.scoreCanvas.getContext('2d');
    const lineGrad = ctx.createLinearGradient(0, 0, this.scoreCanvas.width, 0);
    lineGrad.addColorStop(0, '#e2a84b');
    lineGrad.addColorStop(1, '#d4913a');

    const fillGrad = ctx.createLinearGradient(0, 0, 0, this.scoreCanvas.height);
    fillGrad.addColorStop(0, 'rgba(226, 168, 75, 0.2)');
    fillGrad.addColorStop(1, 'rgba(226, 168, 75, 0.02)');

    if (this.scoreChartInstance) this.scoreChartInstance.destroy();

    this.scoreChartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: scores,
          borderColor: lineGrad,
          backgroundColor: fillGrad,
          borderWidth: 2,
          pointBackgroundColor: '#e2a84b',
          pointBorderColor: '#181a20',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.35,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltipConfig(),
            callbacks: {
              title: (items) => 'Question ' + items[0].label,
              label: (ctx) => 'Score: ' + ctx.parsed.y.toFixed(1) + '%'
            }
          }
        },
        scales: {
          x: {
            display: false,
            grid: { display: false }
          },
          y: {
            min: 0, max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
            ticks: {
              color: '#5c5955',
              font: this._axisFont(9),
              callback: (v) => v + '%'
            }
          }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  },

  /**
   * Draw bias time-series chart
   */
  _drawBias(history) {
    if (!this.biasCanvas || history.length < 1) {
      this._drawEmpty(this.biasCanvas, this.biasChartInstance, 'biasChartInstance');
      return;
    }

    const biasData = Scoring.getBiasTimeSeriesData(history);
    if (biasData.length === 0) {
      this._drawEmpty(this.biasCanvas, this.biasChartInstance, 'biasChartInstance');
      return;
    }

    const labels = biasData.map((_, i) => i + 1);
    const biases = biasData.map(p => p.bias);

    const ctx = this.biasCanvas.getContext('2d');

    // Color points by bias direction
    const pointColors = biases.map(b => {
      if (Math.abs(b) < 5) return '#4ade80';
      return b > 0 ? '#f87171' : '#60a5fa';
    });

    if (this.biasChartInstance) this.biasChartInstance.destroy();

    this.biasChartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: biases,
          borderColor: '#9a9590',
          borderWidth: 2,
          pointBackgroundColor: pointColors,
          pointBorderColor: '#181a20',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false,
          tension: 0.35,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this._tooltipConfig(),
            callbacks: {
              title: (items) => 'Question ' + items[0].label,
              label: (ctx) => {
                const v = ctx.parsed.y;
                const sign = v >= 0 ? '+' : '';
                return 'Bias: ' + sign + v.toFixed(1) + '%';
              }
            }
          }
        },
        scales: {
          x: {
            display: false,
            grid: { display: false }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
            ticks: {
              color: '#5c5955',
              font: this._axisFont(9),
              callback: (v) => (v >= 0 ? '+' : '') + v + '%'
            }
          }
        },
        interaction: { intersect: false, mode: 'index' },
        // Draw zero line
        layout: { padding: { top: 4 } }
      },
      plugins: [{
        id: 'zeroLine',
        beforeDraw(chart) {
          const yScale = chart.scales.y;
          if (yScale.min > 0 || yScale.max < 0) return;
          const ctx = chart.ctx;
          const yPixel = yScale.getPixelForValue(0);
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(chart.chartArea.left, yPixel);
          ctx.lineTo(chart.chartArea.right, yPixel);
          ctx.stroke();
          ctx.restore();
        }
      }]
    });
  },

  /**
   * Draw empty states for both charts
   */
  drawEmpty() {
    this._drawEmpty(this.scoreCanvas, this.scoreChartInstance, 'scoreChartInstance');
    this._drawEmpty(this.biasCanvas, this.biasChartInstance, 'biasChartInstance');
  },

  /**
   * Draw empty state on a specific canvas
   */
  _drawEmpty(canvas, instance, instanceKey) {
    if (!canvas) return;
    if (instance) {
      instance.destroy();
      this[instanceKey] = null;
    }
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#5c5955';
    ctx.font = '500 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Answer questions to see progress', w / 2, h / 2);
  }
};
