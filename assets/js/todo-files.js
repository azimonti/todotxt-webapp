/* global jsTodoTxt, showNotification */
'use strict';

import {
  getKnownFiles,
  getActiveFile,
  setActiveFile,
  removeTodoFromStorage,
  updateTodoInStorage,
  addKnownFile, // Added for setupAddFileModalListeners
  renameKnownFile, // Added for setupRenameFileModalListeners
  removeKnownFile, // Added for delete confirmation handler
  DEFAULT_FILE_PATH, // Added for rename/delete checks
  saveTodosToStorage // Added for setupAddFileModalListeners
} from './todo-storage.js';
import { applyItemStyles } from './todo-ui.js';
import { logVerbose } from './todo-logging.js';
import { loadTodos } from './todo-load.js'; // Added for file switching/deletion

// DOM Elements (assuming they are accessible globally or passed as arguments if needed)
// Consider passing these elements if this module doesn't rely on global $ selectors
const todoInput = $('#todoInput');
const addButton = $('#addButton');
const todoList = $('#todo-list');
const prioritySelect = $('#prioritySelect');
const projectSelect = $('#projectSelect');
const contextSelect = $('#contextSelect');
const fileListSidebar = $('#fileListSidebar'); // New sidebar list element
const currentFileNameHeader = $('#currentFileNameHeader'); // New header element
const addFileForm = $('#addFileForm');
const newFileNameInput = $('#newFileNameInput');
const renameFileForm = $('#renameFileForm');
const newRenameFileNameInput = $('#newRenameFileNameInput');

// Module-level variables for modal instances, initialized lazily
// These might need to be managed differently if modals are created outside this scope
let addFileModalInstance = null;
let renameFileModalInstance = null;

// Helper function to format date from YYYY-MM-DD or Date object to MM/DD/YYYY for datepicker
export function formatDateForPicker(dateInput) {
  if (!dateInput) return '';

  let date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'string') {
    // Try parsing YYYY-MM-DD
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      // Note: JS Date constructor month is 0-indexed
      date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      // Check if the date is valid after parsing
      if (isNaN(date.getTime())) return '';
    } else {
      return ''; // Invalid string format
    }
  } else {
    return ''; // Invalid input type
  }

  let month = '' + (date.getMonth() + 1);
  let day = '' + date.getDate();
  const year = date.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [month, day, year].join('/');
}

// Setup listeners for the Add File modal
export function setupAddFileModalListeners() {
  logVerbose('Setting up Add File modal listeners...');
  addFileForm.off('submit.addfile').on('submit.addfile', async function(event) {
    event.preventDefault();
    const newFileName = newFileNameInput.val();

    if (!newFileName) {
      showNotification("Error: File name cannot be empty.", 'alert');
      return;
    }
    let cleanName = newFileName.trim();
    if (!cleanName) {
      showNotification("Error: File name cannot be empty.", 'alert');
      return;
    }
    if (!cleanName.toLowerCase().endsWith('.txt')) {
      cleanName += '.txt';
      logVerbose(`Appended .txt extension: ${cleanName}`);
    }
    const newFilePath = cleanName.startsWith('/') ? cleanName : `/${cleanName}`;
    const knownFiles = getKnownFiles();
    if (knownFiles.some(file => file.path.toLowerCase() === newFilePath.toLowerCase())) {
      showNotification(`Error: File "${cleanName}" already exists.`, 'alert');
      return;
    }

    logVerbose(`Attempting to add new file: ${newFilePath}`);
    // Get instance here, assuming it's initialized elsewhere before this is called
    const addModalElement = document.getElementById('addFileModal');
    if (addModalElement) {
      addFileModalInstance = bootstrap.Modal.getInstance(addModalElement);
      if (addFileModalInstance) {
        addFileModalInstance.hide();
      }
    }


    try {
      // Dynamically import Dropbox API function if needed
      const { uploadTodosToDropbox: apiUpload } = await import('./dropbox/api.js');
      const originalActiveFile = getActiveFile();
      setActiveFile(newFilePath); // Temporarily set active to save
      saveTodosToStorage([]); // Save an empty array for the new file
      setActiveFile(originalActiveFile); // Restore original active file
      await apiUpload(newFilePath); // Upload the empty file to Dropbox
      logVerbose(`Empty file ${newFilePath} created on Dropbox.`);
      addKnownFile(cleanName, newFilePath); // Add to local known files
      setActiveFile(newFilePath); // Set the new file as active
      updateFileSelectionUI(); // Update dropdown
      loadTodos(todoList); // Load (empty) todos for the new file
      logVerbose(`File "${cleanName}" created successfully.`);
      showNotification(`File "${cleanName}" created successfully.`, 'success');
    } catch (error) {
      console.error(`Error adding file ${newFilePath}:`, error);
      showNotification(`Failed to add file "${cleanName}". Check console for details.`, 'alert');
    }
  });
  logVerbose('Add File modal listeners attached.');
}

