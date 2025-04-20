'use strict';

import { logVerbose } from '../todo-logging.js';
// Import function to get last sync time and active file
import { getLastSyncTime, getActiveFile } from '../todo-storage.js';

// --- Sync Status Indicator ---
export const SyncStatus = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  PENDING: 'pending',
  OFFLINE: 'offline',
  ERROR: 'error',
  NOT_CONNECTED: 'not_connected'
};
let currentSyncStatus = SyncStatus.NOT_CONNECTED; // Initialize status
let currentFilePath = null; // Track the file path the status applies to

/**
 * Updates the sync status indicator UI.
 * @param {SyncStatus} status - The new sync status.
 * @param {string} [message=''] - An optional message, typically for errors.
 * @param {string} [filePath=null] - The specific file path this status applies to. If null, defaults to the active file.
 */
export function updateSyncIndicator(status, message = '', filePath = null) {
  const indicator = document.getElementById('syncStatusIndicator');
  if (!indicator) return;

  const relevantFilePath = filePath || getActiveFile(); // Use provided path or get active one

  // Avoid unnecessary updates if status AND file path haven't changed (unless it's an error message)
  if (status === currentSyncStatus && relevantFilePath === currentFilePath && status !== SyncStatus.ERROR) return;

  logVerbose(`Updating sync indicator: ${status} for ${relevantFilePath}`, message || '');
  currentSyncStatus = status;
  currentFilePath = relevantFilePath; // Store the file path for the current status
  let iconClass = '';
  let text = '';
  let title = 'Sync Status'; // Default title

  switch (status) {
  case SyncStatus.IDLE: { // Add block scope
    iconClass = 'fa-solid fa-check text-success';
    text = ''; // or 'Synced'
    // Get last sync time for the relevant file
    const lastSyncTimestamp = getLastSyncTime(relevantFilePath);
    let syncTimeStr = 'Never';
    if (lastSyncTimestamp) {
      try {
        syncTimeStr = new Date(lastSyncTimestamp).toLocaleString();
      } catch (e) {
        console.error("Error parsing last sync timestamp:", lastSyncTimestamp, e);
        syncTimeStr = 'Invalid Date';
      }
    }
    // Extract just the file name for display
    const fileName = relevantFilePath.substring(relevantFilePath.lastIndexOf('/') + 1);
    title = `File: ${fileName}\nLast Sync: ${syncTimeStr}`;
    break;
  } // Close block scope
  case SyncStatus.SYNCING:
    iconClass = 'fa-solid fa-rotate text-primary';
    text = 'Syncing...';
    title = 'Syncing with Dropbox...';
    break;
  case SyncStatus.PENDING:
    iconClass = 'fa-solid fa-cloud-arrow-up text-warning';
    text = 'Pending';
    title = 'Upload pending (will sync when online)';
    break;
  case SyncStatus.OFFLINE:
    iconClass = 'fa-solid fa-wifi text-muted';
    text = 'Offline';
    title = 'Application is offline';
    break;
  case SyncStatus.ERROR:
    iconClass = 'fa-solid fa-triangle-exclamation text-danger';
    text = 'Error';
    title = `Sync Error: ${message || 'Unknown error'}`;
    break;
  case SyncStatus.NOT_CONNECTED:
  default:
    iconClass = 'fa-solid fa-power-off text-muted';
    text = ''; // Or 'Not Connected'
    title = 'Not connected to Dropbox';
    break;
  }

  indicator.innerHTML = `<i class="${iconClass}"></i> ${text}`;
  indicator.title = title;
}

// --- Conflict Resolution Modal ---
let conflictModalInstance = null;
let conflictResolver = null; // To store the promise resolver

/**
 * Initializes and shows the conflict resolution modal.
 * @param {Date} localDate - The date object for local modification time.
 * @param {Date} dropboxDate - The date object for Dropbox modification time.
 * @param {string} filePath - The path of the file with the conflict.
 * @returns {Promise<'local'|'dropbox'|null>} A promise that resolves with the user's choice ('local' or 'dropbox') or null if cancelled.
 */
