/* global Dropbox */ // Inform linter about globals
import { CLIENT_ID, REDIRECT_URI, ACCESS_TOKEN_KEY } from './config.js';
import { logVerbose, warnVerbose } from '../todo-logging.js'; // Added warnVerbose
import { updateAuthButton, updateSyncIndicator, SyncStatus } from './ui.js';
import { initializeDropboxApi, getDbxInstance } from './api.js'; // Added getDbxInstance
// Imports for file discovery
import { getKnownFiles, addKnownFile, DEFAULT_FILE_PATH } from '../todo-storage.js';
import { updateFileSelectionUI } from '../todo-files.js';


let dbxAuth = null;
let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);

/**
 * Initializes the Dropbox authentication object and checks for existing tokens or redirects.
 * @returns {Promise<boolean>} True if initialization is successful and API can be potentially initialized, false otherwise.
 */
export async function initializeAuthentication() {
  // Check if Dropbox SDK is loaded
  if (typeof Dropbox === 'undefined') {
    console.error('Dropbox SDK not loaded.');
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox SDK failed to load', null); // Pass null filePath
    const dropboxButton = document.getElementById('dropboxAuthButton');
    if (dropboxButton) {
      dropboxButton.disabled = true;
      dropboxButton.title = 'Dropbox SDK Error';
    }
    return false; // Indicate failure
  }

  logVerbose('Initializing Dropbox Auth...');
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });
  accessToken = localStorage.getItem(ACCESS_TOKEN_KEY); // Re-check token

  // Check if we were redirected from Dropbox OAuth flow
  const redirected = await handleRedirect(); // This might call initializeDropboxApi

  // If we already have a token (and weren't redirected), initialize the main Dropbox object
  if (accessToken && !redirected) {
    logVerbose('Found existing access token.');
    await initializeDropboxApi(accessToken); // Initialize API which triggers sync
    updateAuthButton(true, authenticateWithDropbox, logoutFromDropbox); // Update button state
    // Discover files after API init with existing token
    await discoverDropboxFiles();
  } else if (!accessToken && !redirected) {
    logVerbose('No access token found.');
    updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
    updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null); // Set initial status (general) if not logged in
  }
  // If redirected, handleRedirect already took care of API init and button update

  return true; // Indicate success
}

/**
 * Handles the redirect back from Dropbox after authentication attempt.
 * @returns {Promise<boolean>} True if a token was successfully processed from the redirect, false otherwise.
 */
async function handleRedirect() {
  const urlParams = new URLSearchParams(window.location.hash.substring(1)); // Dropbox uses hash for redirect
  const token = urlParams.get('access_token');
  const error = urlParams.get('error');
  const errorDescription = urlParams.get('error_description');

  if (token) {
    logVerbose('Successfully obtained Dropbox access token from redirect.');
    accessToken = token;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    // Clean the hash from the URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    // Initialize API with the new token
    await initializeDropboxApi(accessToken); // This will trigger sync check
    updateAuthButton(true, authenticateWithDropbox, logoutFromDropbox); // Update button state
    // Discover files after API init from redirect
    await discoverDropboxFiles();
    return true; // Indicate token processed
  } else if (error) {
    console.error(`Dropbox Auth Error: ${error} - ${errorDescription}`);
    alert(`Dropbox Authentication Failed: ${errorDescription || error}`);
    updateSyncIndicator(SyncStatus.ERROR, `Auth Failed: ${errorDescription || error}`, null); // General error
    // Clean the hash from the URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox); // Ensure button is in logged-out state
    return false; // Indicate error
  }
  return false; // No token or error in hash
}

/**
 * Starts the Dropbox authentication flow.
 */
export function authenticateWithDropbox() {
  if (!dbxAuth) {
    console.error('Dropbox Auth not initialized.');
    alert('Error initializing Dropbox connection.');
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox Auth not initialized', null); // General error
    return;
  }
  logVerbose('Starting Dropbox authentication flow...');
  // Indicate activity - SYNCING isn't quite right, maybe just leave as NOT_CONNECTED?
  // Or introduce an AUTHENTICATING status? For now, let's leave it.
  // updateSyncIndicator(SyncStatus.SYNCING, '', null); // Indicate activity (general)
  dbxAuth.getAuthenticationUrl(REDIRECT_URI, undefined, 'token')
    .then(authUrl => {
      logVerbose('Redirecting to Dropbox for authentication...');
      window.location.href = authUrl;
    })
    .catch(error => {
      console.error('Error getting Dropbox authentication URL:', error);
      alert('Could not initiate Dropbox authentication. Please check console.');
      updateSyncIndicator(SyncStatus.ERROR, 'Could not get auth URL', null); // General error
    });
}

