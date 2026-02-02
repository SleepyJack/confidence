/**
 * Main entry point - initializes the application
 */

async function initApp() {
  try {
    // Initialize game
    await Game.init();

    // Initialize UI
    UI.init();

    console.log('Confidence Calibration Game initialized successfully');
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