// Setup listeners for the Rename File modal
export function setupRenameFileModalListeners() {
  logVerbose('Setting up Rename File modal listeners...');
  renameFileForm.off('submit.renamefile').on('submit.renamefile', async function(event) {
    event.preventDefault();
    const newFileName = newRenameFileNameInput.val();
    const oldFilePath = getActiveFile();

    if (oldFilePath === DEFAULT_FILE_PATH) {
      showNotification("Error: The default todo.txt file cannot be renamed.", 'alert');
      const renameModalElement = document.getElementById('renameFileModal');
      if (renameModalElement) {
        renameFileModalInstance = bootstrap.Modal.getInstance(renameModalElement);
        if (renameFileModalInstance) renameFileModalInstance.hide();
      }
      return;
    }

    if (!newFileName) {
      showNotification("Error: New file name cannot be empty.", 'alert');
      return;
    }
    let cleanNewName = newFileName.trim();
    if (!cleanNewName) {
      showNotification("Error: New file name cannot be empty.", 'alert');
      return;
    }
    if (!cleanNewName.toLowerCase().endsWith('.txt')) {
      cleanNewName += '.txt';
      logVerbose(`Appended .txt extension: ${cleanNewName}`);
    }
    const newFilePath = cleanNewName.startsWith('/') ? cleanNewName : `/${cleanNewName}`;
    if (newFilePath.toLowerCase() === oldFilePath.toLowerCase()) {
      logVerbose("Rename cancelled: New name is the same as the old name.");
      const renameModalElement = document.getElementById('renameFileModal');
      if (renameModalElement) {
        renameFileModalInstance = bootstrap.Modal.getInstance(renameModalElement);
        if (renameFileModalInstance) renameFileModalInstance.hide();
      }
      return;
    }
    const currentKnownFiles = getKnownFiles();
    if (currentKnownFiles.some(file => file.path.toLowerCase() === newFilePath.toLowerCase())) {
      showNotification(`Error: A file named "${cleanNewName}" already exists.`, 'alert');
      return;
    }

    logVerbose(`Attempting to rename file from "${oldFilePath}" to "${newFilePath}"`);
    const renameModalElement = document.getElementById('renameFileModal');
    if (renameModalElement) {
      renameFileModalInstance = bootstrap.Modal.getInstance(renameModalElement);
      if (renameFileModalInstance) renameFileModalInstance.hide(); // Hide modal
    }


    // --- Refined Rename Logic (Local First) ---
    try {
      // 1. Perform local rename first (includes moving data)
      logVerbose(`Attempting local rename for ${oldFilePath} to ${newFilePath}`);
      const localRenameSuccess = renameKnownFile(oldFilePath, cleanNewName, newFilePath);

      if (localRenameSuccess) {
        logVerbose(`Local rename successful. Updating UI...`);
        // 2. Update UI immediately after local success
        updateFileSelectionUI(); // Reflects the new active file name
        showNotification(`File renamed to "${cleanNewName}".`, 'success');

        // 3. Attempt Dropbox rename *after* local success
        try {
          const { renameDropboxFile: apiRename } = await import('./dropbox/api.js');
          logVerbose(`Attempting Dropbox rename for ${oldFilePath} to ${newFilePath}...`);
          // Corrected variable name from newPath to newFilePath
          const dropboxRenameSuccess = await apiRename(oldFilePath, newFilePath);

          if (dropboxRenameSuccess) {
            logVerbose(`Dropbox rename successful.`);
            // Optional: Update sync status for the new file path?
            // Maybe trigger a sync check for the new path?
          } else {
            logVerbose(`Dropbox rename failed or was not possible.`);
            // Notify user that Dropbox rename failed but local succeeded
            showNotification(`Note: Could not rename file on Dropbox. Local file is now "${cleanNewName}".`, 'warning');
            // Consider triggering an upload under the new name to ensure content exists on Dropbox
            // const { uploadTodosToDropbox } = await import('./dropbox/api.js');
            // uploadTodosToDropbox(newPath).catch(e => console.error("Upload after failed rename failed:", e));
          }
        } catch (dropboxError) {
          console.error(`Error during Dropbox rename attempt:`, dropboxError);
          logVerbose(`Dropbox rename attempt failed.`);
          showNotification(`Error trying to rename file on Dropbox. Local file is now "${cleanNewName}".`, 'warning');
        }

      } else {
        // Local rename failed, do not attempt Dropbox rename
        logVerbose(`Local rename failed for "${oldFilePath}" to "${newFilePath}".`);
        showNotification(`Failed to rename file locally. Check console for details.`, 'alert');
      }

    } catch (error) { // Catch errors during local rename or UI update
      console.error(`Error during file rename process:`, error);
      showNotification(`Failed to complete file rename process. Check console for details.`, 'alert');
    }
    // --- End Refined Rename Logic ---
  });
  logVerbose('Rename File modal listeners attached.');
}

