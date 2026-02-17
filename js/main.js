/**
 * Main entry point - initializes the application
 */

async function initApp() {
  try {
    // Initialize auth first — wait for session restore and localStorage hydration
    await Auth.init();

    // Initialize game (loads seen-questions from localStorage, now hydrated if logged in)
    Game.init();

    // Initialize auth UI event listeners
    AuthUI.init();

    // Initialize game UI
    UI.init();

    // Version display — non-blocking, reads from config.json
    fetch('config.json')
      .then(r => r.json())
      .then(config => {
        const el = document.getElementById('version-info');
        if (el && config.version) el.textContent = `v${config.version}`;
      })
      .catch(() => {});

    console.log('Calibrate initialized');
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
