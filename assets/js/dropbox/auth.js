'use strict';

import { CLIENT_ID, REDIRECT_URI, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './config.js';
import { logVerbose } from '../todo-logging.js';
import { updateAuthButton, updateSyncIndicator, SyncStatus } from './ui.js';
import { getKnownFiles, addKnownFile } from '../todo-storage.js';
import { initializeDropboxApi, getDbxInstance } from './api.js';
import { updateFileSelectionUI } from '../todo-files.js';

const CODE_VERIFIER_KEY = 'dropboxCodeVerifier'; // Key for sessionStorage

let dbxAuth = null;
let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
let refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

// --- PKCE Helper Functions ---

/**
 * Generates a random string for the code verifier.
 * @param {number} length Length of the string.
 * @returns {string} A random string.
 */
function generateRandomString(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * Hashes the code verifier using SHA-256.
 * @param {string} plain The plain text code verifier.
 * @returns {Promise<ArrayBuffer>} The SHA-256 hash as an ArrayBuffer.
 */
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

/**
 * Base64 URL encodes the given ArrayBuffer.
 * @param {ArrayBuffer} buffer The ArrayBuffer to encode.
 * @returns {string} The Base64 URL encoded string.
 */
function base64UrlEncode(buffer) {
  // Convert ArrayBuffer to Base64 string
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  // Replace Base64 characters with URL-safe ones
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generates the PKCE code challenge from the verifier.
 * @param {string} verifier The code verifier.
 * @returns {Promise<string>} The Base64 URL encoded SHA-256 hash of the verifier.
 */
async function generateCodeChallenge(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

// --- End PKCE Helper Functions ---


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
  // Initialize DropboxAuth with fetch implementation if needed, and potentially refresh token
  dbxAuth = new Dropbox.DropboxAuth({
    clientId: CLIENT_ID,
    accessToken: accessToken, // Pass existing token if available
    refreshToken: refreshToken // Pass existing refresh token
  });
  accessToken = localStorage.getItem(ACCESS_TOKEN_KEY); // Re-check tokens
  refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

  // Check if we were redirected from Dropbox OAuth flow (now expecting a code)
  const redirected = await handleRedirect(); // This might call initializeDropboxApi

  // If we have an access token (and weren't just redirected), initialize API
  if (accessToken && !redirected) {
    logVerbose('Found existing access token.');
    // Pass the auth object which might contain the refresh token too
    await initializeDropboxApi(dbxAuth);
    updateAuthButton(true, authenticateWithDropbox, logoutFromDropbox);
    await discoverDropboxFiles(); // Discover files after API init
  }
  // If we only have a refresh token (and weren't redirected), try to refresh
  else if (refreshToken && !accessToken && !redirected) {
    logVerbose('Found refresh token but no access token. Attempting refresh...');
    try {
      await refreshAccessToken(); // Attempt to get a new access token
      // If refreshAccessToken succeeds, it calls initializeDropboxApi and updates UI
      logVerbose('Token refresh successful during initialization.');
    } catch (error) {
      console.error('Initial token refresh failed:', error);
      logVerbose('Initial refresh failed, clearing tokens.');
      logoutFromDropbox(); // Clear invalid refresh token
      updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
      updateSyncIndicator(SyncStatus.ERROR, 'Session expired, please reconnect', null);
    }
  }
  // If no tokens and not redirected, user is logged out
  else if (!accessToken && !refreshToken && !redirected) {
    logVerbose('No access or refresh token found.');
    updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
    updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null);
  }
  // If redirected, handleRedirect took care of everything

  return true; // Indicate success
}

/**
 * Handles the redirect back from Dropbox after authentication attempt (PKCE flow).
 * @returns {Promise<boolean>} True if tokens were successfully processed from the redirect, false otherwise.
 */
async function handleRedirect() {
  // PKCE flow uses search parameters, not hash
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  const errorDescription = urlParams.get('error_description');

  // Clean the search params from the URL
  if (code || error) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (code) {
    logVerbose('Received authorization code from Dropbox redirect.');
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    if (!codeVerifier) {
      console.error('Code verifier not found in session storage. Cannot complete authentication.');
      alert('Authentication error: Could not retrieve security token. Please try logging in again.');
      updateSyncIndicator(SyncStatus.ERROR, 'Auth Error: Missing verifier', null);
      sessionStorage.removeItem(CODE_VERIFIER_KEY); // Clean up just in case
      updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
      return false;
    }

    // Exchange code for tokens
    try {
      logVerbose('Exchanging authorization code for tokens...');
      // Ensure dbxAuth is initialized
      if (!dbxAuth) {
        dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });
      }
      // Use the imported REDIRECT_URI for token exchange (as originally intended)
      // Note: Dropbox validates this URI matches the one used in the initial request.
      // Explicitly set the code verifier on the auth object before exchanging the code
      logVerbose('Setting code verifier on dbxAuth instance...');
      dbxAuth.setCodeVerifier(codeVerifier);
      const response = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, code);
      logVerbose('Successfully exchanged code for tokens.');

      // The DropboxAuth object might automatically store the tokens internally,
      // but we also store them in localStorage for persistence.
      // Note: The SDK might evolve; check documentation if behavior changes.
      // Accessing tokens directly from the response might be needed in some SDK versions.
      // Let's assume dbxAuth updates itself and provides getters or properties.
      // We'll explicitly store what we get from the response for clarity.

      const result = response.result; // Access the result object from the response
      accessToken = result.access_token;
      refreshToken = result.refresh_token;
      const expiresIn = result.expires_in; // Optional: use for proactive refresh

      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      sessionStorage.removeItem(CODE_VERIFIER_KEY); // Clean up verifier

      // Update the dbxAuth instance with the new tokens
      dbxAuth.setAccessToken(accessToken);
      dbxAuth.setRefreshToken(refreshToken);
      // dbxAuth.setAccessTokenExpiresAt(Date.now() + expiresIn * 1000); // If needed

      logVerbose(`Obtained access token (expires in ${expiresIn}s) and refresh token.`);

      // Initialize API with the auth object containing new tokens
      await initializeDropboxApi(dbxAuth);
      updateAuthButton(true, authenticateWithDropbox, logoutFromDropbox);
      await discoverDropboxFiles(); // Discover files after successful auth
      return true; // Indicate tokens processed

    } catch (exchangeError) {
      console.error('Error exchanging code for Dropbox tokens:', exchangeError);
      alert(`Dropbox Authentication Failed: Could not exchange code for token. ${exchangeError.message || exchangeError}`);
      updateSyncIndicator(SyncStatus.ERROR, 'Auth Failed: Token exchange error', null);
      sessionStorage.removeItem(CODE_VERIFIER_KEY); // Clean up verifier
      updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
      return false; // Indicate error
    }

  } else if (error) {
    console.error(`Dropbox Auth Error: ${error} - ${errorDescription}`);
    alert(`Dropbox Authentication Failed: ${errorDescription || error}`);
    updateSyncIndicator(SyncStatus.ERROR, `Auth Failed: ${errorDescription || error}`, null);
    updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
    return false; // Indicate error
  }

  return false; // No code or error in search params
}

