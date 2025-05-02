'use strict';

import { logVerbose } from '../todo-logging.js';

let dbx = null; // Dropbox API instance (Dropbox class)

/**
 * Initializes or updates the main Dropbox API object using the DropboxAuth instance.
 * Also triggers the initial sync check upon successful initialization.
 * @param {Dropbox.DropboxAuth | null} authInstance - The initialized DropboxAuth object, or null to de-initialize.
 */
export async function initializeDropboxApi(authInstance) {

  if (!authInstance) {
    logVerbose('De-initializing Dropbox API (token is null).');
    dbx = null;
    // Status should be handled by logout function or initial state
    return;
  }

  if (typeof Dropbox === 'undefined') {
    console.error('Dropbox SDK not loaded, cannot initialize API.');
    dbx = null; // Ensure dbx is null
    return;
  }

  // Check if we have an access token in the auth instance
  const currentAccessToken = authInstance.getAccessToken();
  if (!currentAccessToken) {
    logVerbose('Cannot initialize Dropbox API: No access token in auth instance.');
    dbx = null;
    return;
  }

  // Avoid re-initialization if the underlying access token hasn't changed
  // Note: This check might be less critical now as dbxAuth manages state,
  // but can prevent unnecessary object creation.
  if (dbx && dbx.auth.getAccessToken() === currentAccessToken) {
    logVerbose('Dropbox API appears to be initialized with the same token state.');
    return;
  }

  logVerbose('Initializing/Updating Dropbox API instance...');
  try {
    // Initialize Dropbox API with the DropboxAuth instance
    // The SDK will use this auth instance to get the access token for requests
    // and potentially handle refreshing automatically if configured,
    // but we'll add explicit refresh handling for robustness.
    dbx = new Dropbox.Dropbox({ auth: authInstance });
    logVerbose('Dropbox API initialized/updated successfully.');

    // Trigger initial sync check via the coordinator ONLY if dbx was newly created or updated
    // This prevents redundant syncs if initializeDropboxApi is called multiple times
    // without the underlying token actually changing (e.g., during refresh logic).
    // We might need a flag or compare old/new token to be more precise.
    // For now, let's assume if we reach here with a valid dbx, a sync check is warranted.
    // This assumes initializeDropboxApi is called *after* coordinator is initialized
    try {
      const { coordinateSync } = await import('../todo-sync-coordinator.js'); // Corrected path
      await coordinateSync();
    } catch (coordError) {
      console.error("Failed to trigger initial sync via coordinator:", coordError);
    }

  } catch (error) {
    console.error('Error initializing Dropbox API object:', error);
    dbx = null; // Ensure dbx is null if initialization failed
  }
}

/**
 * Returns the initialized Dropbox API instance (Dropbox class).
 * @returns {Dropbox.Dropbox | null} The Dropbox instance or null if not initialized.
 */
export function getDbxInstance() {
  // Maybe add a check here? If !dbx but dbxAuth exists and has tokens, try init?
  // For now, keep it simple.
  return dbx;
}
// --- End API Call Wrapper ---

/**
 * Fetches metadata for a specific todo list file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/todo.txt').
 * @returns {Promise<DropboxTypes.files.FileMetadataReference | DropboxTypes.files.FolderMetadataReference | DropboxTypes.files.DeletedMetadataReference | null>} A promise that resolves with the file metadata object, or null if an error occurs or the file doesn't exist.
 */
