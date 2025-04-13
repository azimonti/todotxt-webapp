/* global jsTodoTxt */
'use strict';

import { loadTodos } from './todo-load.js';
import './todo-event-handlers.js';
import {
  removeTodoFromStorage,
  updateTodoInStorage,
  getKnownFiles,
  getActiveFile,
  setActiveFile,
  DEFAULT_FILE_PATH // Import DEFAULT_FILE_PATH for checks
} from './todo-storage.js';
// import { applyItemStyles } from './todo-ui.js'; // Moved to todo-logic.js
import './todo-import.js';
import { setupDropdownHandlers } from './todo-dropdowns.js';
import { initializeDropboxSync } from './dropbox-sync.js'; // uploadTodosToDropbox is likely used within logic now
import { logVerbose } from './todo-logging.js'; // Import logging
import {
    formatDateForPicker, // Keep if needed locally, or remove if only used in moved functions
    setupAddFileModalListeners,
    setupRenameFileModalListeners,
    toggleTodoCompletion, // Keep export if needed by event-handlers? Check usage.
    startEditTodo,        // Keep export if needed by event-handlers? Check usage.
    deleteTodoItem,       // Keep export if needed by event-handlers? Check usage.
    updateFileSelectionUI,
    setupDeleteFileConfirmListener // Import the new listener setup
} from './todo-files.js'; // Updated import path
// Removed incorrect import: import { showNotification } from './notif-flash.min.js';


// DOM Elements remain accessible globally via $
const todoInput = $('#todoInput');
const addButton = $('#addButton');
const todoList = $('#todo-list');
const copyAllButton = $('#copyAllButton');
const prioritySelect = $('#prioritySelect');
const projectSelect = $('#projectSelect');
const contextSelect = $('#contextSelect');
const filterButton = $('#filterButton');
const fileSelectionDropdown = $('#fileSelectionDropdown'); // File dropdown button
const fileSelectionMenu = $('#fileSelectionMenu'); // File dropdown menu UL
const addFileButton = $('#addFileButton'); // Add file button
const renameFileButton = $('#renameFileButton'); // Rename file button
const deleteFileButton = $('#deleteFileButton'); // Delete file button
// Modal instances will be created inside $(document).ready()
const addFileForm = $('#addFileForm'); // Form inside the modal
const newFileNameInput = $('#newFileNameInput'); // Input field in the modal
const renameFileForm = $('#renameFileForm'); // Rename Form - Keep for listener setup
const currentFileNameToRename = $('#currentFileNameToRename'); // Span to show current name - Keep for modal population
const newRenameFileNameInput = $('#newRenameFileNameInput'); // Input for new name - Keep for listener setup

// Module-level variables for modal instances, initialized lazily
// These are now primarily managed within the modal opening logic below
let addFileModalInstance = null;
let renameFileModalInstance = null;
// Delete modal instance is handled within its own logic

// Export DOM elements and potentially functions needed by other modules (like event handlers)
// Review if toggleTodoCompletion, startEditTodo, deleteTodoItem are truly needed here
// If event-handlers.js imports them, keep them. Otherwise, remove.
// Assuming event-handlers.js might need them:
export { todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem, projectSelect, contextSelect, todoInput, addButton, prioritySelect, filterButton, copyAllButton };


// --- All functions moved to todo-logic.js ---


