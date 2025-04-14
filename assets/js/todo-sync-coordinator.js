'use strict';

import { getActiveFile, getLocalLastModified, getTodosFromStorage, setLastSyncTime } from './todo-storage.js';
import { getDbxInstance, getDropboxFileMetadata, downloadTodosFromDropbox, uploadTodosToDropbox } from './dropbox/api.js'; // upload/download will be refactored next
import { saveTodosFromText, loadTodos } from './todo-load.js';
import { updateSyncIndicator, showConflictModal, SyncStatus } from './dropbox/ui.js';
import { clearUploadPending, isUploadPending, setUploadPending } from './dropbox/offline.js'; // Assuming isUploadPending exists or will be added
import { logVerbose, warnVerbose } from './todo-logging.js';

let syncDebounceTimer = null;
const SYNC_DEBOUNCE_DELAY = 3000; // 3 seconds delay before syncing after local change

/**
 * Performs the core sync logic for the currently active file:
 * compares local and remote timestamps and handles conflicts.
 * This function replaces the old syncWithDropbox in api.js.
 */
export async function coordinateSync() {
  // Clear any pending debounce timer, as we are syncing now.
  clearTimeout(syncDebounceTimer);

  const activeFilePath = getActiveFile();
  if (!activeFilePath) {
    console.error("Sync failed: Could not determine active file path.");
    updateSyncIndicator(SyncStatus.ERROR, 'Sync failed: No active file', null);
    return;
  }
  logVerbose(`Starting coordinated sync for active file: ${activeFilePath}`);

  const dbx = getDbxInstance(); // Check if API is initialized
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot sync.');
    // Status should reflect NOT_CONNECTED if logged out, or initial state.
    // Don't force an error indicator here unless appropriate.
    return;
  }

  if (!navigator.onLine) {
    warnVerbose('Cannot sync, application is offline.');
    updateSyncIndicator(SyncStatus.OFFLINE, '', activeFilePath);
    // Ensure upload pending flag is set if there were recent changes
    // Note: The 'localDataChanged' event won't fire if offline changes occur *before* load.
    // Need to handle pending check on becoming online (in offline.js).
    return;
  }

  updateSyncIndicator(SyncStatus.SYNCING, '', activeFilePath);
  let finalStatus = SyncStatus.IDLE;
  let errorMessage = '';

  try {
    const localTimestampStr = getLocalLastModified(); // Gets timestamp for the active file
    const dropboxMeta = await getDropboxFileMetadata(activeFilePath); // Get metadata for the active file

    const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
    const dropboxDate = (dropboxMeta && dropboxMeta['.tag'] === 'file' && dropboxMeta.server_modified)
      ? new Date(dropboxMeta.server_modified)
      : null;

    logVerbose(`Sync Check for ${activeFilePath} - Local Last Modified: ${localDate?.toISOString() || 'N/A'}`);
    logVerbose(`Sync Check for ${activeFilePath} - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

    if (!dropboxMeta || !dropboxDate) {
      // No file/metadata on Dropbox for the active file
      if (localDate) {
        logVerbose(`Sync Status for ${activeFilePath}: No file/metadata on Dropbox. Uploading local version.`);
        const todos = getTodosFromStorage(); // Get current local todos
        const todoFileContent = todos.map(todo => todo.text).join('\n');
        // Call the refactored upload function (needs content)
        const uploadSuccess = await uploadTodosToDropbox(activeFilePath, todoFileContent);
        if (uploadSuccess) {
          setLastSyncTime(activeFilePath);
          clearUploadPending(activeFilePath);
          finalStatus = SyncStatus.IDLE;
        } else {
          finalStatus = SyncStatus.ERROR; // uploadTodosToDropbox should handle specific error UI
          errorMessage = `Failed initial upload for ${activeFilePath}`;
        }
      } else {
        logVerbose(`Sync Status for ${activeFilePath}: No file/metadata on Dropbox and no local data. Nothing to sync.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath); // Ensure flag is clear
      }
    } else if (!localDate) {
      // No local timestamp for active file, but Dropbox file exists
      logVerbose(`Sync Status for ${activeFilePath}: No local timestamp found. Downloading from Dropbox.`);
      // Call the refactored download function
      const downloadResult = await downloadTodosFromDropbox(activeFilePath);
      if (downloadResult && downloadResult.content !== null) {
        saveTodosFromText(downloadResult.content); // Save the downloaded content
        setLastSyncTime(activeFilePath); // Update sync time after successful download
        loadTodos($('#todo-list')); // Reload UI
        logVerbose(`Local storage (active file) overwritten with Dropbox content for ${activeFilePath}.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath);
      } else {
        console.error(`Failed to download Dropbox content for ${activeFilePath} for initial sync.`);
        finalStatus = SyncStatus.ERROR; // downloadTodosFromDropbox should handle specific error UI
        errorMessage = `Failed initial download for ${activeFilePath}`;
      }
    } else {
      // Both local and Dropbox timestamps exist
      const timeDiff = Math.abs(localDate.getTime() - dropboxDate.getTime());
      const buffer = 2000; // 2 seconds tolerance

      if (timeDiff <= buffer) {
        logVerbose(`Sync Status for ${activeFilePath}: Local and Dropbox timestamps are close. Assuming synced.`);
        finalStatus = SyncStatus.IDLE;
        // If an upload was pending (e.g., due to offline edit), but timestamps match now,
        // it implies another client synced our change or resolved a conflict. Clear the flag.
        clearUploadPending(activeFilePath);
      } else if (dropboxDate > localDate) {
        logVerbose(`Sync Status for ${activeFilePath}: Dropbox file is newer than local. Conflict or simple update needed.`);
        // Check if local changes are pending upload (meaning we edited offline/recently)
        if (isUploadPending(activeFilePath)) {
          logVerbose(`Conflict detected for ${activeFilePath}: Dropbox is newer, but local changes are pending.`);
          // CONFLICT RESOLUTION
          try {
            const userChoice = await showConflictModal(localDate, dropboxDate, activeFilePath);
            logVerbose(`Conflict resolved by user for ${activeFilePath}: Keep '${userChoice}'`);

            if (userChoice === 'local') {
              // User chose local: Upload local version
              logVerbose(`User chose local for ${activeFilePath}. Uploading local version...`);
              const todos = getTodosFromStorage();
              const todoFileContent = todos.map(todo => todo.text).join('\n');
              const uploadSuccess = await uploadTodosToDropbox(activeFilePath, todoFileContent);
              if (uploadSuccess) {
                setLastSyncTime(activeFilePath);
                clearUploadPending(activeFilePath);
                finalStatus = SyncStatus.IDLE;
              } else {
                finalStatus = SyncStatus.ERROR;
                errorMessage = `Failed upload after conflict (local chosen) for ${activeFilePath}`;
              }
            } else if (userChoice === 'dropbox') {
              // User chose Dropbox: Download Dropbox version
              logVerbose(`User chose Dropbox for ${activeFilePath}. Downloading Dropbox version...`);
              updateSyncIndicator(SyncStatus.SYNCING); // Show syncing for download
              const downloadResult = await downloadTodosFromDropbox(activeFilePath);
              if (downloadResult && downloadResult.content !== null) {
                saveTodosFromText(downloadResult.content);
                setLastSyncTime(activeFilePath);
                loadTodos($('#todo-list'));
                logVerbose(`Local storage overwritten with Dropbox content for ${activeFilePath}.`);
                finalStatus = SyncStatus.IDLE;
                clearUploadPending(activeFilePath); // Important: clear flag after resolving with Dropbox version
              } else {
                console.error(`Failed to download Dropbox content for ${activeFilePath} after conflict resolution.`);
                alert(`Error: Could not download the selected Dropbox version for ${activeFilePath}.`);
                finalStatus = SyncStatus.ERROR;
                errorMessage = `Failed download ${activeFilePath} after conflict`;
              }
            } else {
              logVerbose(`Conflict resolution cancelled for ${activeFilePath}. No sync action taken.`);
              finalStatus = SyncStatus.IDLE; // Revert to idle, but leave pending flag? Or clear? Let's clear.
              clearUploadPending(activeFilePath);
            }
          } catch (error) {
            console.error(`Error during conflict resolution for ${activeFilePath}:`, error);
            alert(`An error occurred during sync conflict resolution for ${activeFilePath}.`);
            finalStatus = SyncStatus.ERROR;
            errorMessage = `Conflict resolution error for ${activeFilePath}`;
          }
        } else {
          // Dropbox is newer, and no local changes pending -> Safe to just download
          logVerbose(`Sync Status for ${activeFilePath}: Dropbox is newer, no pending local changes. Downloading.`);
          updateSyncIndicator(SyncStatus.SYNCING); // Show syncing for download
          const downloadResult = await downloadTodosFromDropbox(activeFilePath);
          if (downloadResult && downloadResult.content !== null) {
            saveTodosFromText(downloadResult.content);
            setLastSyncTime(activeFilePath);
            loadTodos($('#todo-list'));
            logVerbose(`Local storage updated with newer Dropbox content for ${activeFilePath}.`);
            finalStatus = SyncStatus.IDLE;
          } else {
            console.error(`Failed to download newer Dropbox content for ${activeFilePath}.`);
            finalStatus = SyncStatus.ERROR;
            errorMessage = `Failed download of newer version for ${activeFilePath}`;
          }
        }
      } else { // localDate > dropboxDate
        logVerbose(`Sync Status for ${activeFilePath}: Local changes are newer than Dropbox. Uploading.`);
        const todos = getTodosFromStorage();
        const todoFileContent = todos.map(todo => todo.text).join('\n');
        const uploadSuccess = await uploadTodosToDropbox(activeFilePath, todoFileContent);
        if (uploadSuccess) {
          setLastSyncTime(activeFilePath);
          clearUploadPending(activeFilePath);
          finalStatus = SyncStatus.IDLE;
        } else {
          finalStatus = SyncStatus.ERROR;
          errorMessage = `Failed upload of newer local version for ${activeFilePath}`;
        }
      }
    }
  } catch (error) {
    console.error(`Error during coordinateSync for ${activeFilePath}:`, error);
    finalStatus = SyncStatus.ERROR;
    errorMessage = error.message || error?.error?.error_summary || 'Sync check failed';
    // Check for auth errors specifically? api.js functions should handle logout.
  } finally {
    // Update indicator based on the final status, unless it's already NOT_CONNECTED
    const currentDbx = getDbxInstance();
    if (currentDbx) { // Only update if we think we are connected
      updateSyncIndicator(finalStatus, errorMessage, activeFilePath);
    } else {
      updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null); // Ensure it shows disconnected
    }
  }
}

/**
 * Handles the custom event dispatched when local data is saved.
 * Triggers a debounced sync operation.
 * @param {CustomEvent} event - The event object.
 */
function handleLocalDataChange(event) {
  const { filePath } = event.detail;
  const activeFilePath = getActiveFile();

  // Only trigger sync if the change was for the currently active file
  if (filePath === activeFilePath) {
    logVerbose(`Local data changed for active file (${filePath}). Debouncing sync (${SYNC_DEBOUNCE_DELAY}ms)...`);

    // Set pending flag immediately if offline
    if (!navigator.onLine) {
      warnVerbose(`Offline: Setting upload pending flag for ${activeFilePath} due to local change.`);
      setUploadPending(activeFilePath);
    }

    // Clear previous debounce timer and start a new one
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      logVerbose(`Debounce timer finished for ${activeFilePath}. Triggering coordinateSync.`);
      coordinateSync(); // Call the main sync logic after delay
    }, SYNC_DEBOUNCE_DELAY);
  } else {
    logVerbose(`Local data changed event ignored for non-active file: ${filePath}`);
  }
}

/**
 * Initializes the sync coordinator.
 * Sets up the event listener for local data changes.
 */
export function initializeSyncCoordinator() {
  logVerbose('Initializing Sync Coordinator...');
  document.addEventListener('localDataChanged', handleLocalDataChange);
  logVerbose('Sync Coordinator initialized and listening for local data changes.');
  // Initial sync is triggered by auth/API initialization, not here.
}

// Example of how to potentially trigger sync manually if needed (e.g., refresh button)
// export function triggerManualSync() {
//   logVerbose("Manual sync triggered.");
//   coordinateSync();
// }