/**
 * Starts the Dropbox authentication flow using PKCE.
 */
export async function authenticateWithDropbox() {
  // Force re-initialization of dbxAuth right before use to ensure clean state
  logVerbose('Forcing re-initialization of dbxAuth in authenticateWithDropbox...');
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });
  if (!dbxAuth) {
    console.error('Dropbox Auth failed to re-initialize immediately before use.');
    alert('Critical error initializing Dropbox connection.');
    updateSyncIndicator(SyncStatus.ERROR, 'Dropbox Auth re-init failed', null);
    return;
  }
  // Remove the old check, as we just re-initialized
  /*
    if (!dbxAuth) {
     // Attempt to initialize if not already done (e.g., if SDK load was delayed)
     const initSuccess = await initializeAuthentication();
     */
  // The block above was commented out as part of the forced re-initialization.
  // The following code belongs to the commented-out block and should be removed.

  logVerbose('Starting Dropbox PKCE authentication flow...');

  // 1. Generate Code Verifier
  const codeVerifier = generateRandomString(128); // Recommended length is 43-128
  logVerbose('Generated PKCE Code Verifier.');

  // 2. Generate Code Challenge
  try {
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    logVerbose('Generated PKCE Code Challenge.');

    // 3. Store Code Verifier in sessionStorage (lasts for the session)
    sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
    logVerbose('Stored Code Verifier in sessionStorage.');

    // 4. Get Authentication URL
    // Use the imported REDIRECT_URI (now simplified in config.js)
    const redirectUriString = String(REDIRECT_URI); // Ensure it's a string

    // Manually construct the authorization URL as a workaround for SDK issues
    logVerbose('Manually constructing Dropbox PKCE authorization URL...');
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUriString,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline', // Request refresh token
      include_granted_scopes: 'user'
      // state: 'YOUR_CSRF_TOKEN' // Optional: Add CSRF protection if needed
    });
    const authUrl = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
    logVerbose(`Manually constructed authUrl: ${authUrl}`);

    logVerbose('Redirecting to Dropbox for authentication...');
    window.location.href = authUrl;

  } catch (error) {
    console.log('A3AAAA');
    console.error('Error generating PKCE challenge or getting Dropbox authentication URL:', error);
    alert('Could not initiate Dropbox authentication. Please check console.');
    updateSyncIndicator(SyncStatus.ERROR, 'Could not get auth URL', null);
    sessionStorage.removeItem(CODE_VERIFIER_KEY); // Clean up verifier if error occurs
  }
}