export async function getDropboxFileMetadata(filePath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot get metadata.');
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
    const errorSummary = error?.error?.error_summary || String(error);
    console.error(`Error fetching metadata for ${filePath} from Dropbox:`, errorSummary);

    // Check for invalid access token error using the specific error tag or summary string
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected while fetching metadata for ${filePath}. Logging out.`);
      // Dynamically import logout function
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
      // updateSyncIndicator(SyncStatus.NOT_CONNECTED, null, null); // Coordinator handles UI
      // alert('Dropbox connection error: Your session has expired. Please reconnect.'); // Coordinator handles UI
    }
    // Return null, let caller (coordinator) handle UI feedback
    return null; // Return null on errors
  }
}

/**
 * Downloads a specific todo list file from Dropbox.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/todo.txt').
 * @returns {Promise<{success: boolean, content: string | null}>} A promise resolving with success status and content, or null content on failure/not found.
 */
export async function downloadTodosFromDropbox(filePath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot download.');
    return { success: false, content: null };
  }
  if (!filePath) {
    console.error('downloadTodosFromDropbox called without filePath.');
    return { success: false, content: null };
  }

  try {
    logVerbose(`Downloading ${filePath} from Dropbox...`);
    // updateSyncIndicator(SyncStatus.SYNCING); // Coordinator handles UI
    const response = await dbx.filesDownload({ path: filePath });
    logVerbose(`Successfully downloaded metadata for ${filePath}:`, response);

    // filesDownload returns metadata, the content is a blob that needs to be read
    const fileBlob = response.result.fileBlob;
    if (fileBlob) {
      const text = await fileBlob.text();
      logVerbose(`Downloaded content for ${filePath} (${text.length} chars).`);
      return { success: true, content: text };
    } else {
      console.warn(`Downloaded file blob is missing for ${filePath}.`);
      // updateSyncIndicator(SyncStatus.ERROR, `Downloaded ${filePath} empty`, filePath); // Coordinator handles UI
      return { success: false, content: null };
    }
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      logVerbose(`File ${filePath} not found on Dropbox. Assuming first sync.`);
      return { success: true, content: null }; // Success, but no content (file doesn't exist)
    }
    const errorSummary = error?.error?.error_summary || String(error);
    console.error(`Error downloading ${filePath} from Dropbox:`, errorSummary);

    // Check for invalid access token error using the specific error tag or summary string
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected while downloading ${filePath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
      // updateSyncIndicator(SyncStatus.NOT_CONNECTED, null, null); // Coordinator handles UI
      // alert('Dropbox connection error: Your session has expired. Please reconnect.'); // Coordinator handles UI
    } else {
      // Update indicator only for non-auth errors during download
      // updateSyncIndicator(SyncStatus.ERROR, `Download ${filePath} failed`, filePath); // Coordinator handles UI
    }
    // Return failure, let caller (coordinator) handle UI feedback
    return { success: false, content: null };
  }
}


/**
 * Uploads the provided content to a specific file path on Dropbox.
 * Handles API errors including authentication issues.
 * @param {string} filePath - The full path of the file on Dropbox (e.g., '/todo.txt').
 * @param {string} todoFileContent - The string content to upload.
 * @returns {Promise<boolean>} A promise resolving with true on success, false on failure.
 */
export async function uploadTodosToDropbox(filePath, todoFileContent) {
  if (!filePath) {
    console.error('uploadTodosToDropbox called without filePath.');
    // updateSyncIndicator(SyncStatus.ERROR, 'Upload error: No file path', null); // Coordinator handles UI
    return false; // Indicate failure
  }
  if (typeof todoFileContent !== 'string') {
    console.error('uploadTodosToDropbox called without string content.');
    return false; // Indicate failure
  }

  // Check online status first - Coordinator should ideally check before calling,
  // but double-check here for robustness.
  if (!navigator.onLine) {
    console.warn(`Upload attempt for ${filePath} cancelled: Application is offline.`);
    // Coordinator should have set pending flag already if needed.
    return false; // Indicate failure (cannot upload offline)
  }

  // Check if Dropbox API is initialized
  if (!dbx) {
    console.warn(`Dropbox API not initialized. Cannot upload ${filePath}.`);
    // updateSyncIndicator(SyncStatus.ERROR, 'Dropbox not initialized', filePath); // Coordinator handles UI
    return false; // Indicate failure
  }

  logVerbose(`Attempting to upload content to ${filePath} (Online)...`);
  // updateSyncIndicator(SyncStatus.SYNCING, '', filePath); // Coordinator handles UI

  try {
    // --- Direct Upload ---
    // Conflict checks are now handled by the coordinator before calling this.
    logVerbose(`Uploading content (${todoFileContent.length} chars) to ${filePath} on Dropbox...`);
    const response = await dbx.filesUpload({
      path: filePath,
      contents: todoFileContent,
      mode: 'overwrite', // Overwrite the file each time
      autorename: false, // Don't rename if conflict (overwrite handles it)
      mute: true // Don't trigger desktop notifications for the user
    });
    logVerbose(`Successfully uploaded content to ${filePath} on Dropbox:`, response);
    // setLastSyncTime(filePath); // Coordinator handles this
    // clearUploadPending(filePath); // Coordinator handles this
    return true; // Indicate success
    // --- End Direct Upload ---

  } catch (error) {
    console.error(`Error during upload API call for ${filePath}:`, error);
    // alert(`Error syncing ${filePath} with Dropbox: ${error?.error?.error_summary || error}`); // Coordinator handles UI
    // statusAfterUpload = SyncStatus.ERROR; // Coordinator handles UI
    // uploadError = error; // Store error for logging/debugging if needed

    // Check for invalid access token error
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected during upload for ${filePath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox(); // Trigger logout
      // statusAfterUpload = SyncStatus.NOT_CONNECTED; // Coordinator handles UI
      // errorMessage = 'Session expired. Please reconnect.'; // Coordinator handles UI
      // alert('Dropbox connection error: Your session has expired. Please reconnect.'); // Coordinator handles UI
    }
    return false; // Indicate failure
  }
  // No finally block needed to update UI here, coordinator does it based on return value.
}


/**
 * Renames a file on Dropbox.
 * @param {string} oldPath - The current full path of the file on Dropbox.
 * @param {string} newPath - The desired new full path of the file on Dropbox.
 * @returns {Promise<boolean>} A promise that resolves with true if successful, false otherwise.
 */
export async function renameDropboxFile(oldPath, newPath) {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot rename file.');
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
    // Check for invalid access token error using the specific error tag or summary string
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected during rename from ${oldPath} to ${newPath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
      // updateSyncIndicator(SyncStatus.NOT_CONNECTED, null, null); // Coordinator handles UI
      userMessage = 'Dropbox connection error: Your session has expired. Please reconnect.'; // Override message
    }

    // alert(userMessage); // Coordinator should handle UI feedback if needed
    console.error(userMessage); // Log the error clearly
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
    console.warn('Dropbox API not initialized. Cannot delete file.');
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
    // Check for invalid access token error using the specific error tag or summary string
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn(`Invalid access token detected during delete for ${filePath}. Logging out.`);
      const { logoutFromDropbox } = await import('./auth.js');
      logoutFromDropbox();
      // updateSyncIndicator(SyncStatus.NOT_CONNECTED, null, null); // Coordinator handles UI
      userMessage = 'Dropbox connection error: Your session has expired. Please reconnect.'; // Override message
    }

    // if (typeof showNotification === 'function') { // Coordinator handles UI
    //   showNotification(userMessage, 'alert');
    // } else {
    //   alert(userMessage); // Fallback if notification function isn't global
    // }
    console.error(userMessage); // Log the error clearly
    return false;
  }
}
