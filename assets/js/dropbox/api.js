/* global Dropbox */ // Inform linter about globals
import { TODO_FILENAME  } from './config.js';
import { logVerbose, warnVerbose } from '../todo-logging.js';
import { updateSyncIndicator, showConflictModal, SyncStatus } from './ui.js';
import { setUploadPending, clearUploadPending } from './offline.js';
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
 * Fetches metadata for the todo list file from Dropbox.
 * @returns {Promise<DropboxTypes.files.FileMetadataReference | DropboxTypes.files.FolderMetadataReference | DropboxTypes.files.DeletedMetadataReference | null>} A promise that resolves with the file metadata object, or null if an error occurs or the file doesn't exist.
 */
export async function getDropboxFileMetadata() {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot get metadata.');
    return null;
  }

  try {
    logVerbose(`Fetching metadata for ${TODO_FILENAME} from Dropbox...`);
    const response = await dbx.filesGetMetadata({ path: TODO_FILENAME });
    logVerbose('Successfully fetched file metadata:', response.result);
    return response.result; // Contains server_modified, size, etc.
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${TODO_FILENAME} not found on Dropbox. No metadata available.`);
      return null; // Return null if file doesn't exist yet
    }
    // Log the full error object for more details
    console.error('Full error object fetching metadata:', error);
    console.error('Error fetching file metadata from Dropbox:', error?.error?.error_summary || error);
    // Don't alert here, let caller handle UI feedback
    return null; // Return null on other errors
  }
}

/**
 * Downloads the todo list file from Dropbox.
 * @returns {Promise<string|null>} A promise that resolves with the file content as a string, or null if an error occurs or the file doesn't exist.
 */
export async function downloadTodosFromDropbox() {
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot download.');
    return null;
  }

  try {
    logVerbose(`Downloading ${TODO_FILENAME} from Dropbox...`);
    updateSyncIndicator(SyncStatus.SYNCING); // Indicate download activity
    const response = await dbx.filesDownload({ path: TODO_FILENAME });
    logVerbose('Successfully downloaded todos file metadata:', response);

    // filesDownload returns metadata, the content is a blob that needs to be read
    const fileBlob = response.result.fileBlob;
    if (fileBlob) {
      const text = await fileBlob.text();
      logVerbose(`Downloaded content (${text.length} chars).`);
      // Don't set IDLE here, let caller decide final status
      return text;
    } else {
      console.warn('Downloaded file blob is missing.');
      updateSyncIndicator(SyncStatus.ERROR, 'Downloaded file empty');
      return null;
    }
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${TODO_FILENAME} not found on Dropbox. Assuming first sync.`);
      // This is not necessarily an error state for the caller
      return null; // Return null if file doesn't exist yet
    }
    console.error('Error downloading file from Dropbox:', error?.error?.error_summary || error);
    // Don't alert here, let caller handle UI feedback
    updateSyncIndicator(SyncStatus.ERROR, 'Download failed');
    return null; // Return null on other errors
  }
}


/**
 * Uploads the current todo list from local storage to Dropbox, performing a conflict check first.
 * Handles offline status by setting a pending flag.
 */
