import { PENDING_UPLOAD_KEY  } from './config.js';
import { logVerbose } from '../todo-logging.js';
import { updateSyncIndicator, SyncStatus } from './ui.js';
import { getAccessToken } from './auth.js'; // To check if logged in
// Import upload function later when api.js is created
// import { uploadTodosToDropbox } from './api.js';

/**
 * Checks if there's a pending upload flagged in localStorage.
 * @returns {boolean}
 */
export function isUploadPending() {
  const pending = localStorage.getItem(PENDING_UPLOAD_KEY) === 'true';
  logVerbose(`Checking pending upload flag: ${pending}`);
  return pending;
}

/**
 * Sets the pending upload flag in localStorage.
 */
export function setUploadPending() {
  logVerbose('Setting pending upload flag.');
  localStorage.setItem(PENDING_UPLOAD_KEY, 'true');
  updateSyncIndicator(SyncStatus.PENDING); // Update UI
}

/**
 * Clears the pending upload flag from localStorage.
 */
export function clearUploadPending() {
  logVerbose('Clearing pending upload flag.');
  localStorage.removeItem(PENDING_UPLOAD_KEY);
  // Don't immediately set to IDLE here, let the sync function determine final state
}

// --- Event Handlers ---

async function handleOnlineStatus() {
  logVerbose('Application came online.');
  // If not logged in, status remains NOT_CONNECTED
  const accessToken = getAccessToken();
  if (!accessToken) {
    updateSyncIndicator(SyncStatus.NOT_CONNECTED);
    return;
  }

  if (isUploadPending()) {
    logVerbose('Pending upload detected. Attempting sync...');
    updateSyncIndicator(SyncStatus.SYNCING); // Show syncing during attempt

    // Dynamically import uploadTodosToDropbox to avoid circular dependency issues
    // and ensure api.js is loaded when needed.
    try {
      const { uploadTodosToDropbox } = await import('./api.js');
      await uploadTodosToDropbox(); // Attempt upload, which includes conflict checks
      // uploadTodosToDropbox should handle setting the final status (IDLE or ERROR)
    } catch (err) {
      console.error("Error during pending upload:", err);
      updateSyncIndicator(SyncStatus.ERROR, 'Pending sync failed');
      // Keep the flag set to retry later unless it was an auth error?
    }
  } else {
    // Came online, no pending changes, assume idle for now
    // A full sync check might be triggered elsewhere upon initialization or periodically
    logVerbose('Online and no pending upload. Setting status to IDLE.');
    updateSyncIndicator(SyncStatus.IDLE);
  }
}

function handleOfflineStatus() {
  logVerbose('Application went offline.');
  updateSyncIndicator(SyncStatus.OFFLINE); // Update UI
}

/**
 * Initializes online/offline event listeners.
 */
export function initializeOfflineHandling() {
  logVerbose('Initializing offline event listeners.');
  window.addEventListener('online', handleOnlineStatus);
  window.addEventListener('offline', handleOfflineStatus);

  // Set initial status based on current online state and pending flag
  if (!navigator.onLine) {
    handleOfflineStatus();
  } else if (isUploadPending() && getAccessToken()) {
    // If online, logged in, and pending, indicate pending until sync attempt happens
    updateSyncIndicator(SyncStatus.PENDING);
    // Optionally trigger an immediate sync attempt if pending?
    // handleOnlineStatus(); // Or let the initial sync handle it
  } else if (!getAccessToken()) {
    updateSyncIndicator(SyncStatus.NOT_CONNECTED);
  } else {
    // If online, logged in, and not pending, assume idle until sync check runs
    updateSyncIndicator(SyncStatus.IDLE);
  }
}
