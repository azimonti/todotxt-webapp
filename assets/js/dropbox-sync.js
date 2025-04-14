import { initializeAuthentication } from './dropbox/auth.js';
import { initializeOfflineHandling } from './dropbox/offline.js';
// import { uploadTodosToDropbox } from './dropbox/api.js'; // No longer re-exporting upload
import { initializeSyncCoordinator } from './sync-coordinator.js'; // Import coordinator initializer
import { logVerbose } from './todo-logging.js';

/**
 * Initializes the complete Dropbox sync system.
 * Sets up authentication, offline handling, and initial status checks.
 */
async function initializeDropboxSync() {
  logVerbose('Initializing Dropbox Sync System...');

  // Initialize the coordinator first so it's ready to listen for events
  // and handle the initial sync triggered by auth/API initialization.
  initializeSyncCoordinator();

  // Initialize offline handling (sets initial online/offline status and listeners)
  // It's okay to initialize this before auth, it mainly sets up listeners.
  initializeOfflineHandling();

  // Initialize authentication last, as it might trigger the initial API call and sync
  const authInitialized = await initializeAuthentication();

  if (authInitialized) {
    logVerbose('Dropbox Sync System Initialized (Auth successful).');
  } else {
    logVerbose('Dropbox Sync System Initialized (Auth failed or no token).');
    // No need for an error here, it just means user isn't logged in.
  }
  // Note: The initial sync check is triggered within initializeDropboxApi
  // which is called by initializeAuthentication if a token exists or is obtained.
  // The initial sync itself is now triggered within initializeDropboxApi -> coordinateSync
}

// Export only the main initialization function
export { initializeDropboxSync };

// Automatically initialize when the script is loaded as a module
// We wrap in a DOMContentLoaded listener to ensure UI elements are ready,
// although most UI interactions are handled within the modules now.
document.addEventListener('DOMContentLoaded', initializeDropboxSync);
