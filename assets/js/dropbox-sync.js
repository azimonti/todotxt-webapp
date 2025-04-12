/* global Dropbox */ // Inform linter that Dropbox is a global variable from the SDK

const CLIENT_ID = 'itl0pexh8y06vl7'; // Replace with your actual Dropbox App Key
const REDIRECT_URI = window.location.origin; // Use current page origin as redirect URI

let dbxAuth = null;
let dbx = null;
let accessToken = localStorage.getItem('dropboxAccessToken');

/**
 * Initializes the Dropbox authentication object.
 */
function initializeDropboxAuth() {
  // Check if Dropbox SDK is loaded
  if (typeof Dropbox === 'undefined') {
    console.error('Dropbox SDK not loaded.');
    // Optionally disable the Dropbox button or show an error message
    const dropboxButton = document.getElementById('dropboxAuthButton');
    if (dropboxButton) {
      dropboxButton.disabled = true;
      dropboxButton.textContent = 'Dropbox SDK Error';
    }
    return;
  }

  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });

  // Check if we were redirected from Dropbox OAuth flow
  handleRedirect();

  // If we already have a token, initialize the main Dropbox object
  if (accessToken) {
    initializeDropboxApi(accessToken);
    updateAuthButton(true);
  } else {
    updateAuthButton(false);
  }
}

// --- Conflict Resolution Modal ---
let conflictModalInstance = null;
let conflictResolver = null; // To store the promise resolver

/**
 * Initializes and shows the conflict resolution modal.
 * @param {Date} localDate - The date object for local modification time.
 * @param {Date} dropboxDate - The date object for Dropbox modification time.
 * @returns {Promise<'local'|'dropbox'>} A promise that resolves with the user's choice ('local' or 'dropbox').
 */
function showConflictModal(localDate, dropboxDate) {
  // Ensure Bootstrap is loaded and available
  if (typeof bootstrap === 'undefined' || typeof bootstrap.Modal === 'undefined') {
    console.error('Bootstrap Modal component not found.');
    alert('UI Error: Cannot display sync conflict dialog.');
    return Promise.reject('Bootstrap Modal not available'); // Reject the promise
  }

  const modalElement = document.getElementById('conflictModal');
  if (!modalElement) {
    console.error('Conflict modal element not found in HTML.');
    return Promise.reject('Modal element not found');
  }

  // Initialize modal instance if it doesn't exist
  if (!conflictModalInstance) {
    conflictModalInstance = new bootstrap.Modal(modalElement);
  }

  // Populate timestamps
  const localTimeSpan = document.getElementById('localConflictTime');
  const dropboxTimeSpan = document.getElementById('dropboxConflictTime');
  if (localTimeSpan) localTimeSpan.textContent = localDate.toLocaleString();
  if (dropboxTimeSpan) dropboxTimeSpan.textContent = dropboxDate.toLocaleString();

  // Show the modal
  conflictModalInstance.show();

  // Return a promise that will be resolved when the user clicks a button
  return new Promise((resolve) => {
    conflictResolver = resolve; // Store the resolver function
  });
}

// Add event listeners for modal buttons *once*
document.addEventListener('DOMContentLoaded', () => {
  const keepLocalBtn = document.getElementById('keepLocalButton');
  const keepDropboxBtn = document.getElementById('keepDropboxButton');

  if (keepLocalBtn) {
    keepLocalBtn.addEventListener('click', () => {
      if (conflictResolver) {
        conflictResolver('local'); // Resolve the promise with 'local'
        conflictResolver = null; // Clear resolver
      }
      if (conflictModalInstance) conflictModalInstance.hide();
    });
  }

  if (keepDropboxBtn) {
    keepDropboxBtn.addEventListener('click', () => {
      if (conflictResolver) {
        conflictResolver('dropbox'); // Resolve the promise with 'dropbox'
        conflictResolver = null; // Clear resolver
      }
      if (conflictModalInstance) conflictModalInstance.hide();
    });
  }

  // Optional: Handle modal close via 'x' or backdrop click if needed
  const modalElement = document.getElementById('conflictModal');
  if (modalElement) {
    modalElement.addEventListener('hidden.bs.modal', () => {
      // If the modal is closed without a choice, we might need to cancel the sync or default
      if (conflictResolver) {
        console.log('Conflict modal closed without explicit choice.');
        // Decide on default behavior or re-prompt? For now, let's assume no action.
        // conflictResolver(null); // Or reject? Or do nothing?
        conflictResolver = null;
      }
    });
  }
});


/**
 * Handles the redirect back from Dropbox after authentication attempt.
 */
