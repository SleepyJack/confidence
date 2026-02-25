/**
 * Stats dashboard — client-side logic
 * Fetches metrics from /api/stats and renders Chart.js bar charts
 */
(function () {
  'use strict';

  var questionsChart = null;
  var responsesChart = null;
  var usersChart = null;

  // Current filter state
  var currentDays = 30;
  var currentType = ''; // '' = all, 'user', 'guest'

  // DOM refs — Questions
  var tileTotal = document.getElementById('tile-total');
  var tileActive = document.getElementById('tile-active');
  var questionsCanvas = document.getElementById('stats-chart-canvas');

  // DOM refs — Responses
  var tileTotalResponses = document.getElementById('tile-total-responses');
  var tileAvgScore = document.getElementById('tile-avg-score');
  var tileAvgConfidence = document.getElementById('tile-avg-confidence');
  var responsesCanvas = document.getElementById('responses-chart-canvas');

  // DOM refs — Users
  var tileTotalUsers = document.getElementById('tile-total-users');
  var usersCanvas = document.getElementById('users-chart-canvas');

  var rangeButtons = document.querySelectorAll('.range-btn');
  var typeButtons = document.querySelectorAll('.type-btn');

  // Section colour palettes (match CSS variables)
  var colors = {
    questions:  { main: 'rgba(226, 168, 75, 0.80)', fade: 'rgba(226, 168, 75, 0.18)', border: '#e2a84b' },
    responses:  { main: 'rgba(96, 165, 250, 0.80)', fade: 'rgba(96, 165, 250, 0.18)', border: '#60a5fa' },
    users:      { main: 'rgba(74, 222, 128, 0.80)', fade: 'rgba(74, 222, 128, 0.18)', border: '#4ade80' }
  };

  async function fetchStats(days, type) {
    var params = [];
    if (days > 0) params.push('days=' + days);
    if (type) params.push('type=' + type);
    var qs = params.length > 0 ? '?' + params.join('&') : '';
    var res = await fetch('/api/stats' + qs);
    if (!res.ok) throw new Error('API returned ' + res.status);
    return res.json();
  }

  function populateTiles(data) {
    // Questions
    tileTotal.textContent = data.totalQuestions.toLocaleString();
    tileTotal.classList.remove('loading');

    tileActive.textContent = data.activeQuestions.toLocaleString();
    tileActive.classList.remove('loading');

    // Responses
    tileTotalResponses.textContent = data.totalResponses.toLocaleString();
    tileTotalResponses.classList.remove('loading');

    tileAvgScore.textContent = data.avgScoreAll.toFixed(1);
    tileAvgScore.classList.remove('loading');

    tileAvgConfidence.textContent = data.avgConfidenceAll.toFixed(1);
    tileAvgConfidence.classList.remove('loading');

    // Users
    tileTotalUsers.textContent = data.totalUsers.toLocaleString();
    tileTotalUsers.classList.remove('loading');
  }

  /**
   * Generic bar chart renderer.
   * @param {HTMLCanvasElement} canvas
   * @param {Chart|null} existing - previous Chart instance to destroy
   * @param {Array} timeSeries - [{date, count}]
   * @param {string} label - dataset label (singular)
   * @param {Object} palette - { main, fade, border }
   * @returns {Chart}
   */
  function renderBarChart(canvas, existing, timeSeries, label, palette) {
    var labels = timeSeries.map(function (d) { return d.date; });
    var counts = timeSeries.map(function (d) { return d.count; });

    var ctx = canvas.getContext('2d');
    var barGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    barGrad.addColorStop(0, palette.main);
    barGrad.addColorStop(1, palette.fade);

    if (existing) existing.destroy();

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: counts,
          backgroundColor: barGrad,
          borderColor: palette.border,
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
                return n + ' ' + label.toLowerCase() + (n === 1 ? '' : 's');
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

  function renderQuestionsChart(timeSeries) {
    questionsChart = renderBarChart(
      questionsCanvas, questionsChart, timeSeries, 'Question', colors.questions
    );
  }

  /**
   * Stacked bar chart for user vs guest breakdown (All mode).
   */
  function renderStackedResponsesChart(userSeries, guestSeries) {
    var labels = userSeries.map(function (d) { return d.date; });
    var userData = userSeries.map(function (d) { return d.count; });
    var guestData = guestSeries.map(function (d) { return d.count; });

    if (responsesChart) responsesChart.destroy();

    var ctx = responsesCanvas.getContext('2d');
    responsesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Users',
            data: userData,
            backgroundColor: 'rgba(96, 165, 250, 0.80)',
            borderColor: '#60a5fa',
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: 'bottom'
          },
          {
            label: 'Guests',
            data: guestData,
            backgroundColor: 'rgba(147, 197, 253, 0.80)',
            borderColor: '#93c5fd',
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: 'bottom'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#9c9a97',
              font: { family: 'JetBrains Mono, monospace', size: 10 },
              boxWidth: 12,
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: '#1e2028',
            titleColor: '#e8e6e3',
            bodyColor: '#e8e6e3',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            padding: 10,
            titleFont: { family: 'JetBrains Mono, monospace', size: 11 },
            bodyFont: { family: 'JetBrains Mono, monospace', size: 11 },
            callbacks: {
              title: function (items) { return items[0].label; },
              afterBody: function (items) {
                var total = items.reduce(function (sum, i) { return sum + i.parsed.y; }, 0);
                return 'Total: ' + total + ' response' + (total === 1 ? '' : 's');
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
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
            stacked: true,
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

  function renderResponsesChart(data) {
    if (currentType === '' && data.responsesTimeSeriesUser && data.responsesTimeSeriesUser.length > 0) {
      renderStackedResponsesChart(data.responsesTimeSeriesUser, data.responsesTimeSeriesGuest);
    } else {
      responsesChart = renderBarChart(
        responsesCanvas, responsesChart, data.responsesTimeSeries, 'Response', colors.responses
      );
    }
  }

  function renderUsersChart(timeSeries) {
    usersChart = renderBarChart(
      usersCanvas, usersChart, timeSeries, 'Registration', colors.users
    );
  }

  function clearDisplay() {
    var tiles = [tileTotal, tileActive, tileTotalResponses, tileAvgScore, tileAvgConfidence, tileTotalUsers];
    tiles.forEach(function (t) { t.textContent = '\u2014'; t.classList.add('loading'); });
    if (questionsChart) { questionsChart.destroy(); questionsChart = null; }
    if (responsesChart) { responsesChart.destroy(); responsesChart = null; }
    if (usersChart) { usersChart.destroy(); usersChart = null; }
  }

  async function load(days, type) {
    clearDisplay();
    try {
      var data = await fetchStats(days, type);
      populateTiles(data);
      renderQuestionsChart(data.timeSeries);
      renderResponsesChart(data);
      renderUsersChart(data.usersTimeSeries);
    } catch (err) {
      console.error('Failed to load stats:', err);
      tileTotal.textContent = 'err';
      tileActive.textContent = 'err';
      tileTotalResponses.textContent = 'err';
      tileAvgScore.textContent = 'err';
      tileAvgConfidence.textContent = 'err';
      tileTotalUsers.textContent = 'err';
    }
  }

  // Range button handlers
  rangeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      rangeButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentDays = parseInt(btn.dataset.days, 10);
      load(currentDays, currentType);
    });
  });

  // Type button handlers
  typeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      typeButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentType = btn.dataset.type;
      load(currentDays, currentType);
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

  // Initial load with 30-day default, all types
  load(currentDays, currentType);
})();
