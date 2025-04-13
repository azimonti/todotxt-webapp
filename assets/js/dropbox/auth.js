/* global Dropbox */ // Inform linter about globals
import { CLIENT_ID, REDIRECT_URI, ACCESS_TOKEN_KEY } from './config.js';
import { logVerbose } from '../todo-logging.js';
import { updateAuthButton, updateSyncIndicator, SyncStatus } from './ui.js';
import { initializeDropboxApi } from './api.js'; // Needed after successful auth

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
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox SDK failed to load');
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
  } else if (!accessToken && !redirected) {
    logVerbose('No access token found.');
    updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
    updateSyncIndicator(SyncStatus.NOT_CONNECTED); // Set initial status if not logged in
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
    return true; // Indicate token processed
  } else if (error) {
    console.error(`Dropbox Auth Error: ${error} - ${errorDescription}`);
    alert(`Dropbox Authentication Failed: ${errorDescription || error}`);
    updateSyncIndicator(SyncStatus.ERROR, `Auth Failed: ${errorDescription || error}`);
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
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox Auth not initialized');
    return;
  }
  logVerbose('Starting Dropbox authentication flow...');
  updateSyncIndicator(SyncStatus.SYNCING); // Indicate activity
  dbxAuth.getAuthenticationUrl(REDIRECT_URI, undefined, 'token')
    .then(authUrl => {
      logVerbose('Redirecting to Dropbox for authentication...');
      window.location.href = authUrl;
    })
    .catch(error => {
      console.error('Error getting Dropbox authentication URL:', error);
      alert('Could not initiate Dropbox authentication. Please check console.');
      updateSyncIndicator(SyncStatus.ERROR, 'Could not get auth URL');
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
  updateSyncIndicator(SyncStatus.NOT_CONNECTED); // Update status
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
