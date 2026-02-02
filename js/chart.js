/**
 * Chart module - time-series visualization using Chart.js
 * Dark theme variant
 */

const Chart = {
  canvas: null,
  chartInstance: null,

  /**
   * Initialize chart with canvas element
   */
  init(canvasElement) {
    this.canvas = canvasElement;
  },

  /**
   * Draw time-series chart
   */
  draw(history) {
    if (!this.canvas || history.length < 1) {
      this.drawEmpty();
      return;
    }

    const timeSeriesData = Scoring.getTimeSeriesData(history);
    if (timeSeriesData.length === 0) {
      this.drawEmpty();
      return;
    }

    // Prepare data for Chart.js
    const labels = timeSeriesData.map((_, index) => index + 1);
    const scores = timeSeriesData.map(point => point.score);

    // Create gradient for the line
    const ctx = this.canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, this.canvas.width, 0);
    gradient.addColorStop(0, '#e2a84b');
    gradient.addColorStop(1, '#d4913a');

    // Create gradient for the fill area
    const fillGradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    fillGradient.addColorStop(0, 'rgba(226, 168, 75, 0.2)');
    fillGradient.addColorStop(1, 'rgba(226, 168, 75, 0.02)');

    // Destroy existing chart if it exists
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    // Create new chart
    this.chartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Calibration Score',
          data: scores,
          borderColor: gradient,
          backgroundColor: fillGradient,
          borderWidth: 2,
          pointBackgroundColor: '#e2a84b',
          pointBorderColor: '#181a20',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#e2a84b',
          pointHoverBorderColor: '#181a20',
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.35,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1e2028',
            titleColor: '#e8e6e3',
            bodyColor: '#e8e6e3',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            titleFont: {
              family: 'JetBrains Mono, monospace',
              size: 11
            },
            bodyFont: {
              family: 'JetBrains Mono, monospace',
              size: 11
            },
            callbacks: {
              title: function(tooltipItems) {
                return 'Question ' + tooltipItems[0].label;
              },
              label: function(context) {
                return 'Score: ' + context.parsed.y.toFixed(1) + '%';
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Questions',
              color: '#5c5955',
              font: {
                family: 'JetBrains Mono, monospace',
                size: 10,
                weight: '500'
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.04)',
              drawBorder: false
            },
            ticks: {
              color: '#5c5955',
              font: {
                family: 'JetBrains Mono, monospace',
                size: 9,
                weight: '500'
              }
            }
          },
          y: {
            title: {
              display: true,
              text: 'Score',
              color: '#5c5955',
              font: {
                family: 'JetBrains Mono, monospace',
                size: 10,
                weight: '500'
              }
            },
            min: 0,
            max: 100,
            grid: {
              color: 'rgba(255, 255, 255, 0.04)',
              drawBorder: false
            },
            ticks: {
              color: '#5c5955',
              font: {
                family: 'JetBrains Mono, monospace',
                size: 9,
                weight: '500'
              },
              callback: function(value) {
                return value + '%';
              }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  },

  /**
   * Draw empty state
   */
  drawEmpty() {
    // Destroy existing chart
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    // Draw empty state message
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#5c5955';
    ctx.font = '500 12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Answer questions to see your progress', w / 2, h / 2);
  }
};