/**
 * Logs the user out by clearing the stored token and re-initializing.
 */
export function logoutFromDropbox() {
  logVerbose('Logging out from Dropbox...');
  accessToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  // No need to clear dbx instance here, initializeDropboxApi(null) handles it
  initializeDropboxApi(null); // Clear the API instance
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID }); // Re-init auth object just in case
  updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox); // Update button to logged-out state
  updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null); // Update status (general)
  // Potentially trigger UI updates or data reloads if needed (e.g., clear local data?)
  // For now, just disconnects.
}

/**
 * Gets the current access token.
 * @returns {string | null} The access token or null if not authenticated.
 */
export function getAccessToken() {
  return accessToken;
}


/**
 * Discovers .txt files in the root of the app's Dropbox folder
 * and adds any new ones to the local known files list.
 */
async function discoverDropboxFiles() {
  logVerbose('Starting Dropbox file discovery...');
  const dbx = getDbxInstance();
  if (!dbx) {
    warnVerbose('Cannot discover files: Dropbox API not initialized.');
    return;
  }

  try {
    let response = await dbx.filesListFolder({ path: '', recursive: false }); // List root folder
    let discoveredFiles = [];

    // Process initial batch
    discoveredFiles = discoveredFiles.concat(response.result.entries);

    // Handle pagination if there are more files
    while (response.result.has_more) {
      logVerbose('Fetching next page of Dropbox files...');
      response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
      discoveredFiles = discoveredFiles.concat(response.result.entries);
    }

    logVerbose(`Discovered ${discoveredFiles.length} total entries in Dropbox root.`);

    const knownFiles = getKnownFiles(); // Get currently known files
    let filesAdded = false;

    for (const entry of discoveredFiles) {
      // Check if it's a file and ends with .txt
      if (entry['.tag'] === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
        const filePath = entry.path_lower; // Use path_lower for consistency
        const fileName = entry.name;

        // Check if this file path is already known locally
        if (!knownFiles.some(knownFile => knownFile.path === filePath)) {
          logVerbose(`Found new file on Dropbox: ${fileName} (${filePath}). Adding to known files.`);
          // Add the file locally (name, path)
          // Ensure path starts with '/' if not already present (Dropbox paths usually do)
          const correctedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
          addKnownFile(fileName, correctedPath);
          filesAdded = true;
          // Note: We don't download content here, only add to the list.
          // Content will be synced when the file becomes active.
        }
      }
    }

    if (filesAdded) {
      logVerbose('New files added from Dropbox discovery. Updating UI.');
      updateFileSelectionUI(); // Refresh the sidebar if new files were added
    } else {
      logVerbose('No new .txt files discovered on Dropbox.');
    }

    // Ensure the default file exists locally if it wasn't discovered
    // (This is usually handled by getKnownFiles, but double-check)
    const currentKnownFiles = getKnownFiles();
    if (!currentKnownFiles.some(f => f.path === DEFAULT_FILE_PATH)) {
        warnVerbose("Default file path still missing after discovery, adding it.");
        addKnownFile('todo.txt', DEFAULT_FILE_PATH);
        updateFileSelectionUI();
    }


  } catch (error) {
    console.error('Error listing files from Dropbox:', error);
    // Handle specific errors like invalid token if needed
    const errorSummary = error?.error?.error_summary || String(error);
    const isInvalidToken = error?.error?.['.tag'] === 'invalid_access_token' || errorSummary.includes('invalid_access_token');
    if (isInvalidToken) {
      console.warn('Invalid access token during file discovery. Logging out.');
      logoutFromDropbox(); // Call logout which handles UI updates
      alert('Dropbox connection error: Your session has expired. Please reconnect.');
    } else {
      // Show a generic error for other issues
      updateSyncIndicator(SyncStatus.ERROR, 'Failed to list Dropbox files', null);
      alert('Error checking for files on Dropbox. Please check the console.');
    }
  }
}
