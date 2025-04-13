import { initializeAuthentication } from './dropbox/auth.js';
import { initializeOfflineHandling } from './dropbox/offline.js';
import { uploadTodosToDropbox } from './dropbox/api.js'; // Exported for external use (e.g., saving todos)
import { logVerbose } from './todo-logging.js';

/**
 * Initializes the complete Dropbox sync system.
 * Sets up authentication, offline handling, and initial status checks.
 */
async function initializeDropboxSync() {
  logVerbose('Initializing Dropbox Sync System...');
  // Initialize authentication first, as it might initialize the API
  const authInitialized = await initializeAuthentication();

  if (authInitialized) {
    // Initialize offline handling (sets initial online/offline status and listeners)
    initializeOfflineHandling();
    logVerbose('Dropbox Sync System Initialized.');
  } else {
    console.error('Dropbox Sync System initialization failed due to auth issues.');
  }
  // Note: The initial sync check is triggered within initializeDropboxApi
  // which is called by initializeAuthentication if a token exists or is obtained.
}

// Export the main initialization function and the upload function
export { initializeDropboxSync, uploadTodosToDropbox };

// Automatically initialize when the script is loaded as a module
// We wrap in a DOMContentLoaded listener to ensure UI elements are ready,
// although most UI interactions are handled within the modules now.
document.addEventListener('DOMContentLoaded', initializeDropboxSync);
