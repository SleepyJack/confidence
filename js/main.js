/**
 * Main entry point - initializes the application
 */

function initApp() {
  try {
    // Initialize game (loads seen-questions from localStorage)
    Game.init();

    // Initialize UI
    UI.init();

    // Version display — non-blocking, reads from version.txt
    fetch('version.txt')
      .then(r => r.text())
      .then(v => {
        const el = document.getElementById('version-info');
        if (el) el.textContent = `v${v.trim()}`;
      })
      .catch(() => {});

    console.log('Confidence Calibration Game initialized');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    alert('Failed to load the game. Please refresh the page.');
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
