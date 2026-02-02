/**
 * Chart module - time-series visualization using Chart.js
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
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#a855f7');

    // Create gradient for the fill area
    const fillGradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    fillGradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
    fillGradient.addColorStop(1, 'rgba(139, 92, 246, 0.05)');

    // Destroy existing chart if it exists
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
    this.ctx.setLineDash([]); // Reset dash

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
          borderWidth: 3,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#8b5cf6',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          fill: true,
          tension: 0.3, // Smooth curves
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#8b5cf6',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              title: function(tooltipItems) {
                return `Question ${tooltipItems[0].label}`;
              },
              label: function(context) {
                return `Score: ${context.parsed.y.toFixed(1)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Questions Answered',
              color: '#374151',
              font: {
                family: 'Inter',
                size: 11,
                weight: '600'
              }
            },
            grid: {
              color: 'rgba(229, 231, 235, 0.5)',
              drawBorder: false
            },
            ticks: {
              color: '#6b7280',
              font: {
                family: 'Inter',
                size: 10,
                weight: '500'
              }
            }
          },
          y: {
            title: {
              display: true,
              text: 'Calibration Score (%)',
              color: '#374151',
              font: {
                family: 'Inter',
                size: 11,
                weight: '600'
              }
            },
            min: 0,
            max: 100,
            grid: {
              color: 'rgba(229, 231, 235, 0.5)',
              drawBorder: false
            },
            ticks: {
              color: '#6b7280',
              font: {
                family: 'Inter',
                size: 10,
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
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Answer questions to see your progress',
      this.canvas.width / 2, this.canvas.height / 2);
  }
};