function handleRedirect() {
  const urlParams = new URLSearchParams(window.location.hash.substring(1)); // Dropbox uses hash for redirect
  const token = urlParams.get('access_token');

  if (token) {
    console.log('Successfully obtained Dropbox access token.');
    accessToken = token;
    localStorage.setItem('dropboxAccessToken', accessToken);
    // Clean the hash from the URL
    window.location.hash = '';
    // Re-initialize with the new token
    initializeDropboxApi(accessToken);
    updateAuthButton(true);
  } else {
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    if (error) {
      console.error(`Dropbox Auth Error: ${error} - ${errorDescription}`);
      alert(`Dropbox Authentication Failed: ${errorDescription || error}`);
      // Clean the hash from the URL
      window.location.hash = '';
    }
  }
}

/**
 * Initializes the main Dropbox API object with the access token.
 * @param {string} token - The Dropbox access token.
 */
function initializeDropboxApi(token) {
  if (!token || typeof Dropbox === 'undefined') return;
  dbx = new Dropbox.Dropbox({ accessToken: token });
  console.log('Dropbox API initialized.');
  // You can now make API calls using the 'dbx' object
  // e.g., dbx.filesListFolder({ path: '' }).then(response => console.log(response));

  // Trigger initial sync check after API is ready
  syncWithDropbox().catch(err => console.error("Initial sync check failed:", err));
}

/**
 * Starts the Dropbox authentication flow.
 */
function authenticateWithDropbox() {
  if (!dbxAuth) {
    console.error('Dropbox Auth not initialized.');
    alert('Error initializing Dropbox connection.');
    return;
  }
  dbxAuth.getAuthenticationUrl(REDIRECT_URI, undefined, 'token')
    .then(authUrl => {
      console.log('Redirecting to Dropbox for authentication...');
      window.location.href = authUrl;
    })
    .catch(error => {
      console.error('Error getting Dropbox authentication URL:', error);
      alert('Could not initiate Dropbox authentication. Please check console.');
    });
}

/**
 * Logs the user out by clearing the stored token and re-initializing.
 */
function logoutFromDropbox() {
  accessToken = null;
  localStorage.removeItem('dropboxAccessToken');
  dbx = null;
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID }); // Re-init auth object
  console.log('Logged out from Dropbox.');
  updateAuthButton(false);
  // Potentially trigger UI updates or data reloads if needed
}

/**
 * Updates the authentication button text and behavior.
 * @param {boolean} isLoggedIn - Whether the user is currently logged in.
 */
function updateAuthButton(isLoggedIn) {
  const dropboxButton = document.getElementById('dropboxAuthButton');
  if (!dropboxButton) return;

  const iconElement = dropboxButton.querySelector('i'); // Get the icon element

  if (isLoggedIn) {
    // Logged in state: Show unlink icon
    if (iconElement) {
      iconElement.className = 'fa-solid fa-link-slash'; // Change icon to unlink
    } else {
      // Fallback if icon element wasn't found (shouldn't happen with current HTML)
      dropboxButton.innerHTML = '<i class="fa-solid fa-link-slash"></i>';
    }
    dropboxButton.title = 'Disconnect Dropbox'; // Update title attribute
    dropboxButton.onclick = logoutFromDropbox;
  } else {
    // Logged out state: Show Dropbox icon
    if (iconElement) {
      iconElement.className = 'fa-brands fa-dropbox'; // Change icon to dropbox
    } else {
      // Fallback
      dropboxButton.innerHTML = '<i class="fa-brands fa-dropbox"></i>';
    }
    dropboxButton.title = 'Connect to Dropbox'; // Update title attribute
    dropboxButton.onclick = authenticateWithDropbox;
  }
}

// --- Public API ---
// We export functions needed by other modules (like todo.js)
// For now, we just need the initialization function.
// We might export upload/download functions later.

// --- Dropbox File Operations ---

const TODO_FILENAME = '/todo.txt'; // Path within the app folder

/**
 * Uploads the current todo list from local storage to Dropbox, performing a conflict check first.
 */