$(document).ready(function () {
  // Modal instances are initialized when first opened below

  logVerbose("Document ready: Initializing UI and listeners.");
  setupDropdownHandlers();
  updateFileSelectionUI(); // Populate file dropdown initially
  loadTodos(todoList); // Load todos for the initially active file
  initializeDropboxSync(); // Initialize Dropbox sync system (will sync active file)
  setupDeleteFileConfirmListener(); // Setup the listener for the delete confirmation modal's button ONCE

  // --- File Management Button Click Handlers (Modal Openers) ---

  // Add New File Button Click Handler
  addFileButton.click(function() {
    try {
      const addModalElement = document.getElementById('addFileModal');
      if (!addModalElement) {
          console.error("Add File Modal element not found in HTML.");
          alert("Error: Add file dialog component is missing.");
          return;
      }
      // Check if Bootstrap Modal is available
      if (typeof window.bootstrap === 'undefined' || !window.bootstrap.Modal) {
          console.error("Bootstrap Modal component not found.");
          alert("Error: UI library component (Modal) not loaded.");
          return;
      }

      // Initialize instance ONCE, setup listeners ONCE
      if (!addFileModalInstance) {
          logVerbose("Initializing Add File Modal instance and listeners for the first time.");
          addFileModalInstance = new window.bootstrap.Modal(addModalElement);
          setupAddFileModalListeners(); // Setup listeners via imported function
      } else {
          logVerbose("Add File Modal instance already exists.");
      }

      // Prepare and show
      newFileNameInput.val(''); // Clear input field
      addFileModalInstance.show();

    } catch (e) {
       console.error("Error showing Add File modal:", e);
       alert("Error opening Add file dialog.");
    }
  });

  // REMOVED standalone addFileForm.submit handler (logic moved to setupAddFileModalListeners)


  // Show Rename File Modal when button is clicked
  renameFileButton.click(async function() { // <-- Make this async
     try {
        const renameModalElement = document.getElementById('renameFileModal');
         if (!renameModalElement) {
            console.error("Rename File Modal element not found in HTML.");
            alert("Error: Rename file dialog component is missing.");
            return;
        }
        // Check if Bootstrap Modal is available
        if (typeof window.bootstrap === 'undefined' || !window.bootstrap.Modal) {
            console.error("Bootstrap Modal component not found.");
            alert("Error: UI library component (Modal) not loaded.");
            return;
        }

      // Initialize instance ONCE, setup listeners ONCE
      if (!renameFileModalInstance) {
          logVerbose("Initializing Rename File Modal instance and listeners for the first time.");
          renameFileModalInstance = new window.bootstrap.Modal(renameModalElement);
          setupRenameFileModalListeners(); // Setup listeners via imported function
      } else {
          logVerbose("Rename File Modal instance already exists.");
      }

      // Proceed with checks and showing the modal
        const currentFilePath = getActiveFile();
        const knownFiles = getKnownFiles();
        const currentFile = knownFiles.find(f => f.path === currentFilePath);

        if (!currentFile) {
            console.error("Cannot rename: Active file not found in known files list.");
            alert("Error: Could not find the current file details.");
            return;
        }

        // Use imported DEFAULT_FILE_PATH
         if (currentFilePath === DEFAULT_FILE_PATH) {
             showNotification("Error: The default todo.txt file cannot be renamed.", 'alert'); // Use notification
             return;
         }

        currentFileNameToRename.text(currentFile.name); // Populate modal field
        newRenameFileNameInput.val(currentFile.name);
        renameFileModalInstance.show(); // Show the instance

     } catch (e) {
        console.error("Error showing Rename File modal:", e);
        alert("Error opening Rename file dialog.");
     }
  });

  // REMOVED standalone renameFileForm.submit handler (logic moved to setupRenameFileModalListeners)


  // Delete File Button Click Handler
  deleteFileButton.click(async function() {
    const filePathToDelete = getActiveFile();
    const knownFiles = getKnownFiles();
    const fileToDelete = knownFiles.find(f => f.path === filePathToDelete);

    if (!fileToDelete) {
        console.error("Cannot delete: Active file not found in known files list.");
        showNotification("Error: Could not find the current file details.", 'alert');
        return;
    }

    // Prevent deleting the default file (use imported constant)
    if (filePathToDelete === DEFAULT_FILE_PATH) {
        showNotification("Error: The default todo.txt file cannot be deleted.", 'alert');
        return;
    }

    // --- Replace confirm() with Bootstrap Modal ---
    logVerbose(`Requesting delete confirmation for file: ${fileToDelete.name} (${filePathToDelete})`);

    // Populate the modal
    $('#fileNameToDelete').text(fileToDelete.name); // Set the file name in the modal body
    // Store path and name on the modal itself for the confirmation handler
    $('#deleteFileModalConfirm').data('filePathToDelete', filePathToDelete);
    $('#deleteFileModalConfirm').data('fileNameToDelete', fileToDelete.name);

    // Show the Bootstrap modal
    const deleteModalEl = document.getElementById('deleteFileModalConfirm');
    if (deleteModalEl) {
        // Use getOrCreateInstance to safely get/create the modal instance
        const deleteModal = bootstrap.Modal.getOrCreateInstance(deleteModalEl);
        deleteModal.show();
    } else {
        console.error("Delete confirmation modal element (#deleteFileModalConfirm) not found!");
        // Fallback or show error if modal doesn't exist
        showNotification("Error: Delete confirmation dialog component is missing.", 'alert');
    }
    // --- End modal replacement ---

    // The actual deletion logic is now handled by the listener setup in setupDeleteFileConfirmListener()
    // which is called once in $(document).ready()
  });

  // REMOVED standalone delete confirmation listener (moved to setupDeleteFileConfirmListener in todo-logic.js)

});
