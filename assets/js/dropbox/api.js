/* global Dropbox */ // Inform linter about globals
// import { TODO_FILENAME  } from './config.js'; // No longer needed, use dynamic paths
import { logVerbose, warnVerbose } from '../todo-logging.js';
import { updateSyncIndicator, showConflictModal, SyncStatus } from './ui.js';
import { setUploadPending, clearUploadPending } from './offline.js';
// Import function to get the active file path
import { getActiveFile } from '../todo-storage.js';
// Note: We dynamically import todo-storage.js and todo-load.js within functions
// to avoid circular dependencies and ensure they are loaded when needed.

let dbx = null; // The main Dropbox API object instance

/**
 * Initializes the main Dropbox API object with the access token.
 * Also triggers the initial sync check.
 * @param {string | null} token - The Dropbox access token, or null to de-initialize.
 */
export async function initializeDropboxApi(token) {
  if (!token) {
    logVerbose('De-initializing Dropbox API (token is null).');
    dbx = null;
    // Status should be handled by logout function or initial state
    return;
  }

  if (typeof Dropbox === 'undefined') {
    console.error('Dropbox SDK not loaded, cannot initialize API.');
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox SDK failed to load');
    return;
  }

  if (dbx && dbx.accessToken === token) {
    logVerbose('Dropbox API already initialized with the same token.');
    return; // Avoid re-initialization if token hasn't changed
  }

  logVerbose('Initializing Dropbox API...');
  try {
    dbx = new Dropbox.Dropbox({ accessToken: token });
    logVerbose('Dropbox API initialized successfully.');

    // Trigger initial sync check after API is ready
    await syncWithDropbox();
  } catch (error) {
    console.error('Error initializing Dropbox API object:', error);
    updateSyncIndicator(SyncStatus.ERROR, 'Failed to initialize Dropbox API');
    dbx = null; // Ensure dbx is null if initialization failed
  }
}

/**
 * Fetches metadata for a specific todo list file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/todo.txt').
 * @returns {Promise<DropboxTypes.files.FileMetadataReference | DropboxTypes.files.FolderMetadataReference | DropboxTypes.files.DeletedMetadataReference | null>} A promise that resolves with the file metadata object, or null if an error occurs or the file doesn't exist.
 */
export async function getDropboxFileMetadata(filePath) {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot get metadata.');
    return null;
  }
  if (!filePath) {
    console.error('getDropboxFileMetadata called without filePath.');
    return null;
  }

  try {
    logVerbose(`Fetching metadata for ${filePath} from Dropbox...`);
    const response = await dbx.filesGetMetadata({ path: filePath });
    logVerbose(`Successfully fetched metadata for ${filePath}:`, response.result);
    return response.result; // Contains server_modified, size, etc.
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox. No metadata available.`);
      return null; // Return null if file doesn't exist yet
    }
    // Log the full error object for more details
    console.error(`Full error object fetching metadata for ${filePath}:`, error);
    console.error(`Error fetching metadata for ${filePath} from Dropbox:`, error?.error?.error_summary || error);
    // Don't alert here, let caller handle UI feedback
    return null; // Return null on other errors
  }
}

/**
 * Downloads a specific todo list file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/todo.txt').
 * @returns {Promise<string|null>} A promise that resolves with the file content as a string, or null if an error occurs or the file doesn't exist.
 */
export async function downloadTodosFromDropbox(filePath) {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot download.');
    return null;
  }
   if (!filePath) {
    console.error('downloadTodosFromDropbox called without filePath.');
    return null;
  }

  try {
    logVerbose(`Downloading ${filePath} from Dropbox...`);
    updateSyncIndicator(SyncStatus.SYNCING); // Indicate download activity
    const response = await dbx.filesDownload({ path: filePath });
    logVerbose(`Successfully downloaded metadata for ${filePath}:`, response);

    // filesDownload returns metadata, the content is a blob that needs to be read
    const fileBlob = response.result.fileBlob;
    if (fileBlob) {
      const text = await fileBlob.text();
      logVerbose(`Downloaded content for ${filePath} (${text.length} chars).`);
      // Don't set IDLE here, let caller decide final status
      return text;
    } else {
      console.warn(`Downloaded file blob is missing for ${filePath}.`);
      updateSyncIndicator(SyncStatus.ERROR, `Downloaded ${filePath} empty`);
      return null;
    }
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox. Assuming first sync.`);
      // This is not necessarily an error state for the caller
      return null; // Return null if file doesn't exist yet
    }
    console.error(`Error downloading ${filePath} from Dropbox:`, error?.error?.error_summary || error);
    // Don't alert here, let caller handle UI feedback
    updateSyncIndicator(SyncStatus.ERROR, `Download ${filePath} failed`);
    return null; // Return null on other errors
  }
}