async function uploadTodosToDropbox() {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot upload.');
    // TODO: Implement offline queue here later (Task B)
    return;
  }

  console.log('Attempting to upload local changes...');

  // --- Pre-upload Conflict Check ---
  const { getLocalLastModified } = await import('./todo-storage.js');
  const localTimestampStr = getLocalLastModified(); // Timestamp *before* the current save triggering this upload
  const dropboxMeta = await getDropboxFileMetadata();
  const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
  const dropboxDate = dropboxMeta?.server_modified ? new Date(dropboxMeta.server_modified) : null;

  console.log(`Pre-upload Check - Local Last Saved: ${localDate?.toISOString() || 'N/A'}`);
  console.log(`Pre-upload Check - Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

  // If Dropbox file exists and is newer than the last local save (before this current change)
  if (dropboxMeta && dropboxDate && localDate && dropboxDate > localDate) {
      console.log('Pre-upload Check: Conflict detected! Dropbox is newer than the last saved local state.');
      // Trigger conflict resolution instead of uploading
      try {
          // Note: We pass the *previous* localDate for comparison in the modal
          const userChoice = await showConflictModal(localDate, dropboxDate);
          console.log(`Conflict resolved by user during upload attempt: Keep '${userChoice}'`);

          if (userChoice === 'local') {
              // User chose local again, proceed with the upload (overwrite Dropbox)
              console.log('User confirmed keeping local. Proceeding with upload...');
              // Fall through to the upload logic below
          } else if (userChoice === 'dropbox') {
              // User chose Dropbox: Download Dropbox version, overwrite local, discard current change implicitly
              console.log('User chose Dropbox. Downloading Dropbox version...');
              const dropboxContent = await downloadTodosFromDropbox();
              if (dropboxContent !== null) {
                  const { saveTodosFromText, loadTodos } = await import('./todo-load.js');
                  saveTodosFromText(dropboxContent);
                  loadTodos($('#todo-list')); // Reload UI
                  console.log('Local storage overwritten with Dropbox content.');
              } else {
                  console.error('Failed to download Dropbox content after conflict resolution during upload.');
                  alert('Error: Could not download the selected Dropbox version.');
              }
              return; // Stop the upload process as we downloaded instead
          } else {
              console.log('Conflict resolution cancelled during upload attempt.');
              alert('Upload cancelled due to unresolved conflict.');
              // TODO: Maybe revert the local change that triggered this? Complex. For now, just cancel upload.
              return; // Stop the upload process
          }
      } catch (error) {
          console.error('Error during conflict resolution triggered by upload:', error);
          alert('An error occurred during sync conflict resolution. Upload cancelled.');
          return; // Stop the upload process
      }
  }
  // --- End Pre-upload Conflict Check ---

  // Proceed with upload if no conflict or user chose 'local' in conflict resolution
  console.log('Proceeding with upload...');
  const { getTodosFromStorage } = await import('./todo-storage.js'); // Get the *current* todos
  const todos = getTodosFromStorage();

  // Format todos as a plain text string, one task per line
  const todoFileContent = todos.map(todo => todo.text).join('\n');

  try {
    console.log(`Uploading ${todos.length} tasks to Dropbox...`);
    const response = await dbx.filesUpload({
      path: TODO_FILENAME,
      contents: todoFileContent,
      mode: 'overwrite', // Overwrite the file each time
      autorename: false, // Don't rename if conflict (overwrite handles it)
      mute: true // Don't trigger desktop notifications for the user
    });
    console.log('Successfully uploaded todos to Dropbox:', response);
    // Optionally update UI to show sync status/time
  } catch (error) {
    console.error('Error uploading file to Dropbox:', error);
    // Handle specific errors (e.g., auth error, network error)
    // Optionally notify the user
    alert(`Error syncing with Dropbox: ${error?.error?.error_summary || error}`);
  }
}

/**
 * Performs the core sync logic: compares local and remote timestamps.
 */
async function syncWithDropbox() {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot sync.');
    return;
  }

  console.log('Starting Dropbox sync check...');

  // Import local timestamp getter dynamically
  const { getLocalLastModified } = await import('./todo-storage.js');
  const localTimestampStr = getLocalLastModified();
  const dropboxMeta = await getDropboxFileMetadata();

  const localDate = localTimestampStr ? new Date(localTimestampStr) : null;
  const dropboxDate = dropboxMeta?.server_modified ? new Date(dropboxMeta.server_modified) : null;

  console.log(`Local Last Modified: ${localDate?.toISOString() || 'N/A'}`);
  console.log(`Dropbox Last Modified: ${dropboxDate?.toISOString() || 'N/A'}`);

  if (!dropboxMeta || !dropboxDate) {
    // No file on Dropbox yet
    console.log('Sync Status: No file found on Dropbox. Uploading local version.');
    // TODO: Trigger uploadTodosToDropbox(); (or handle first run differently)
    await uploadTodosToDropbox(); // Let's upload if dropbox file doesn't exist
    return;
  }

  if (!localDate) {
    // No local timestamp, but Dropbox file exists
    console.log('Sync Status: No local timestamp found. Downloading from Dropbox and overwriting local.');
    const dropboxContent = await downloadTodosFromDropbox();
    if (dropboxContent !== null) {
      // Need functions to parse content and save locally
      const { saveTodosFromText, loadTodos } = await import('./todo-load.js'); // Assuming todo-load handles parsing/saving text
      saveTodosFromText(dropboxContent); // Overwrite local storage with Dropbox content
      loadTodos($('#todo-list')); // Reload UI from the newly saved data
      console.log('Local storage overwritten with Dropbox content.');
    } else {
      console.error('Failed to download Dropbox content for initial sync.');
    }
    return;
  }

  // Compare timestamps (allow for a small buffer, e.g., 2 seconds, due to potential clock skew/API delays)
  const timeDiff = localDate.getTime() - dropboxDate.getTime();
  const buffer = 2000; // 2 seconds in milliseconds

  if (Math.abs(timeDiff) <= buffer) {
    console.log('Sync Status: Local and Dropbox timestamps are roughly the same. No action needed.');
    // TODO: Potentially still download if unsure? Or trust local?
  } else if (dropboxDate > localDate) {
    console.log('Sync Status: Dropbox file is newer than local. Showing conflict modal.');
    // CONFLICT DETECTED! Trigger conflict resolution UI
    try {
      const userChoice = await showConflictModal(localDate, dropboxDate);
      console.log(`Conflict resolved by user: Keep '${userChoice}'`);

      if (userChoice === 'local') {
        // User chose to keep local: Upload local version to overwrite Dropbox
        console.log('User chose local. Uploading local version...');
        await uploadTodosToDropbox();
      } else if (userChoice === 'dropbox') {
        // User chose to keep Dropbox: Download Dropbox version to overwrite local
        console.log('User chose Dropbox. Downloading Dropbox version...');
        const dropboxContent = await downloadTodosFromDropbox();
        if (dropboxContent !== null) {
          const { saveTodosFromText, loadTodos } = await import('./todo-load.js');
          saveTodosFromText(dropboxContent);
          loadTodos($('#todo-list')); // Reload UI
          console.log('Local storage overwritten with Dropbox content.');
        } else {
          console.error('Failed to download Dropbox content after conflict resolution.');
          alert('Error: Could not download the selected Dropbox version.');
        }
      } else {
        console.log('Conflict resolution cancelled or closed without choice.');
        // Decide if sync should be re-attempted later?
      }
    } catch (error) {
      console.error('Error during conflict resolution:', error);
      alert('An error occurred during sync conflict resolution.');
    }

  } else { // localDate > dropboxDate
    console.log('Sync Status: Local changes are newer than Dropbox. Uploading local version.');
    // TODO: Trigger uploadTodosToDropbox();
    await uploadTodosToDropbox(); // Upload local changes
  }
}


/**
 * Fetches metadata for the todo list file from Dropbox.
 * @returns {Promise<object|null>} A promise that resolves with the file metadata object (including server_modified), or null if an error occurs or the file doesn't exist.
 */
async function getDropboxFileMetadata() {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot get metadata.');
    return null;
  }

  try {
    console.log(`Fetching metadata for ${TODO_FILENAME} from Dropbox...`);
    const response = await dbx.filesGetMetadata({ path: TODO_FILENAME });
    console.log('Successfully fetched file metadata:', response);
    return response.result; // Contains server_modified, size, etc.
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      console.log(`File ${TODO_FILENAME} not found on Dropbox. No metadata available.`);
      return null; // Return null if file doesn't exist yet
    }
    // Log the full error object for more details
    console.error('Full error object fetching metadata:', error);
    console.error('Error fetching file metadata from Dropbox:', error); // Keep original log too
    alert(`Error fetching metadata from Dropbox: ${error?.error?.error_summary || error}`);
    return null; // Return null on other errors
  }
}

/**
 * Downloads the todo list file from Dropbox.
 * @returns {Promise<string|null>} A promise that resolves with the file content as a string, or null if an error occurs or the file doesn't exist.
 */
async function downloadTodosFromDropbox() {
  if (!dbx) {
    console.warn('Dropbox API not initialized. Cannot download.');
    return null;
  }

  try {
    console.log(`Downloading ${TODO_FILENAME} from Dropbox...`);
    const response = await dbx.filesDownload({ path: TODO_FILENAME });
    console.log('Successfully downloaded todos file metadata:', response);

    // filesDownload returns metadata, the content is a blob that needs to be read
    const fileBlob = response.result.fileBlob;
    if (fileBlob) {
      const text = await fileBlob.text();
      console.log(`Downloaded content (${text.length} chars).`);
      return text;
    } else {
      console.warn('Downloaded file blob is missing.');
      return null;
    }
  } catch (error) {
    // Handle specific errors, e.g., file not found
    if (error?.error?.error_summary?.startsWith('path/not_found')) {
      console.log(`File ${TODO_FILENAME} not found on Dropbox. Assuming first sync.`);
      return null; // Return null if file doesn't exist yet
    }
    console.error('Error downloading file from Dropbox:', error);
    alert(`Error downloading from Dropbox: ${error?.error?.error_summary || error}`);
    return null; // Return null on other errors
  }
}


export { initializeDropboxAuth, uploadTodosToDropbox, downloadTodosFromDropbox, getDropboxFileMetadata }; // Export the new function