/**
 * Logs the user out by clearing stored tokens and resetting state.
 */
export function logoutFromDropbox() {
  logVerbose('Logging out from Dropbox...');
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY); // Clear refresh token
  sessionStorage.removeItem(CODE_VERIFIER_KEY); // Clear any leftover verifier

  // Clear the API instance by passing null
  initializeDropboxApi(null);

  // Re-initialize the auth object without tokens
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });

  updateAuthButton(false, authenticateWithDropbox, logoutFromDropbox);
  updateSyncIndicator(SyncStatus.NOT_CONNECTED, '', null);
  // Clear any locally displayed file list related to Dropbox?
  // updateFileSelectionUI(); // Maybe call this to reflect logged-out state
}

/**
/**
 * Attempts to refresh the access token using the stored refresh token.
 * This should be called when an API call fails due to an expired token,
 * or during initialization if only a refresh token is present.
 * @returns {Promise<string>} The new access token.
 * @throws {Error} If refresh fails or no refresh token is available.
 */
export async function refreshAccessToken() {
  logVerbose('Attempting to refresh Dropbox access token...');
  if (!refreshToken) {
    logVerbose('No refresh token available.');
    throw new Error('No refresh token available for refresh.');
  }
  if (!dbxAuth) {
    // Ensure dbxAuth is initialized, potentially with the refresh token
    dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID, refreshToken: refreshToken });
    logVerbose('Re-initialized dbxAuth for token refresh.');
  } else {
    // Ensure the auth object knows about the refresh token
    dbxAuth.setRefreshToken(refreshToken);
  }

  // Update UI to indicate refresh attempt
  updateSyncIndicator(SyncStatus.SYNCING, 'Refreshing connection...', null); // Use null for general status

  try {
    // The SDK's refreshAccessToken method should handle the API call
    logVerbose('Calling dbxAuth.refreshAccessToken()...');
    await dbxAuth.refreshAccessToken();
    logVerbose('dbxAuth.refreshAccessToken() completed.');

    // After successful refresh, the dbxAuth object should have the new token.
    // Update our local variables and storage.
    accessToken = dbxAuth.getAccessToken();
    // Note: Dropbox might issue a new refresh token during refresh. Check SDK docs/behavior.
    // If dbxAuth.getRefreshToken() provides a new one, update it:
    // const newRefreshToken = dbxAuth.getRefreshToken();
    // if (newRefreshToken && newRefreshToken !== refreshToken) {
    //   logVerbose('Received a new refresh token.');
    //   refreshToken = newRefreshToken;
    //   localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    // } else {
    // For now, assume refresh token remains the same unless explicitly told otherwise
    logVerbose('Refresh successful. Using existing refresh token.');
    // }


    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    // Update the API instance with the refreshed auth object
    await initializeDropboxApi(dbxAuth);
    updateAuthButton(true, authenticateWithDropbox, logoutFromDropbox); // Ensure button reflects logged-in state

    logVerbose('Dropbox access token refreshed successfully.');
    return accessToken; // Return the new token

  } catch (error) {
    console.error('Error refreshing Dropbox access token:', error);
    // If refresh fails (e.g., refresh token revoked), log out the user
    logVerbose('Token refresh failed. Logging out.');
    logoutFromDropbox(); // Clear tokens and update UI
    updateSyncIndicator(SyncStatus.ERROR, 'Session expired, please reconnect', null);
    throw new Error(`Failed to refresh token: ${error.message || error}`);
  }
}