export async function uploadTodosToDropbox() {
  // Check online status first
  if (!navigator.onLine) {
    warnVerbose('Application is offline. Setting pending upload flag.');
    setUploadPending(); // This now updates the indicator
    return; // Don't proceed with upload
  }

  // Check if Dropbox API is initialized
  if (!dbx) {
    warnVerbose('Dropbox API not initialized. Cannot upload.');
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox not initialized');
    return;
  }

  logVerbose('Attempting to upload local changes (Online)...');
  updateSyncIndicator(SyncStatus.SYNCING); // Show syncing status

  let uploadError = null; // Track errors to update indicator
  let statusAfterUpload = SyncStatus.IDLE; // Assume success

  try {
    // --- Pre-upload Conflict Check ---
    // Dynamically import necessary functions from the main app
    const { getLocalLastModified } = await import('../todo-storage.js');
    const { saveTodosFromText, loadTodos } = await import('../todo-load.js');
    const { getTodosFromStorage } = await import('../todo-storage.js');

    const localTimestampStr = getLocalLastModified(); // Timestamp *before* the current save triggering this upload
    const dropboxMeta = await getDropboxFileMetadata();
    const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
    // Ensure dropboxMeta is a FileMetadataReference before accessing server_modified
    const dropboxDate = (dropboxMeta && dropboxMeta['.tag'] === 'file' && dropboxMeta.server_modified)
      ? new Date(dropboxMeta.server_modified)
      : null;

    logVerbose(`Pre-upload Check - Local Last Saved: ${localDate?.toISOString() || 'N/A'}`);
    logVerbose(`Pre-upload Check - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

    let proceedWithUpload = true; // Flag to control if upload happens

    // If Dropbox file exists and is newer than the last local save (before this current change)
    if (dropboxMeta && dropboxDate && localDate && dropboxDate > localDate) {
      logVerbose('Pre-upload Check: Conflict detected! Dropbox is newer than the last saved local state.');
      proceedWithUpload = false; // Don't upload unless user chooses 'local'
      // Trigger conflict resolution instead of uploading
      try {
        // Note: We pass the *previous* localDate for comparison in the modal
        const userChoice = await showConflictModal(localDate, dropboxDate);
        logVerbose(`Conflict resolved by user during upload attempt: Keep '${userChoice}'`);

        if (userChoice === 'local') {
          // User chose local again, proceed with the upload (overwrite Dropbox)
          logVerbose('User confirmed keeping local. Proceeding with upload...');
          proceedWithUpload = true; // Allow upload to happen
        } else if (userChoice === 'dropbox') {
          // User chose Dropbox: Download Dropbox version, overwrite local, discard current change implicitly
          logVerbose('User chose Dropbox. Downloading Dropbox version...');
          updateSyncIndicator(SyncStatus.SYNCING); // Show syncing for download
          const dropboxContent = await downloadTodosFromDropbox();
          if (dropboxContent !== null) {
            saveTodosFromText(dropboxContent);
            loadTodos($('#todo-list')); // Reload UI using jQuery selector from original code
            logVerbose('Local storage overwritten with Dropbox content.');
            statusAfterUpload = SyncStatus.IDLE; // Success
            clearUploadPending(); // Clear flag as we resolved by downloading
          } else {
            console.error('Failed to download Dropbox content after conflict resolution during upload.');
            alert('Error: Could not download the selected Dropbox version.');
            statusAfterUpload = SyncStatus.ERROR; // Error
            uploadError = new Error('Failed download after conflict');
          }
          // Stop the upload process as we downloaded instead
        } else {
          logVerbose('Conflict resolution cancelled during upload attempt.');
          alert('Upload cancelled due to unresolved conflict.');
          statusAfterUpload = SyncStatus.IDLE; // Revert to idle as no action taken
          // TODO: Maybe revert the local change that triggered this? Complex. For now, just cancel upload.
        }
      } catch (error) {
        console.error('Error during conflict resolution triggered by upload:', error);
        alert('An error occurred during sync conflict resolution. Upload cancelled.');
        statusAfterUpload = SyncStatus.ERROR; // Error
        uploadError = error;
        proceedWithUpload = false;
      }
    }
    // --- End Pre-upload Conflict Check ---

    // Proceed with upload if no conflict or user chose 'local' in conflict resolution
    if (proceedWithUpload) {
      logVerbose('Proceeding with upload...');
      const todos = getTodosFromStorage(); // Get the *current* todos

      // Format todos as a plain text string, one task per line
      const todoFileContent = todos.map(todo => todo.text).join('\n');

      logVerbose(`Uploading ${todos.length} tasks to Dropbox...`);
      const response = await dbx.filesUpload({
        path: TODO_FILENAME,
        contents: todoFileContent,
        mode: 'overwrite', // Overwrite the file each time
        autorename: false, // Don't rename if conflict (overwrite handles it)
        mute: true // Don't trigger desktop notifications for the user
      });
      logVerbose('Successfully uploaded todos to Dropbox:', response);
      clearUploadPending(); // Clear flag on successful upload
      statusAfterUpload = SyncStatus.IDLE; // Success
    }
  } catch (error) {
    console.error('Error during upload process:', error);
    alert(`Error syncing with Dropbox: ${error?.error?.error_summary || error}`);
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
 * Performs the core sync logic: compares local and remote timestamps and handles conflicts.
 */
export async function syncWithDropbox() {
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

  logVerbose('Starting Dropbox sync check...');
  updateSyncIndicator(SyncStatus.SYNCING);
  let finalStatus = SyncStatus.IDLE; // Assume success initially
  let errorMessage = '';

  try {
    // Dynamically import necessary functions from the main app
    const { getLocalLastModified } = await import('../todo-storage.js');
    const { saveTodosFromText, loadTodos } = await import('../todo-load.js');

    const localTimestampStr = getLocalLastModified();
    const dropboxMeta = await getDropboxFileMetadata();

    const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
    // Ensure dropboxMeta is a FileMetadataReference before accessing server_modified
    const dropboxDate = (dropboxMeta && dropboxMeta['.tag'] === 'file' && dropboxMeta.server_modified)
      ? new Date(dropboxMeta.server_modified)
      : null;

    logVerbose(`Sync Check - Local Last Modified: ${localDate?.toISOString() || 'N/A'}`);
    logVerbose(`Sync Check - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

    if (!dropboxMeta || !dropboxDate) {
      // No file on Dropbox yet OR failed to get metadata
      if (localDate) {
        logVerbose('Sync Status: No file/metadata on Dropbox. Uploading local version.');
        await uploadTodosToDropbox(); // This will set its own status
        // Status is set within uploadTodosToDropbox's finally block
        // finalStatus = currentSyncStatus; // REMOVED: Cannot access currentSyncStatus here
        // errorMessage = finalStatus === SyncStatus.ERROR ? 'Upload failed' : ''; // Error message handled in finally
      } else {
        logVerbose('Sync Status: No file/metadata on Dropbox and no local data. Nothing to sync.');
        finalStatus = SyncStatus.IDLE; // Or NOT_CONNECTED if that's more appropriate? Let's use IDLE.
      }
      return; // Upload handles status update or we determined IDLE
    }

    if (!localDate) {
      // No local timestamp, but Dropbox file exists
      logVerbose('Sync Status: No local timestamp found. Downloading from Dropbox.');
      const dropboxContent = await downloadTodosFromDropbox();
      if (dropboxContent !== null) {
        saveTodosFromText(dropboxContent);
        loadTodos($('#todo-list')); // Reload UI
        logVerbose('Local storage overwritten with Dropbox content.');
        finalStatus = SyncStatus.IDLE;
        clearUploadPending(); // Clear any pending flag after successful download
      } else {
        console.error('Failed to download Dropbox content for initial sync.');
        finalStatus = SyncStatus.ERROR;
        errorMessage = 'Failed initial download';
      }
      return; // Status updated within this block or finally
    }

    // Compare timestamps (allow for a small buffer, e.g., 2 seconds)
    const timeDiff = Math.abs(localDate.getTime() - dropboxDate.getTime());
    const buffer = 2000; // 2 seconds in milliseconds

    if (timeDiff <= buffer) {
      logVerbose('Sync Status: Local and Dropbox timestamps are roughly the same. No action needed.');
      finalStatus = SyncStatus.IDLE;
      clearUploadPending(); // Ensure pending flag is clear if synced
    } else if (dropboxDate > localDate) {
      logVerbose('Sync Status: Dropbox file is newer than local. Showing conflict modal.');
      // CONFLICT DETECTED!
      try {
        const userChoice = await showConflictModal(localDate, dropboxDate);
        logVerbose(`Conflict resolved by user: Keep '${userChoice}'`);

        if (userChoice === 'local') {
          // User chose to keep local: Upload local version to overwrite Dropbox
          logVerbose('User chose local. Uploading local version...');
          await uploadTodosToDropbox(); // Upload will set status
          // Status is set within uploadTodosToDropbox's finally block
          // finalStatus = currentSyncStatus; // REMOVED: Cannot access currentSyncStatus here
          // errorMessage = finalStatus === SyncStatus.ERROR ? 'Upload failed after conflict' : ''; // Error message handled in finally
        } else if (userChoice === 'dropbox') {
          // User chose to keep Dropbox: Download Dropbox version to overwrite local
          logVerbose('User chose Dropbox. Downloading Dropbox version...');
          updateSyncIndicator(SyncStatus.SYNCING); // Show syncing for download
          const dropboxContent = await downloadTodosFromDropbox();
          if (dropboxContent !== null) {
            saveTodosFromText(dropboxContent);
            loadTodos($('#todo-list')); // Reload UI
            logVerbose('Local storage overwritten with Dropbox content.');
            finalStatus = SyncStatus.IDLE;
            clearUploadPending(); // Clear pending flag after successful download/overwrite
          } else {
            console.error('Failed to download Dropbox content after conflict resolution.');
            alert('Error: Could not download the selected Dropbox version.');
            finalStatus = SyncStatus.ERROR;
            errorMessage = 'Failed download after conflict';
          }
        } else {
          logVerbose('Conflict resolution cancelled or closed without choice.');
          finalStatus = SyncStatus.IDLE; // No action taken, assume idle for now
          // Keep pending flag if it was set? Or clear it? Let's clear it as user cancelled.
          clearUploadPending();
        }
      } catch (error) {
        console.error('Error during conflict resolution:', error);
        alert('An error occurred during sync conflict resolution.');
        finalStatus = SyncStatus.ERROR;
        errorMessage = 'Conflict resolution error';
      }

    } else { // localDate > dropboxDate
      logVerbose('Sync Status: Local changes are newer than Dropbox. Uploading local version.');
      await uploadTodosToDropbox(); // Upload will set status
      // Status is set within uploadTodosToDropbox's finally block
      // finalStatus = currentSyncStatus; // REMOVED: Cannot access currentSyncStatus here
      // errorMessage = finalStatus === SyncStatus.ERROR ? 'Upload failed' : ''; // Error message handled in finally
    }
  } catch (error) {
    console.error('Error during sync check:', error);
    finalStatus = SyncStatus.ERROR;
    errorMessage = error.message || error?.error?.error_summary || 'Sync check failed';
  } finally {
    // Only update if the status wasn't already set by an internal call (like upload)
    // Check currentSyncStatus before updating? Or just update always? Let's update always.
    updateSyncIndicator(finalStatus, errorMessage);
  }
}
