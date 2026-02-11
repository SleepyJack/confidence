/**
 * Stats dashboard — client-side logic
 * Fetches metrics from /api/stats and renders Chart.js bar chart
 */
(function () {
  'use strict';

  let chartInstance = null;

  // DOM refs
  const tileTotal = document.getElementById('tile-total');
  const tileActive = document.getElementById('tile-active');
  const tileAvg = document.getElementById('tile-avg-responses');
  const canvas = document.getElementById('stats-chart-canvas');
  const rangeButtons = document.querySelectorAll('.range-btn');

  async function fetchStats(days) {
    const qs = days > 0 ? `?days=${days}` : '';
    const res = await fetch(`/api/stats${qs}`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    return res.json();
  }

  function populateTiles(data) {
    tileTotal.textContent = data.totalQuestions.toLocaleString();
    tileTotal.classList.remove('loading');

    tileActive.textContent = data.activeQuestions.toLocaleString();
    tileActive.classList.remove('loading');

    tileAvg.textContent = data.avgResponsesPerQuestion.toFixed(1);
    tileAvg.classList.remove('loading');
  }

  function renderChart(timeSeries) {
    const labels = timeSeries.map(function (d) { return d.date; });
    const counts = timeSeries.map(function (d) { return d.count; });

    const ctx = canvas.getContext('2d');

    // Gold accent gradient for bars
    const barGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    barGrad.addColorStop(0, 'rgba(226, 168, 75, 0.85)');
    barGrad.addColorStop(1, 'rgba(226, 168, 75, 0.25)');

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Questions',
          data: counts,
          backgroundColor: barGrad,
          borderColor: '#e2a84b',
          borderWidth: 1,
          borderRadius: 3,
          borderSkipped: 'bottom'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e2028',
            titleColor: '#e8e6e3',
            bodyColor: '#e8e6e3',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            titleFont: { family: 'JetBrains Mono, monospace', size: 11 },
            bodyFont: { family: 'JetBrains Mono, monospace', size: 11 },
            callbacks: {
              title: function (items) { return items[0].label; },
              label: function (item) {
                var n = item.parsed.y;
                return n + ' question' + (n === 1 ? '' : 's');
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#5c5955',
              font: { family: 'JetBrains Mono, monospace', size: 9, weight: '500' },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)', drawBorder: false },
            ticks: {
              color: '#5c5955',
              font: { family: 'JetBrains Mono, monospace', size: 9, weight: '500' },
              precision: 0
            }
          }
        }
      }
    });
  }

  async function load(days) {
    try {
      var data = await fetchStats(days);
      populateTiles(data);
      renderChart(data.timeSeries);
    } catch (err) {
      console.error('Failed to load stats:', err);
      tileTotal.textContent = 'err';
      tileActive.textContent = 'err';
      tileAvg.textContent = 'err';
    }
  }

  // Range button handlers
  rangeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      rangeButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      load(parseInt(btn.dataset.days, 10));
    });
  });

  // Load version from config.json (same pattern as main.js)
  fetch('/config.json')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      var el = document.getElementById('version-info');
      if (el && cfg.version) el.textContent = 'v' + cfg.version;
    })
    .catch(function () {});

  // Initial load with 30-day default
  load(30);
})();
