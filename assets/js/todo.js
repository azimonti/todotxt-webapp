/* global jsTodoTxt */
'use strict';

import { loadTodos } from './todo-load.js';
import './todo-event-handlers.js';
import {
  removeTodoFromStorage,
  updateTodoInStorage,
  getKnownFiles,
  getActiveFile,
  setActiveFile
} from './todo-storage.js';
import { applyItemStyles } from './todo-ui.js';
import './todo-import.js';
import { setupDropdownHandlers } from './todo-dropdowns.js';
import { initializeDropboxSync, uploadTodosToDropbox } from './dropbox-sync.js'; // Import Dropbox sync initializer and upload function
import { logVerbose } from './todo-logging.js'; // Import logging


// Helper function to format date from YYYY-MM-DD or Date object to MM/DD/YYYY for datepicker
function formatDateForPicker(dateInput) {
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
const renameFileForm = $('#renameFileForm'); // Rename Form
const currentFileNameToRename = $('#currentFileNameToRename'); // Span to show current name
const newRenameFileNameInput = $('#newRenameFileNameInput'); // Input for new name

// Module-level variables for modal instances, initialized lazily
let addFileModalInstance = null;
let renameFileModalInstance = null;

export { todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem, projectSelect, contextSelect, todoInput, addButton, prioritySelect, filterButton, copyAllButton }; // Added missing exports


// --- Modal Listener Setup Functions (called only once per modal) ---

// Setup listeners for the Add File modal
function setupAddFileModalListeners() {
    logVerbose('Setting up Add File modal listeners...');
    addFileForm.off('submit.addfile').on('submit.addfile', async function(event) {
        event.preventDefault();
        const newFileName = newFileNameInput.val();

        if (!newFileName) {
          alert("Error: File name cannot be empty.");
          return;
        }
        let cleanName = newFileName.trim();
        if (!cleanName) {
            alert("Error: File name cannot be empty.");
            return;
        }
        if (!cleanName.toLowerCase().endsWith('.txt')) {
            cleanName += '.txt';
            logVerbose(`Appended .txt extension: ${cleanName}`);
        }
        const newFilePath = cleanName.startsWith('/') ? cleanName : `/${cleanName}`;
        const knownFiles = getKnownFiles();
        if (knownFiles.some(file => file.path.toLowerCase() === newFilePath.toLowerCase())) {
            alert(`Error: File "${newFilePath}" already exists.`);
            return;
        }

        logVerbose(`Attempting to add new file: ${newFilePath}`);
        if (addFileModalInstance) { // Hide modal if instance exists
            addFileModalInstance.hide();
        }

        try {
            const { uploadTodosToDropbox: apiUpload } = await import('./dropbox/api.js');
            const originalActiveFile = getActiveFile();
            setActiveFile(newFilePath);
            const { saveTodosToStorage: tempSave } = await import('./todo-storage.js');
            tempSave([]);
            setActiveFile(originalActiveFile);
            await apiUpload(newFilePath);
            logVerbose(`Empty file ${newFilePath} created on Dropbox.`);
            const { addKnownFile } = await import('./todo-storage.js');
            addKnownFile(cleanName, newFilePath);
            setActiveFile(newFilePath);
                updateFileSelectionUI();
                loadTodos(todoList);
                // alert(`File "${cleanName}" created successfully.`); // Removed alert
                logVerbose(`File "${cleanName}" created successfully.`); // Keep log
            } catch (error) {
                console.error(`Error adding file ${newFilePath}:`, error);
                alert(`Failed to add file "${cleanName}". Check console for details.`); // Keep error alert
        }
    });
    logVerbose('Add File modal listeners attached.');
}

// Setup listeners for the Rename File modal
function setupRenameFileModalListeners() {
    logVerbose('Setting up Rename File modal listeners...');
    renameFileForm.off('submit.renamefile').on('submit.renamefile', async function(event) {
        event.preventDefault();
        const newFileName = newRenameFileNameInput.val();
        const oldFilePath = getActiveFile();

         const { DEFAULT_FILE_PATH } = await import('./todo-storage.js');
         if (oldFilePath === DEFAULT_FILE_PATH) {
             alert("Error: The default todo.txt file cannot be renamed.");
             if (renameFileModalInstance) renameFileModalInstance.hide();
             return;
         }

        if (!newFileName) {
          alert("Error: New file name cannot be empty.");
          return;
        }
        let cleanNewName = newFileName.trim();
        if (!cleanNewName) {
            alert("Error: New file name cannot be empty.");
            return;
        }
         if (!cleanNewName.toLowerCase().endsWith('.txt')) {
            cleanNewName += '.txt';
            logVerbose(`Appended .txt extension: ${cleanNewName}`);
        }
        const newFilePath = cleanNewName.startsWith('/') ? cleanNewName : `/${cleanNewName}`;
        if (newFilePath.toLowerCase() === oldFilePath.toLowerCase()) {
            logVerbose("Rename cancelled: New name is the same as the old name.");
             if (renameFileModalInstance) renameFileModalInstance.hide();
            return;
        }
        const currentKnownFiles = getKnownFiles();
        if (currentKnownFiles.some(file => file.path.toLowerCase() === newFilePath.toLowerCase())) {
            alert(`Error: A file named "${cleanNewName}" already exists.`);
            return;
        }

        logVerbose(`Attempting to rename file from "${oldFilePath}" to "${newFilePath}"`);
        if (renameFileModalInstance) renameFileModalInstance.hide(); // Hide modal

        try {
            const { renameDropboxFile: apiRename } = await import('./dropbox/api.js');
            const renameSuccess = await apiRename(oldFilePath, newFilePath);

            if (renameSuccess) {
                const { renameKnownFile } = await import('./todo-storage.js');
                renameKnownFile(oldFilePath, cleanNewName, newFilePath);
                updateFileSelectionUI();
                // alert(`File successfully renamed to "${cleanNewName}".`); // Removed alert
                logVerbose(`File successfully renamed to "${cleanNewName}".`); // Keep log
            } else {
                logVerbose(`Dropbox rename failed for "${oldFilePath}" to "${newFilePath}".`);
            }
        } catch (error) {
            console.error(`Error renaming file from ${oldFilePath} to ${newFilePath}:`, error);
            alert(`Failed to rename file. Check console for details.`);
        }
    });
     logVerbose('Rename File modal listeners attached.');
}

function toggleTodoCompletion(listItem) {
  const itemId = listItem.data('id');
  const itemText = listItem.find('span').text();
  const item = new jsTodoTxt.Item(itemText);

  item.setComplete(!item.complete()); // Toggle completion
  if (item.complete()) {
    item.clearPriority(); // Remove priority when completed
    if(item.created()){
      item.setCompleted(new Date()); // If there is a creation date set the complete date
    }
  }

  updateTodoInStorage(itemId, item); // Update in storage
  applyItemStyles(listItem, item); // Update styles
  listItem.find('span').text(item.toString()); // Update the text in the span
  listItem.find('button[title]').attr('title', item.complete() ? 'Mark as Incomplete' : 'Mark as Done'); // Update button title
  loadTodos(todoList); // Add this line to reload the todos after completion toggle
}

function startEditTodo(listItem) {
  const itemId = listItem.data('id');
  const itemText = listItem.find('span').text();
  const item = new jsTodoTxt.Item(itemText);

  todoInput.val(itemText); // Populate input with current text
  addButton.text('Save Edit').data('editingId', itemId); // Change button text and store ID
  todoInput.focus(); // Focus the input

  prioritySelect.val(item.priority() || ''); // Select existing priority
  // Find and select existing project/context, or set to empty string if not found
  projectSelect.val(item.projects()[0] || '');
  const project = item.projects()[0] || '';
  const context = item.contexts()[0] || '';

  $('#projectDropdownButton').text(project ? `+${project}` : 'Project');
  $('#projectSelect').val(project);
  $('#contextDropdownButton').text(context ? `@${context}` : 'Context');
  $('#contextSelect').val(context);

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

  listItem.remove(); // Remove from the UI
}

function deleteTodoItem(listItem) {
  const itemId = listItem.data('id');
  removeTodoFromStorage(itemId); // Remove from storage
  listItem.remove(); // Remove from the UI
}

// --- File Selection UI ---
function updateFileSelectionUI() {
  logVerbose("Updating file selection UI...");
  const knownFiles = getKnownFiles();
  const activeFilePath = getActiveFile();
  let activeFileName = 'todo.txt'; // Default

  fileSelectionMenu.empty(); // Clear existing options

  knownFiles.forEach(file => {
    const listItem = $('<li></li>');
    const link = $('<a class="dropdown-item" href="#"></a>')
      .text(file.name)
      .data('path', file.path) // Store path in data attribute
      .click(function(e) {
        e.preventDefault();
        const selectedPath = $(this).data('path');
        if (selectedPath !== getActiveFile()) {
          logVerbose(`Switching active file to: ${selectedPath}`);
          setActiveFile(selectedPath);
          // Reload todos for the new active file
          loadTodos(todoList);
          // Update the UI again to reflect the change (button text)
          updateFileSelectionUI();
          // Optionally trigger sync for the new file?
          // initializeDropboxSync(); // Or a more specific sync function if available
        }
      });

    // Optional: Highlight the active file
    if (file.path === activeFilePath) {
      link.addClass('active'); // Add Bootstrap 'active' class
      activeFileName = file.name; // Update the name for the button
    }

    listItem.append(link);
    fileSelectionMenu.append(listItem);
  });

  // Update the main dropdown button text
  fileSelectionDropdown.text(activeFileName);
  logVerbose(`Active file button text set to: ${activeFileName}`);
}


$(document).ready(function () {
  // Note: Modal instances (addFileModalInstance, renameFileModalInstance) are defined at module level

  setupDropdownHandlers();
  updateFileSelectionUI(); // Populate file dropdown initially
  loadTodos(todoList); // Load todos for the initially active file
  initializeDropboxSync(); // Initialize Dropbox sync system (will sync active file)

  // --- File Management Event Listeners ---

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

      // Initialize instance and listeners ONCE
      if (!addFileModalInstance) {
          // console.log("Initializing Add File Modal instance for the first time."); // Removed log
          addFileModalInstance = new window.bootstrap.Modal(addModalElement);
          setupAddFileModalListeners(); // Setup listeners only once
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

        // Initialize instance and listeners ONCE
        if (!renameFileModalInstance) {
            // console.log("Initializing Rename File Modal instance for the first time."); // Removed log
            renameFileModalInstance = new window.bootstrap.Modal(renameModalElement);
            setupRenameFileModalListeners(); // Setup listeners only once
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

        const { DEFAULT_FILE_PATH } = await import('./todo-storage.js');
         if (currentFilePath === DEFAULT_FILE_PATH) {
             alert("Error: The default todo.txt file cannot be renamed.");
             return;
         }

        currentFileNameToRename.text(currentFile.name);
        newRenameFileNameInput.val(currentFile.name);
        renameFileModalInstance.show(); // Show the instance

     } catch (e) {
        console.error("Error showing Rename File modal:", e);
        alert("Error opening Rename file dialog.");
     }
  });

  // REMOVED standalone renameFileForm.submit handler (logic moved to setupRenameFileModalListeners)


  // TODO: Add event listener for deleteFileButton
});