/**
 * Uploads the todo list for a specific file path from local storage to Dropbox,
 * performing a conflict check first. Handles offline status by setting a pending flag.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/todo.txt').
 */
export async function uploadTodosToDropbox(filePath) {
  if (!filePath) {
    console.error('uploadTodosToDropbox called without filePath.');
    updateSyncIndicator(SyncStatus.ERROR, 'Upload error: No file path');
    return;
  }

  // Check online status first
  if (!navigator.onLine) {
    warnVerbose(`Application is offline. Setting pending upload flag for ${filePath}.`);
    setUploadPending(filePath); // Pass filePath to indicate which file needs upload (offline.js needs update)
    return; // Don't proceed with upload
  }

  // Check if Dropbox API is initialized
  if (!dbx) {
    warnVerbose(`Dropbox API not initialized. Cannot upload ${filePath}.`);
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox not initialized');
    return;
  }

  logVerbose(`Attempting to upload local changes for ${filePath} (Online)...`);
  updateSyncIndicator(SyncStatus.SYNCING); // Show syncing status

  let uploadError = null; // Track errors to update indicator
  let statusAfterUpload = SyncStatus.IDLE; // Assume success

  try {
    // --- Pre-upload Conflict Check ---
    // Dynamically import necessary functions from the main app
    // Note: getLocalLastModified and getTodosFromStorage now work on the *active* file implicitly
    // We need to ensure this upload function is only called for the *active* file,
    // or modify storage functions to accept filePath if needed elsewhere.
    // For now, assume this is called in the context of the active file.
    const { getLocalLastModified, getTodosFromStorage } = await import('../todo-storage.js');
    const { saveTodosFromText, loadTodos } = await import('../todo-load.js');

    // Get timestamp and metadata for the specific file path
    const localTimestampStr = getLocalLastModified(); // Gets timestamp for the *active* file
    const dropboxMeta = await getDropboxFileMetadata(filePath); // Gets metadata for the specific file

    // Check if the file being uploaded IS the active file. If not, the localTimestampStr might be wrong.
    // This highlights a potential issue: uploadTodosToDropbox might be called for a non-active file.
    // Let's assume for now it's only called for the active file via syncWithDropbox.
    if (filePath !== getActiveFile()) {
        console.warn(`uploadTodosToDropbox called for non-active file "${filePath}" but using active file's timestamp for conflict check. This might lead to incorrect behavior.`);
        // How to handle this? Maybe getLocalLastModified should accept filePath?
        // For now, proceed with caution.
    }


    const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
    // Ensure dropboxMeta is a FileMetadataReference before accessing server_modified
    const dropboxDate = (dropboxMeta && dropboxMeta['.tag'] === 'file' && dropboxMeta.server_modified)
      ? new Date(dropboxMeta.server_modified)
      : null;

    logVerbose(`Pre-upload Check for ${filePath} - Local Last Saved (Active File): ${localDate?.toISOString() || 'N/A'}`);
    logVerbose(`Pre-upload Check for ${filePath} - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

    let proceedWithUpload = true; // Flag to control if upload happens

    // If Dropbox file exists and is newer than the last local save (before this current change)
    if (dropboxMeta && dropboxDate && localDate && dropboxDate > localDate) {
      logVerbose(`Pre-upload Check for ${filePath}: Conflict detected! Dropbox is newer than the last saved local state.`);
      proceedWithUpload = false; // Don't upload unless user chooses 'local'
      // Trigger conflict resolution instead of uploading
      try {
        // Note: We pass the *previous* localDate for comparison in the modal
        const userChoice = await showConflictModal(localDate, dropboxDate, filePath); // Pass filePath to modal
        logVerbose(`Conflict resolved by user for ${filePath} during upload attempt: Keep '${userChoice}'`);

        if (userChoice === 'local') {
          // User chose local again, proceed with the upload (overwrite Dropbox)
          logVerbose(`User confirmed keeping local for ${filePath}. Proceeding with upload...`);
          proceedWithUpload = true; // Allow upload to happen
        } else if (userChoice === 'dropbox') {
          // User chose Dropbox: Download Dropbox version, overwrite local, discard current change implicitly
          logVerbose(`User chose Dropbox for ${filePath}. Downloading Dropbox version...`);
          updateSyncIndicator(SyncStatus.SYNCING); // Show syncing for download
          const dropboxContent = await downloadTodosFromDropbox(filePath); // Download specific file
          if (dropboxContent !== null) {
            // saveTodosFromText assumes active file. This is correct if conflict was for active file.
            saveTodosFromText(dropboxContent);
            loadTodos($('#todo-list')); // Reload UI using jQuery selector from original code
            logVerbose(`Local storage (active file) overwritten with Dropbox content for ${filePath}.`);
            statusAfterUpload = SyncStatus.IDLE; // Success
            clearUploadPending(filePath); // Clear flag for this file (offline.js needs update)
          } else {
            console.error(`Failed to download Dropbox content for ${filePath} after conflict resolution during upload.`);
            alert(`Error: Could not download the selected Dropbox version for ${filePath}.`);
            statusAfterUpload = SyncStatus.ERROR; // Error
            uploadError = new Error(`Failed download ${filePath} after conflict`);
          }
          // Stop the upload process as we downloaded instead
        } else {
          logVerbose(`Conflict resolution cancelled for ${filePath} during upload attempt.`);
          alert(`Upload for ${filePath} cancelled due to unresolved conflict.`);
          statusAfterUpload = SyncStatus.IDLE; // Revert to idle as no action taken
          // TODO: Maybe revert the local change that triggered this? Complex. For now, just cancel upload.
        }
      } catch (error) {
        console.error(`Error during conflict resolution for ${filePath} triggered by upload:`, error);
        alert(`An error occurred during sync conflict resolution for ${filePath}. Upload cancelled.`);
        statusAfterUpload = SyncStatus.ERROR; // Error
        uploadError = error;
        proceedWithUpload = false;
      }
    }
    // --- End Pre-upload Conflict Check ---

    // Proceed with upload if no conflict or user chose 'local' in conflict resolution
    if (proceedWithUpload) {
      logVerbose(`Proceeding with upload for ${filePath}...`);
      // getTodosFromStorage gets todos for the *active* file.
      // This is correct ONLY if filePath === getActiveFile().
      // If we need to upload non-active files, getTodosFromStorage needs modification.
      // Assuming sync logic only calls this for the active file for now.
      const todos = getTodosFromStorage(); // Get the *current* todos for the active file

      // Format todos as a plain text string, one task per line
      const todoFileContent = todos.map(todo => todo.text).join('\n');

      logVerbose(`Uploading ${todos.length} tasks to ${filePath} on Dropbox...`);
      const response = await dbx.filesUpload({
        path: filePath, // Use the specific file path
        contents: todoFileContent,
        mode: 'overwrite', // Overwrite the file each time
        autorename: false, // Don't rename if conflict (overwrite handles it)
        mute: true // Don't trigger desktop notifications for the user
      });
      logVerbose(`Successfully uploaded todos to ${filePath} on Dropbox:`, response);
      clearUploadPending(filePath); // Clear flag for this file (offline.js needs update)
      statusAfterUpload = SyncStatus.IDLE; // Success
    }
  } catch (error) {
    console.error(`Error during upload process for ${filePath}:`, error);
    alert(`Error syncing ${filePath} with Dropbox: ${error?.error?.error_summary || error}`);
    statusAfterUpload = SyncStatus.ERROR; // Error
    uploadError = error;
    // If upload fails while online, should we set pending flag to retry?
    // For now, let's not set the flag automatically on online errors.
  } finally {
    // Update indicator based on the final status after all operations
    updateSyncIndicator(statusAfterUpload, uploadError?.message || uploadError?.error?.error_summary);
  }
}

/**
 * Renames a file on Dropbox.
 * @param {string} oldPath - The current full path of the file on Dropbox.
 * @param {string} newPath - The desired new full path of the file on Dropbox.
 * @returns {Promise<boolean>} A promise that resolves with true if successful, false otherwise.
 */
export async function renameDropboxFile(oldPath, newPath) {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot rename file.');
    return false;
  }
  if (!oldPath || !newPath) {
    console.error('renameDropboxFile called without oldPath or newPath.');
    return false;
  }
  if (oldPath === newPath) {
      console.warn('Rename cancelled: old path and new path are the same.');
      return false; // Or true? Let's say false as no action taken.
  }

  logVerbose(`Attempting to rename Dropbox file from "${oldPath}" to "${newPath}"...`);
  try {
    // Use filesMoveV2 for renaming
    const response = await dbx.filesMoveV2({
      from_path: oldPath,
      to_path: newPath,
      allow_shared_folder: false, // Adjust as needed
      autorename: false, // Do not autorename, we want an error if the target exists
      allow_ownership_transfer: false // Adjust as needed
    });
    logVerbose(`Successfully renamed file on Dropbox:`, response.result);
    return true;
  } catch (error) {
    console.error(`Error renaming file from "${oldPath}" to "${newPath}" on Dropbox:`, error?.error?.error_summary || error);
    // Provide more specific feedback if possible
    let userMessage = `Failed to rename file on Dropbox.`;
    if (error?.error?.error_summary?.includes('to/conflict/file')) {
        userMessage = `Failed to rename: A file already exists at "${newPath}".`;
    } else if (error?.error?.error_summary?.includes('from_lookup/not_found')) {
        userMessage = `Failed to rename: The original file "${oldPath}" was not found.`;
    }
    alert(userMessage); // Alert the user
    return false;
  }
}

/**
 * Deletes a file on Dropbox.
 * @param {string} filePath - The full path of the file to delete on Dropbox.
 * @returns {Promise<boolean>} A promise that resolves with true if successful, false otherwise.
 */
export async function deleteDropboxFile(filePath) {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot delete file.');
    return false;
  }
  if (!filePath) {
    console.error('deleteDropboxFile called without filePath.');
    return false;
  }
  // Optional: Add check to prevent deleting root or essential files if needed

  logVerbose(`Attempting to delete Dropbox file: "${filePath}"...`);
  try {
    const response = await dbx.filesDeleteV2({ path: filePath });
    logVerbose(`Successfully deleted file on Dropbox:`, response.result);
    return true;
  } catch (error) {
    console.error(`Error deleting file "${filePath}" on Dropbox:`, error?.error?.error_summary || error);
     // Provide more specific feedback if possible
    let userMessage = `Failed to delete file on Dropbox.`;
    if (error?.error?.error_summary?.includes('path_lookup/not_found')) {
        // If file not found, maybe treat as success for deletion? Or specific error?
        // For now, let's treat not found as a failure to delete what was intended.
        userMessage = `Failed to delete: The file "${filePath}" was not found on Dropbox.`;
    }
    // Use notification instead of alert
    if (typeof showNotification === 'function') {
      showNotification(userMessage, 'alert');
    } else {
      alert(userMessage); // Fallback if notification function isn't global
    }
    return false;
  }
}


/**
 * Performs the core sync logic for the currently active file:
 * compares local and remote timestamps and handles conflicts.
 */
export async function syncWithDropbox() {
  // Get the currently active file path
  const activeFilePath = getActiveFile();
  if (!activeFilePath) {
    console.error("Sync failed: Could not determine active file path.");
    updateSyncIndicator(SyncStatus.ERROR, 'Sync failed: No active file');
    return;
  }
  logVerbose(`Starting sync check for active file: ${activeFilePath}`);

  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot sync.');
    // Don't set error indicator here, maybe initial state is NOT_CONNECTED
    return;
  }
  if (!navigator.onLine) {
    warnVerbose('Cannot sync, application is offline.');
    updateSyncIndicator(SyncStatus.OFFLINE); // Ensure indicator shows offline
    return;
  }
  if (!navigator.onLine) {
    warnVerbose(`Cannot sync ${activeFilePath}, application is offline.`);
    updateSyncIndicator(SyncStatus.OFFLINE); // Ensure indicator shows offline
    return;
  }

  // logVerbose('Starting Dropbox sync check...'); // Moved up
  updateSyncIndicator(SyncStatus.SYNCING);
  let finalStatus = SyncStatus.IDLE; // Assume success initially
  let errorMessage = '';

  try {
    // Dynamically import necessary functions from the main app
    // Dynamically import necessary functions from the main app
    // getLocalLastModified now works on the active file implicitly
    const { getLocalLastModified } = await import('../todo-storage.js');
    const { saveTodosFromText, loadTodos } = await import('../todo-load.js');

    const localTimestampStr = getLocalLastModified(); // Gets timestamp for the active file
    const dropboxMeta = await getDropboxFileMetadata(activeFilePath); // Get metadata for the active file

    const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
    // Ensure dropboxMeta is a FileMetadataReference before accessing server_modified
    const dropboxDate = (dropboxMeta && dropboxMeta['.tag'] === 'file' && dropboxMeta.server_modified)
      ? new Date(dropboxMeta.server_modified)
      : null;

    logVerbose(`Sync Check for ${activeFilePath} - Local Last Modified: ${localDate?.toISOString() || 'N/A'}`);
    logVerbose(`Sync Check for ${activeFilePath} - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

    if (!dropboxMeta || !dropboxDate) {
      // No file on Dropbox yet OR failed to get metadata for the active file
      if (localDate) {
        logVerbose(`Sync Status for ${activeFilePath}: No file/metadata on Dropbox. Uploading local version.`);
        // Upload the active file
        await uploadTodosToDropbox(activeFilePath); // This will set its own status
        // Status is set within uploadTodosToDropbox's finally block
      } else {
        logVerbose(`Sync Status for ${activeFilePath}: No file/metadata on Dropbox and no local data. Nothing to sync.`);
        finalStatus = SyncStatus.IDLE;
      }
      // No need to return here, let finally block handle the status update
    } else if (!localDate) {
      // No local timestamp for active file, but Dropbox file exists
      logVerbose(`Sync Status for ${activeFilePath}: No local timestamp found. Downloading from Dropbox.`);
      const dropboxContent = await downloadTodosFromDropbox(activeFilePath); // Download active file
      if (dropboxContent !== null) {
        // saveTodosFromText and loadTodos operate on the active file implicitly
        saveTodosFromText(dropboxContent);
        loadTodos($('#todo-list')); // Reload UI
        logVerbose(`Local storage (active file) overwritten with Dropbox content for ${activeFilePath}.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath); // Clear any pending flag for this file (offline.js needs update)
      } else {
        console.error(`Failed to download Dropbox content for ${activeFilePath} for initial sync.`);
        finalStatus = SyncStatus.ERROR;
        errorMessage = `Failed initial download for ${activeFilePath}`;
      }
      // No need to return here, let finally block handle the status update
    } else {
      // Both local and Dropbox timestamps exist, compare them
      const timeDiff = Math.abs(localDate.getTime() - dropboxDate.getTime());
      const buffer = 2000; // 2 seconds in milliseconds

      if (timeDiff <= buffer) {
        logVerbose(`Sync Status for ${activeFilePath}: Local and Dropbox timestamps are roughly the same. No action needed.`);
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(activeFilePath); // Ensure pending flag is clear if synced (offline.js needs update)
      } else if (dropboxDate > localDate) {
        logVerbose(`Sync Status for ${activeFilePath}: Dropbox file is newer than local. Showing conflict modal.`);
        // CONFLICT DETECTED!
        try {
          const userChoice = await showConflictModal(localDate, dropboxDate, activeFilePath); // Pass file path
          logVerbose(`Conflict resolved by user for ${activeFilePath}: Keep '${userChoice}'`);

          if (userChoice === 'local') {
            // User chose to keep local: Upload local version to overwrite Dropbox
            logVerbose(`User chose local for ${activeFilePath}. Uploading local version...`);
            await uploadTodosToDropbox(activeFilePath); // Upload active file
            // Status is set within uploadTodosToDropbox's finally block
          } else if (userChoice === 'dropbox') {
            // User chose to keep Dropbox: Download Dropbox version to overwrite local
            logVerbose(`User chose Dropbox for ${activeFilePath}. Downloading Dropbox version...`);
            updateSyncIndicator(SyncStatus.SYNCING); // Show syncing for download
            const dropboxContent = await downloadTodosFromDropbox(activeFilePath); // Download active file
            // --- Start Restored Block ---
            if (dropboxContent !== null) {
              // saveTodosFromText and loadTodos operate on the active file implicitly
              saveTodosFromText(dropboxContent);
              loadTodos($('#todo-list')); // Reload UI
              logVerbose(`Local storage (active file) overwritten with Dropbox content for ${activeFilePath}.`);
              finalStatus = SyncStatus.IDLE;
              clearUploadPending(activeFilePath); // Clear pending flag for this file (offline.js needs update)
            } else {
              console.error(`Failed to download Dropbox content for ${activeFilePath} after conflict resolution.`);
              alert(`Error: Could not download the selected Dropbox version for ${activeFilePath}.`);
              finalStatus = SyncStatus.ERROR;
              errorMessage = `Failed download ${activeFilePath} after conflict`;
            }
          } else {
            logVerbose(`Conflict resolution cancelled or closed without choice for ${activeFilePath}.`);
            finalStatus = SyncStatus.IDLE; // No action taken, assume idle for now
            // Keep pending flag if it was set? Or clear it? Let's clear it as user cancelled.
            clearUploadPending(activeFilePath); // (offline.js needs update)
          }
        } catch (error) {
          console.error(`Error during conflict resolution for ${activeFilePath}:`, error);
          alert(`An error occurred during sync conflict resolution for ${activeFilePath}.`);
          finalStatus = SyncStatus.ERROR;
          errorMessage = `Conflict resolution error for ${activeFilePath}`;
        }

      } else { // localDate > dropboxDate
        logVerbose(`Sync Status for ${activeFilePath}: Local changes are newer than Dropbox. Uploading local version.`);
        await uploadTodosToDropbox(activeFilePath); // Upload active file
        // Status is set within uploadTodosToDropbox's finally block
      }
    }
  } catch (error) { // This catch corresponds to the main try block of syncWithDropbox
    console.error('Error during sync check:', error);
    finalStatus = SyncStatus.ERROR;
    errorMessage = error.message || error?.error?.error_summary || 'Sync check failed';
  } finally {
    // Only update if the status wasn't already set by an internal call (like upload)
    // Check currentSyncStatus before updating? Or just update always? Let's update always.
    updateSyncIndicator(finalStatus, errorMessage);
  }
}