/**
 * Gets the current access token (potentially refreshing it if necessary - basic check).
 * NOTE: This is a simple check. Robust refresh logic should be tied to API call failures.
 * @returns {Promise<string | null>} The access token or null if not authenticated/refresh fails.
 */
export async function getAccessToken() {
  // Basic check: If no access token but we have a refresh token, try refreshing.
  if (!accessToken && refreshToken) {
    logVerbose('getAccessToken: No access token, attempting refresh...');
    try {
      return await refreshAccessToken();
    } catch (error) {
      logVerbose('getAccessToken: Refresh attempt failed.');
      return null; // Refresh failed, return null
    }
  }
  // Otherwise, return the current token (which might be expired - API calls should handle that)
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
    console.warn('Cannot discover files: Dropbox API not initialized.');
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
      // Check if it's a file (ignore folders, deleted items)
      if (entry['.tag'] === 'file') {
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
      logVerbose('No new files discovered on Dropbox.');
    }

  } catch (error) {
    console.error('Error listing files from Dropbox:', error);
    // Handle specific errors like invalid token if needed
    // Error handling during discovery needs refinement for PKCE flow
    console.error('Error listing files from Dropbox:', error);
    const errorStatus = error?.status; // HTTP status code
    const errorData = error?.error; // Dropbox specific error object/string

    // Check specifically for authentication errors (e.g., 401 or specific Dropbox error tags)
    const isAuthError = errorStatus === 401 || (typeof errorData === 'object' && errorData?.['.tag']?.includes('auth')) || (typeof errorData === 'string' && errorData.includes('invalid_access_token'));

    if (isAuthError && refreshToken) {
      console.warn('Access token likely expired during file discovery. Attempting refresh...');
      updateSyncIndicator(SyncStatus.SYNCING, 'Refreshing connection...', null);
      try {
        await refreshAccessToken();
        logVerbose('Token refreshed successfully after file discovery error. Retrying discovery...');
        // Retry the discovery operation after successful refresh
        await discoverDropboxFiles(); // Recursive call - be careful with infinite loops if refresh fails repeatedly
      } catch (refreshError) {
        console.error('Failed to refresh token after discovery error:', refreshError);
        // If refresh fails, logoutFromDropbox is called within refreshAccessToken
        alert('Dropbox connection lost and could not be re-established. Please reconnect.');
      }
    } else if (isAuthError && !refreshToken) {
      // Auth error but no refresh token - force logout
      console.warn('Authentication error during file discovery and no refresh token available. Logging out.');
      logoutFromDropbox();
      alert('Dropbox connection error: Your session has expired. Please reconnect.');
    }
    else {
      // Handle other non-auth errors during file listing
      const errorSummary = errorData?.error_summary || String(errorData) || 'Unknown error';
      updateSyncIndicator(SyncStatus.ERROR, `Failed to list Dropbox files: ${errorSummary}`, null);
      alert('Error checking for files on Dropbox. Please check the console.');
    }
  }
}
