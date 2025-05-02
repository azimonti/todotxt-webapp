'use strict';

import { logVerbose } from '../todo-logging.js';
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
  let title = 'Sync Status';

  switch (status) {
  case SyncStatus.IDLE: {
    iconClass = 'fa-solid fa-check text-success';
    text = '';
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
    const fileName = relevantFilePath.substring(relevantFilePath.lastIndexOf('/') + 1);
    title = `File: ${fileName}\nLast Sync: ${syncTimeStr}`;
    break;
  }
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
    text = '';
    title = 'Not connected to Dropbox';
    break;
  }

  indicator.innerHTML = `<i class="${iconClass}"></i> ${text}`;
  indicator.title = title;
}

// --- Conflict Resolution Modal ---
let conflictModalInstance = null;
let conflictResolver = null;

/**
 * Initializes and shows the conflict resolution modal.
 * @param {Date} localDate - The date object for local modification time.
 * @param {Date} dropboxDate - The date object for Dropbox modification time.
 * @param {string} filePath - The path of the file with the conflict.
 * @returns {Promise<'local'|'dropbox'|null>} A promise that resolves with the user's choice ('local' or 'dropbox') or null if cancelled.
 */
export function showConflictModal(localDate, dropboxDate, filePath) {
  if (typeof bootstrap === 'undefined' || typeof bootstrap.Modal === 'undefined') {
    console.error('Bootstrap Modal component not found.');
    alert('UI Error: Cannot display sync conflict dialog.');
    return Promise.reject('Bootstrap Modal not available');
  }

  const modalElement = document.getElementById('conflictModal');
  if (!modalElement) {
    console.error('Conflict modal element not found in HTML.');
    return Promise.reject('Modal element not found');
  }

  if (!conflictModalInstance) {
    conflictModalInstance = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false });
    logVerbose('Conflict modal instance created.');
    setupConflictModalListeners(modalElement);
  }

  const localTimeSpan = document.getElementById('localConflictTime');
  const dropboxTimeSpan = document.getElementById('dropboxConflictTime');
  const fileNameSpan = document.getElementById('conflictFileName');

  if (localTimeSpan) localTimeSpan.textContent = localDate ? localDate.toLocaleString() : 'N/A';
  if (dropboxTimeSpan) dropboxTimeSpan.textContent = dropboxDate ? dropboxDate.toLocaleString() : 'N/A';
  if (fileNameSpan && filePath) {
    fileNameSpan.textContent = filePath.substring(filePath.lastIndexOf('/') + 1);
  } else if (fileNameSpan) {
    fileNameSpan.textContent = 'Unknown File';
  }


  logVerbose(`Showing conflict modal for file: ${filePath}`);
  conflictModalInstance.show();

  return new Promise((resolve) => {
    conflictResolver = resolve;
  });
}

function setupConflictModalListeners(modalElement) {
  const keepLocalBtn = document.getElementById('keepLocalButton');
  const keepDropboxBtn = document.getElementById('keepDropboxButton');

  if (keepLocalBtn) {
    keepLocalBtn.addEventListener('click', () => {
      logVerbose('Conflict modal: "Keep Local" clicked.');
      if (conflictResolver) {
        conflictResolver('local');
        conflictResolver = null;
      }
      if (conflictModalInstance) conflictModalInstance.hide();
    });
  }

  if (keepDropboxBtn) {
    keepDropboxBtn.addEventListener('click', () => {
      logVerbose('Conflict modal: "Keep Dropbox" clicked.');
      if (conflictResolver) {
        conflictResolver('dropbox');
        conflictResolver = null;
      }
      if (conflictModalInstance) conflictModalInstance.hide();
    });
  }

  const closeButton = modalElement?.querySelector('.btn-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      if (conflictResolver) {
        logVerbose('Conflict modal closed via X button.');
        conflictResolver(null);
        conflictResolver = null;
      }
    });
  }

  modalElement.addEventListener('hidden.bs.modal', () => {
    if (conflictResolver) {
      logVerbose('Conflict modal hidden without explicit button choice.');
      conflictResolver(null);
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

  const iconElement = dropboxButton.querySelector('i');
  logVerbose(`Updating auth button. Logged in: ${isLoggedIn}`);

  if (isLoggedIn) {
    if (iconElement) {
      iconElement.className = 'fa-solid fa-link-slash fs-5 align-middle';
      iconElement.style.color = '#0083B3';
    } else {
      dropboxButton.innerHTML = '<i class="fa-solid fa-link-slash fs-5 align-middle" style="color: #0083B3;"></i>';
    }
    dropboxButton.title = 'Disconnect Dropbox';
    dropboxButton.onclick = logoutHandler;
  } else {
    if (iconElement) {
      iconElement.className = 'fa-brands fa-dropbox fs-4 align-middle';
      iconElement.style.color = '#0083B3';
    } else {
      dropboxButton.innerHTML = '<i class="fa-brands fa-dropbox fs-4 align-middle" style="color: #0083B3;"></i>';
    }
    dropboxButton.title = 'Connect to Dropbox';
    dropboxButton.onclick = loginHandler;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateSyncIndicator(SyncStatus.NOT_CONNECTED);
});
