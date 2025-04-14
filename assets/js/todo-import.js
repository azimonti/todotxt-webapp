/* global jsTodoTxt, showNotification */
'use strict';

import { addTodoToStorage } from './todo-storage.js';
import { loadTodos } from './todo-load.js';
import { todoList } from './todo.js';
import { logVerbose } from './todo-logging.js'; // Added logging

/**
 * Processes the imported text content, adding valid todo items to storage.
 * @param {string} textContent - The raw text content (multiple lines).
 */
function processImportedText(textContent) {
  let itemsImported = false; // Flag to check if any items were actually imported
  let linesSkipped = 0;

  if (textContent) {
    const lines = textContent.split('\n');
    logVerbose(`Processing ${lines.length} lines from import...`);

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine !== '') {
        try {
          // Use jsTodoTxt to validate the line format if needed,
          // but addTodoToStorage expects the raw string.
          // We can parse just to validate.
          const item = new jsTodoTxt.Item(trimmedLine);
          if (item.body()) { // Basic validation: ensure there's some text content
            addTodoToStorage(trimmedLine); // Pass the raw string
            itemsImported = true;
          } else {
            console.warn("Skipping invalid or empty line during import:", trimmedLine);
            linesSkipped++;
          }
        } catch (e) {
          console.error("Error parsing line during import:", trimmedLine, e);
          linesSkipped++;
        }
      }
    });

    if (itemsImported) {
      logVerbose(`Import successful. ${lines.length - linesSkipped} items added.`);
      loadTodos(todoList); // Reload list to show imported items and update dropdowns
      showNotification('Todos imported successfully.', 'success');
      if (linesSkipped > 0) {
        showNotification(`${linesSkipped} line(s) skipped during import (invalid format or empty).`, 'warning', null, 7000);
      }
    } else {
      logVerbose('Import finished, but no valid todo items were found to add.');
      showNotification('No valid todo items found in the imported text.', 'info');
    }
  } else {
    logVerbose('Import processing skipped: No text content provided.');
  }
}


$(document).ready(function () {
  logVerbose('Initializing import listeners...');

  const importButton = $('#importButton'); // Button to show textarea
  const importTextarea = $('#importTextarea'); // Textarea for pasting
  const importFileDiskInput = $('#importFileDiskInput'); // Hidden file input

  // --- Textarea Import ---
  importButton.on('click', function() {
    importTextarea.val(''); // Clear before showing
    importTextarea.css('display', 'block');
    importTextarea.focus();
  });

  importTextarea.on('blur', function() {
    const importText = importTextarea.val().trim();
    if (importText) { // Only process if there's text
      processImportedText(importText);
    }
    importTextarea.val(''); // Clear textarea after processing or if empty
    importTextarea.css('display', 'none'); // Hide textarea
  });

  // --- File Import from Disk ---
  importFileDiskInput.on('change', function(event) {
    const file = event.target.files[0];
    if (!file) {
      logVerbose('File import cancelled or no file selected.');
      return; // No file selected
    }

    logVerbose(`File selected for import: ${file.name} (Type: ${file.type}, Size: ${file.size} bytes)`);

    // Basic validation (optional, but good practice)
    if (file.type !== 'text/plain') {
      showNotification(`Error: Invalid file type "${file.type}". Please select a .txt file.`, 'alert');
      // Clear the input value so the user can select the same file again if needed after fixing
      $(this).val('');
      return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
      logVerbose('File read successfully.');
      const fileContent = e.target.result;
      processImportedText(fileContent); // Use the common processing function
      // Clear the input value after successful processing
      importFileDiskInput.val('');
    };

    reader.onerror = function(e) {
      console.error("Error reading file:", e);
      showNotification('Error reading the selected file.', 'alert');
      // Clear the input value on error as well
      importFileDiskInput.val('');
    };

    reader.readAsText(file); // Read the file as text
  });

  logVerbose('Import listeners attached.');
});