export function toggleTodoCompletion(listItem) {
  const itemId = listItem.data('id');
  const itemText = listItem.find('span').text();
  const item = new jsTodoTxt.Item(itemText);

  item.setComplete(!item.complete()); // Toggle completion
  if (item.complete()) {
    item.clearPriority(); // Remove priority when completed
    if(item.created()){
      item.setCompleted(new Date()); // If there is a creation date set the complete date
    }
  } else {
    item.setCompleted(null); // Clear completion date if marked incomplete
  }

  updateTodoInStorage(itemId, item); // Update in storage
  applyItemStyles(listItem, item); // Update styles
  listItem.find('span').text(item.toString()); // Update the text in the span
  listItem.find('button[title]').attr('title', item.complete() ? 'Mark as Incomplete' : 'Mark as Done'); // Update button title
  loadTodos(todoList); // Reload the todos after completion toggle
}

export function startEditTodo(listItem) {
  const itemId = listItem.data('id');
  logVerbose(`startEditTodo called for item ID: ${itemId}`);
  const itemText = listItem.find('span').text();
  const item = new jsTodoTxt.Item(itemText);

  todoInput.val(itemText); // Populate input with current text
  addButton.text('Save Edit').data('editingId', itemId); // Change button text and store ID
  todoInput.focus(); // Focus the input

  prioritySelect.val(item.priority() || ''); // Select existing priority
  const project = item.projects()[0] || '';
  const context = item.contexts()[0] || '';

  // Update dropdown buttons and select values
  $('#projectDropdownButton').text(project ? `+${project}` : 'Project');
  projectSelect.val(project); // Use the variable directly
  $('#contextDropdownButton').text(context ? `@${context}` : 'Context');
  contextSelect.val(context); // Use the variable directly

  // Populate date pickers
  const creationDate = item.created(); // Returns Date object or null
  let dueDateString = null;
  const extensions = item.extensions(); // Get all extensions
  const dueExtension = extensions.find(ext => ext.key === 'due'); // Find the 'due' extension
  if (dueExtension) {
    dueDateString = dueExtension.value; // Assign the value if found
  }

  $('#createdDate').val(formatDateForPicker(creationDate));
  $('#dueDate').val(formatDateForPicker(dueDateString));

  // Remove the item from the list UI temporarily while editing
  // It will be re-added or updated when 'Save Edit' is clicked (handled in event-handlers.js)
  listItem.remove();
}

export function deleteTodoItem(listItem) {
  const itemId = listItem.data('id');
  logVerbose(`deleteTodoItem called for item ID: ${itemId}`);
  removeTodoFromStorage(itemId); // Remove from storage
  listItem.remove(); // Remove from the UI
  // No need to reload here, item is just removed.
}

