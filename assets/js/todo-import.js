import { addTodoToStorage } from './todo-storage.js';
import { loadTodos } from './todo-load.js';
import { todoList } from './todo.js'; // Import todoList for loadTodos

$(document).ready(function () { // Wrap in document ready

  const importButton = $('#importButton');
  const importTextarea = $('#importTextarea');

  importButton.on('click', showImportTextarea);
  importTextarea.on('blur', importTodosFromTextarea);

  function showImportTextarea() {
    importTextarea.css('display', 'block');
    importTextarea.focus();
  }

  function importTodosFromTextarea() {
    const importText = importTextarea.val().trim();
    let itemsImported = false; // Flag to check if any items were actually imported

    if (importText) {
      const lines = importText.split('\n');

      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine !== '') {
          try {
            // Use jsTodoTxt to validate the line format if needed,
            // but addTodoToStorage expects the raw string.
            // We can parse just to validate.
            const item = new jsTodoTxt.Item(trimmedLine);
            if (item.body()) { // Basic validation
              addTodoToStorage(trimmedLine); // Pass the raw string
              itemsImported = true;
            } else {
              console.warn("Skipping invalid line during import:", trimmedLine);
            }
          } catch (e) {
            console.error("Error parsing line during import:", trimmedLine, e);
          }
        }
      });

      if (itemsImported) {
        loadTodos(todoList); // Reload list to show imported items and update dropdowns
      }
      importTextarea.val(''); // Clear textarea
    }
    importTextarea.css('display', 'none'); // Hide textarea
  }
}); // Close document ready