export function showConflictModal(localDate, dropboxDate, filePath) { // Added filePath parameter
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
    conflictModalInstance = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false }); // Prevent closing without choice
    logVerbose('Conflict modal instance created.');
    // Add event listeners only once when the instance is created
    setupConflictModalListeners(modalElement);
  }

  // Populate timestamps and file name
  const localTimeSpan = document.getElementById('localConflictTime');
  const dropboxTimeSpan = document.getElementById('dropboxConflictTime');
  const fileNameSpan = document.getElementById('conflictFileName'); // Get the new element

  if (localTimeSpan) localTimeSpan.textContent = localDate ? localDate.toLocaleString() : 'N/A';
  if (dropboxTimeSpan) dropboxTimeSpan.textContent = dropboxDate ? dropboxDate.toLocaleString() : 'N/A';
  if (fileNameSpan && filePath) {
    // Extract file name from path
    fileNameSpan.textContent = filePath.substring(filePath.lastIndexOf('/') + 1);
  } else if (fileNameSpan) {
    fileNameSpan.textContent = 'Unknown File'; // Fallback
  }


  logVerbose(`Showing conflict modal for file: ${filePath}`);
  // Show the modal
  conflictModalInstance.show();

  // Return a promise that will be resolved when the user clicks a button
  return new Promise((resolve) => {
    conflictResolver = resolve; // Store the resolver function
  });
}

// Function to setup listeners, called only once
function setupConflictModalListeners(modalElement) {
  const keepLocalBtn = document.getElementById('keepLocalButton');
  const keepDropboxBtn = document.getElementById('keepDropboxButton');

  if (keepLocalBtn) {
    keepLocalBtn.addEventListener('click', () => {
      logVerbose('Conflict modal: "Keep Local" clicked.');
      if (conflictResolver) {
        conflictResolver('local'); // Resolve the promise with 'local'
        conflictResolver = null; // Clear resolver
      }
      if (conflictModalInstance) conflictModalInstance.hide();
    });
  }

  if (keepDropboxBtn) {
    keepDropboxBtn.addEventListener('click', () => {
      logVerbose('Conflict modal: "Keep Dropbox" clicked.');
      if (conflictResolver) {
        conflictResolver('dropbox'); // Resolve the promise with 'dropbox'
        conflictResolver = null; // Clear resolver
      }
      if (conflictModalInstance) conflictModalInstance.hide();
    });
  }

  // Handle modal close via 'x' button - resolve as null (cancel)
  const closeButton = modalElement?.querySelector('.btn-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      if (conflictResolver) {
        logVerbose('Conflict modal closed via X button.');
        conflictResolver(null); // Indicate cancellation
        conflictResolver = null;
      }
      // Modal hides automatically
    });
  }

  // Handle modal close via backdrop click (if not static) or ESC (if keyboard true)
  // If backdrop is static and keyboard false, this listener might not be needed
  // but added for completeness in case modal options change.
  modalElement.addEventListener('hidden.bs.modal', () => {
    // If the modal is hidden and the promise wasn't resolved by button click
    if (conflictResolver) {
      logVerbose('Conflict modal hidden without explicit button choice.');
      conflictResolver(null); // Indicate cancellation
      conflictResolver = null;
    }
  });
  logVerbose('Conflict modal listeners attached.');
}

// --- Auth Button ---

/**
 * Updates the authentication button text and behavior.
 * @param {boolean} isLoggedIn - Whether the user is currently logged in.
 * @param {function} loginHandler - Function to call when login button is clicked.
 * @param {function} logoutHandler - Function to call when logout button is clicked.
 */
export function updateAuthButton(isLoggedIn, loginHandler, logoutHandler) {
  const dropboxButton = document.getElementById('dropboxAuthButton');
  if (!dropboxButton) return;

  const iconElement = dropboxButton.querySelector('i'); // Get the icon element
  logVerbose(`Updating auth button. Logged in: ${isLoggedIn}`);

  if (isLoggedIn) {
    // Logged in state: Show unlink icon
    if (iconElement) {
      iconElement.className = 'fa-solid fa-link-slash fs-5 align-middle'; // Keep styling consistent
      iconElement.style.color = '#0083B3'; // Example: Red color for disconnect
    } else {
      dropboxButton.innerHTML = '<i class="fa-solid fa-link-slash fs-5 align-middle" style="color: #0083B3;"></i>';
    }
    dropboxButton.title = 'Disconnect Dropbox'; // Update title attribute
    dropboxButton.onclick = logoutHandler; // Assign logout handler
  } else {
    // Logged out state: Show Dropbox icon
    if (iconElement) {
      iconElement.className = 'fa-brands fa-dropbox fs-4 align-middle'; // Keep styling consistent
      iconElement.style.color = '#0083B3'; // Original color
    } else {
      dropboxButton.innerHTML = '<i class="fa-brands fa-dropbox fs-4 align-middle" style="color: #0083B3;"></i>';
    }
    dropboxButton.title = 'Connect to Dropbox'; // Update title attribute
    dropboxButton.onclick = loginHandler; // Assign login handler
  }
}

// Initialize the sync indicator to NOT_CONNECTED on load
document.addEventListener('DOMContentLoaded', () => {
  updateSyncIndicator(SyncStatus.NOT_CONNECTED);
});
