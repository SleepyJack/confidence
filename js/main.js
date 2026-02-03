/**
 * Main entry point - initializes the application
 */

// Version info - update this with each deployment
const VERSION = {
  hash: '8ceeda7',
  date: '2026-XX-XX' // Will show actual build date in production
};

async function initApp() {
  try {
    // Initialize game
    await Game.init();

    // Initialize UI
    UI.init();

    // Update version display
    const versionEl = document.getElementById('version-info');
    if (versionEl) {
      versionEl.textContent = `v${VERSION.hash}`;
    }

    console.log('Confidence Calibration Game initialized successfully', VERSION);
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
