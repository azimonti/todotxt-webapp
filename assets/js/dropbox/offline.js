'use strict';

import { logVerbose } from '../todo-logging.js';
import { updateSyncIndicator, SyncStatus } from './ui.js';
import { getAccessToken } from './auth.js';
import { getActiveFile } from '../todo-storage.js';

// Helper to generate dynamic keys for pending status
function getDynamicPendingKey(filePath) {
  if (!filePath) {
    console.warn(`Cannot generate dynamic pending key without a file path.`);
    return null;
  }
  const safePath = filePath.replace(/\//g, '_');
  return `pending_upload${safePath}`;
}


/**
 * Checks if there's a pending upload flagged for a specific file path.
 * @param {string} filePath - The path of the file to check.
 * @returns {boolean}
 */
export function isUploadPending(filePath) {
  const key = getDynamicPendingKey(filePath);
  if (!key) return false;
  const pending = localStorage.getItem(key) === 'true';
  return pending;
}

/**
 * Sets the pending upload flag for a specific file path in localStorage.
 * @param {string} filePath - The path of the file to mark as pending.
 */
export function setUploadPending(filePath) {
  const key = getDynamicPendingKey(filePath);
  if (!key) return;
  logVerbose(`Setting pending upload flag for ${filePath}.`);
  localStorage.setItem(key, 'true');
  // Update UI only if this is the active file
  if (filePath === getActiveFile()) {
    updateSyncIndicator(SyncStatus.PENDING, '', filePath);
  }
}

/**
 * Clears the pending upload flag for a specific file path from localStorage.
 * @param {string} filePath - The path of the file to clear.
 */
export function clearUploadPending(filePath) {
  const key = getDynamicPendingKey(filePath);
  if (!key) return;
  logVerbose(`Clearing pending upload flag for ${filePath}.`);
  localStorage.removeItem(key);
  // Don't immediately set to IDLE here, let the sync function determine final state
  // UI update will happen after sync attempt completes (or if switching files)
}


// --- Event Handlers ---

async function handleOnlineStatus() {
  logVerbose('Application came online.');
  const accessToken = getAccessToken();
  const activeFilePath = getActiveFile();

  if (!accessToken) {
    // If not logged in, status remains NOT_CONNECTED regardless of pending flags
    updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null);
    return;
  }

  // Check if the *active* file has a pending upload
  if (isUploadPending(activeFilePath)) {
    logVerbose(`Pending upload detected for active file (${activeFilePath}). Triggering sync...`);
    // Don't set SYNCING indicator here, let coordinateSync handle it
    // updateSyncIndicator(SyncStatus.SYNCING, '', activeFilePath);

    // Dynamically import and call the coordinator's sync function
    try {
      const { coordinateSync } = await import('../todo-sync-coordinator.js'); // Corrected path
      await coordinateSync(); // Attempt sync for the active file
      // coordinateSync will handle the final status update (IDLE or ERROR)
    } catch (err) {
      console.error(`Error triggering coordinateSync for ${activeFilePath} after coming online:`, err);
      // If coordinateSync fails, it should update the indicator itself.
      updateSyncIndicator(SyncStatus.ERROR, 'Sync after reconnect failed', activeFilePath);
      // Keep the flag set? coordinateSync should ideally clear it on success.
    }
  } else {
    // Came online, logged in, but no pending changes for the active file.
    // A full sync check might be triggered by initialization logic anyway.
    // Set status to IDLE for the active file for now.
    logVerbose(`Online and no pending upload for active file (${activeFilePath}). Setting status to IDLE.`);
    updateSyncIndicator(SyncStatus.IDLE, '', activeFilePath);
    // For now, let's only sync if pending changes were flagged.
  }
}

function handleOfflineStatus() {
  logVerbose('Application went offline.');
  const activeFilePath = getActiveFile(); // Get active file to update its indicator
  updateSyncIndicator(SyncStatus.OFFLINE, '', activeFilePath); // Update UI for the active file
}


/**
 * Initializes online/offline event listeners.
 */
export function initializeOfflineHandling() {
  logVerbose('Initializing offline event listeners.');
  window.addEventListener('online', handleOnlineStatus);
  window.addEventListener('offline', handleOfflineStatus);

  // Set initial status based on current online state and active file's pending flag
  const accessToken = getAccessToken();
  const activeFilePath = getActiveFile();

  if (!navigator.onLine) {
    // Use the handleOfflineStatus function to set the indicator correctly
    handleOfflineStatus();
  } else if (!accessToken) {
    // Not logged in -> Not Connected
    updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null);
  } else if (isUploadPending(activeFilePath)) {
    // Online, logged in, and active file has pending changes -> Pending
    updateSyncIndicator(SyncStatus.PENDING, '', activeFilePath);
    // The initial coordinateSync triggered by auth should handle the sync attempt.
    // No need to call handleOnlineStatus() here as it might cause duplicate syncs.
  } else {
    // Online, logged in, and active file has no pending changes -> Idle (until initial sync runs)
    updateSyncIndicator(SyncStatus.IDLE, '', activeFilePath);
  }
}
