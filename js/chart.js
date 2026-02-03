/**
 * Chart module - time-series visualizations using Chart.js
 * Supports score chart and bias chart with shared styling
 */

const Chart = {
  scoreCanvas: null,
  confidenceBiasCanvas: null,
  scoreChartInstance: null,
  confidenceBiasChartInstance: null,

  /**
   * Initialize charts with canvas elements
   */
  init(scoreCanvasElement, confidenceBiasCanvasElement) {
    this.scoreCanvas = scoreCanvasElement;
    this.confidenceBiasCanvas = confidenceBiasCanvasElement;
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
    this._drawConfidenceBias(history);
  },

  /**
   * Draw score time-series chart with raw scatter + EMA line
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
    const rawScores = timeSeriesData.map(p => p.score);
    const emaScores = timeSeriesData.map(p => p.scoreEMA);

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
        datasets: [
          // EMA line (drawn first, behind scatter)
          {
            label: 'Smoothed',
            data: emaScores,
            borderColor: lineGrad,
            backgroundColor: fillGrad,
            borderWidth: 2,
            pointRadius: 0, // No points on line
            pointHoverRadius: 0,
            fill: true,
            tension: 0.35,
            order: 2 // Draw behind
          },
          // Raw scatter points (drawn second, on top)
          {
            label: 'Raw',
            data: rawScores,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(226, 168, 75, 0.5)',
            pointBorderColor: '#e2a84b',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#e2a84b',
            pointHoverBorderWidth: 2,
            showLine: false, // Scatter only
            order: 1 // Draw on top
          }
        ]
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
                if (ctx.datasetIndex === 0) {
                  return 'Smoothed: ' + ctx.parsed.y.toFixed(1) + '%';
                } else {
                  return 'Raw: ' + ctx.parsed.y.toFixed(1) + '%';
                }
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
   * Draw confidence bias time-series chart with raw scatter + EMA line
   */
  _drawConfidenceBias(history) {
    if (!this.confidenceBiasCanvas || history.length < 1) {
      this._drawEmpty(this.confidenceBiasCanvas, this.confidenceBiasChartInstance, 'confidenceBiasChartInstance');
      return;
    }

    const biasData = Scoring.getConfidenceBiasTimeSeriesData(history);
    if (biasData.length === 0) {
      this._drawEmpty(this.confidenceBiasCanvas, this.confidenceBiasChartInstance, 'confidenceBiasChartInstance');
      return;
    }

    const labels = biasData.map((_, i) => i + 1);
    const rawBiases = biasData.map(p => p.confidenceBias);
    const emaBiases = biasData.map(p => p.confidenceBiasEMA);

    const ctx = this.confidenceBiasCanvas.getContext('2d');

    // Color raw points by bias direction
    const pointColors = rawBiases.map(b => {
      if (Math.abs(b) < 5) return 'rgba(74, 222, 128, 0.5)';
      return b > 0 ? 'rgba(96, 165, 250, 0.5)' : 'rgba(248, 113, 113, 0.5)';
    });

    const pointBorderColors = rawBiases.map(b => {
      if (Math.abs(b) < 5) return '#4ade80';
      return b > 0 ? '#60a5fa' : '#f87171';
    });

    if (this.confidenceBiasChartInstance) this.confidenceBiasChartInstance.destroy();

    this.confidenceBiasChartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          // EMA line (drawn first, behind scatter)
          {
            label: 'Smoothed',
            data: emaBiases,
            borderColor: '#9a9590',
            borderWidth: 2,
            pointRadius: 0, // No points on line
            pointHoverRadius: 0,
            fill: false,
            tension: 0.35,
            order: 2 // Draw behind
          },
          // Raw scatter points (drawn second, on top)
          {
            label: 'Raw',
            data: rawBiases,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            pointBackgroundColor: pointColors,
            pointBorderColor: pointBorderColors,
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointHoverBorderWidth: 2,
            showLine: false, // Scatter only
            order: 1 // Draw on top
          }
        ]
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
                const label = ctx.datasetIndex === 0 ? 'Smoothed: ' : 'Raw: ';
                return label + sign + v.toFixed(1);
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
    this._drawEmpty(this.confidenceBiasCanvas, this.confidenceBiasChartInstance, 'confidenceBiasChartInstance');
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