// --- File Selection UI ---
export function updateFileSelectionUI() {
  logVerbose("Updating file selection UI...");
  const knownFiles = getKnownFiles();
  const activeFilePath = getActiveFile();
  let activeFileName = 'todo.txt'; // Default

  fileListSidebar.empty(); // Clear existing sidebar items

  knownFiles.forEach(file => {
    const listItem = $('<li class="nav-item"></li>'); // Use nav-item class
    const link = $('<a class="nav-link" href="#"></a>') // Use nav-link class
      .text(file.name)
      .data('path', file.path) // Store path in data attribute
      .click(function(e) {
        e.preventDefault();
        const selectedPath = $(this).data('path');
        if (selectedPath !== getActiveFile()) {
          logVerbose(`Switching active file to: ${selectedPath}`);
          setActiveFile(selectedPath);
          // Reload todos for the new active file
          loadTodos(todoList); // todoList needs to be accessible here
          // Update the UI again to reflect the change (button text)
          updateFileSelectionUI();
          // Optionally trigger sync for the new file?
          // Consider calling initializeDropboxSync() or a specific sync function
        }
      });

    // Highlight the active file
    if (file.path === activeFilePath) {
      link.addClass('active'); // Add Bootstrap 'active' class
      activeFileName = file.name; // Update the name for the header
    }

    listItem.append(link);
    fileListSidebar.append(listItem); // Append to the sidebar list
  });

  // Update the main header text
  currentFileNameHeader.text(activeFileName);
  logVerbose(`Active file header text set to: ${activeFileName}`);
}

// --- Add listener for the modal's confirmation button ---
// This needs to be attached in the main $(document).ready() block
// We export a function that can be called from there.
export function setupDeleteFileConfirmListener() {
  $('#confirmDeleteFileButton').off('click.deleteconfirm').on('click.deleteconfirm', async function() {
    const modalElement = $('#deleteFileModalConfirm');
    const filePathToDelete = modalElement.data('filePathToDelete');
    const fileNameToDelete = modalElement.data('fileNameToDelete'); // Retrieve the stored name

    // Hide the modal first
    const deleteModalInstance = bootstrap.Modal.getInstance(modalElement[0]);
    if (deleteModalInstance) {
      deleteModalInstance.hide();
    }

    // Validate that we retrieved the data
    if (!filePathToDelete || !fileNameToDelete) {
      console.error("Could not retrieve file path or name from modal data for deletion confirmation.");
      showNotification("Error confirming deletion. Missing file details. Please try again.", 'alert');
      // Clear data just in case
      modalElement.removeData('filePathToDelete');
      modalElement.removeData('fileNameToDelete');
      return;
    }

    logVerbose(`Confirmed deletion for file: ${fileNameToDelete} (${filePathToDelete})`);

    // --- Modified Deletion Logic (Prioritize Local Removal) ---
    let dropboxDeleteAttempted = false;
    let dropboxDeleteSuccess = false; // Assume failure initially

    try {
      // 1. Attempt to delete on Dropbox (but don't block local deletion if it fails)
      try {
        const { deleteDropboxFile: apiDelete } = await import('./dropbox/api.js');
        logVerbose(`Attempting Dropbox deletion for ${filePathToDelete}...`);
        dropboxDeleteAttempted = true;
        dropboxDeleteSuccess = await apiDelete(filePathToDelete); // Store success/failure
        if (dropboxDeleteSuccess) {
          logVerbose(`Dropbox deletion successful for ${filePathToDelete}.`);
        } else {
          logVerbose(`Dropbox deletion failed or was not possible for ${filePathToDelete}. Proceeding with local deletion.`);
        }
      } catch (dropboxError) {
        console.error(`Error during Dropbox delete attempt for ${filePathToDelete}:`, dropboxError);
        logVerbose(`Dropbox delete attempt failed for ${filePathToDelete}. Proceeding with local deletion.`);
      }

      // 2. Always remove from local storage regardless of Dropbox status
      logVerbose(`Proceeding with local removal for ${filePathToDelete}`);
      removeKnownFile(filePathToDelete); // This also handles switching active file if needed

      // 3. Update UI
      updateFileSelectionUI();

      // 4. Load todos for the new active file (should be default after deletion)
      loadTodos(todoList); // todoList needs to be accessible

      // 5. Show success notification (focused on local removal)
      showNotification(`File "${fileNameToDelete}" removed.`, 'success');
      // Add a warning if Dropbox failed but was attempted
      if (dropboxDeleteAttempted && !dropboxDeleteSuccess) {
        showNotification(`Note: Could not remove "${fileNameToDelete}" from Dropbox.`, 'warning');
      }

    } catch (error) { // Catch errors during local removal or UI update
      console.error(`Error during local deletion or UI update for ${filePathToDelete}:`, error);
      showNotification(`Failed to fully remove file "${fileNameToDelete}" locally. Check console for details.`, 'alert');
    } finally {
      // Clear data from modal after use
      modalElement.removeData('filePathToDelete');
      modalElement.removeData('fileNameToDelete');
    }
    // --- End Modified Deletion Logic ---
  });
  logVerbose('Delete file confirmation listener attached.');
}
