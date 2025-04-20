/* global jsTodoTxt, ClipboardJS */
'use strict';

import { projectSelect, contextSelect, todoInput, addButton, prioritySelect, filterButton, todoList } from './todo.js';
import { addTodoToStorage, removeTodoFromStorage, getTodosFromStorage } from './todo-storage.js';
import { loadTodos } from './todo-load.js';
import { addTodoToList } from './todo-ui.js';
import { toggleTodoCompletion, startEditTodo, deleteTodoItem } from './todo.js';

// Helper function to format date from MM/DD/YYYY to YYYY-MM-DD
function formatDateForTodoTxt(dateString) {
  if (!dateString) return null;
  const parts = dateString.split('/');
  if (parts.length === 3) {
    // Assuming MM/DD/YYYY
    const [month, day, year] = parts;
    // Ensure two digits for month and day (though datepicker usually handles this)
    const formattedMonth = month.padStart(2, '0');
    const formattedDay = day.padStart(2, '0');
    return `${year}-${formattedMonth}-${formattedDay}`;
  }
  return null; // Invalid format
}


$(document).ready(function () {
  addButton.click(function () {
    const editingId = addButton.data('editingId'); // Get the ID being edited, if any

    if (editingId) {
      // --- Handle Saving Edit (Simplified: Delete + Add New) ---
      const newTextFromInput = todoInput.val().trim(); // Get text from input

      if (newTextFromInput !== '') {
        // 1. Delete the old item
        removeTodoFromStorage(editingId);

        // 2. Parse the input and update the item object based on UI controls
        const item = new jsTodoTxt.Item(newTextFromInput); // Parse the core text

        // Get values from UI controls
        const priority = prioritySelect.val();
        const project = projectSelect.val();
        const context = contextSelect.val();
        const createdDateVal = $('#createdDate').val();
        const dueDateVal = $('#dueDate').val();

        // Update Priority
        if (priority) {
          item.setPriority(priority);
        } else {
          // If dropdown is cleared, remove priority ONLY if it wasn't part of the original text input
          // (We rely on the initial parsing of newTextFromInput for priorities typed directly)
          // A simpler approach for now: if dropdown is empty, clear priority.
          // This might remove a priority typed in the text if the dropdown is then cleared.
          item.clearPriority();
        }

        // Update Project: Add project from dropdown if one is selected.
        // The jsTodoTxt library handles ensuring it's not duplicated if already present.
        if (project) {
          item.addProject(project);
        }

        // Update Context: Add context from dropdown if one is selected.
        // The jsTodoTxt library handles ensuring it's not duplicated if already present.
        if (context) {
          item.addContext(context);
        }

        // Update Creation Date
        const formattedCreatedDate = formatDateForTodoTxt(createdDateVal);
        if (formattedCreatedDate) {
          item.setCreated(formattedCreatedDate);
        } else {
          item.clearCreated(); // Clear if date picker is empty
        }

        // Update Due Date
        const formattedDueDate = formatDateForTodoTxt(dueDateVal);
        if (formattedDueDate) {
          item.setExtension('due', formattedDueDate);
        } else {
          item.removeExtension('due'); // Remove 'due' extension if date picker is empty
        }

        // 3. Get the final string and add to storage
        const finalTodoText = item.toString();
        addTodoToStorage(finalTodoText); // Pass the final string

        // 4. Reset UI
        addButton.text('Add Todo').removeData('editingId'); // Remove the editing ID
        todoInput.val('');
        prioritySelect.val(''); // Reset dropdowns after edit
        projectSelect.val('');
        contextSelect.val('');
        $('#createdDate').val(''); // Reset date pickers
        $('#dueDate').val('');     // Reset date pickers
        // Reset dropdown button text
        $('#priorityDropdownButton').text('Priority');
        $('#projectDropdownButton').text('Project');
        $('#contextDropdownButton').text('Context');

        // Reload the list to show the change and ensure correct sorting/filtering
        loadTodos(todoList);
      } else {
        // If new text is empty, just cancel edit without deleting
        addButton.text('Add Todo').removeData('editingId');
        todoInput.val('');
      }

    } else {
      // --- Handle Adding New Todo ---
      const todoBodyText = todoInput.val().trim();
      const priority = prioritySelect.val();
      const project = projectSelect.val();
      const context = contextSelect.val();
      const createdDateVal = $('#createdDate').val(); // Get creation date
      const dueDateVal = $('#dueDate').val();         // Get due date

      if (todoBodyText !== '') {
        let todoText = ''; // Start building the text

        // 1. Prepend priority if selected
        if (priority) {
          todoText = `(${priority}) `;
        }

        // 2. Prepend creation date if provided
        const formattedCreatedDate = formatDateForTodoTxt(createdDateVal);
        if (formattedCreatedDate) {
          todoText += `${formattedCreatedDate} `;
        }

        // 3. Add the main body text
        todoText += todoBodyText;

        // 4. Append project if selected
        if (project) {
          todoText += ` +${project}`;
        }
        // 5. Append context if selected
        if (context) {
          todoText += ` @${context}`;
        }

        // 6. Append due date if provided
        const formattedDueDate = formatDateForTodoTxt(dueDateVal);
        if (formattedDueDate) {
          todoText += ` due:${formattedDueDate}`;
        }


        // Pass the raw todoText string directly to storage
        addTodoToStorage(todoText.trim()); // Trim any potential trailing space

        // Reset input fields
        todoInput.val('');
        prioritySelect.val('');
        projectSelect.val('');
        contextSelect.val('');
        $('#createdDate').val(''); // Reset date pickers
        $('#dueDate').val('');     // Reset date pickers
        // Reset dropdown button text
        $('#priorityDropdownButton').text('Priority');
        $('#projectDropdownButton').text('Project');
        $('#contextDropdownButton').text('Context');

        // Reload the list to show the new item and ensure correct sorting/filtering
        loadTodos(todoList);
      }
    }
  });

  // Initialize Clipboard.js for the "Copy All" button
  const clipboard = new ClipboardJS('#copyAllButton', {
    text: function () {
      // Get todos directly from storage ({id, text} objects) for accuracy
      const todoObjects = getTodosFromStorage();
      // Map to parsed items for sorting
      const itemsForSorting = todoObjects.map(obj => new jsTodoTxt.Item(obj.text));
      // Sort them according to the display logic
      itemsForSorting.sort((itemA, itemB) => {
        if (itemA.complete() && !itemB.complete()) return 1;
        if (!itemA.complete() && itemB.complete()) return -1;
        const priorityA = itemA.priority() || 'Z';
        const priorityB = itemB.priority() || 'Z';
        if (priorityA < priorityB) return -1;
        if (priorityA > priorityB) return 1;
        return 0;
      });
      // Return the sorted text strings joined by newline
      return itemsForSorting.map(item => item.toString()).join('\n');
    }
  });

  clipboard.on('success', function (e) {
    // Optional: Provide user feedback
    e.clearSelection();
  });

  clipboard.on('error', function (e) {
    console.error('Failed to copy all todos:', e);
  });

  // Filter Button Logic
  filterButton.click(function() {
    const priority = prioritySelect.val();
    const project = projectSelect.val();
    const context = contextSelect.val();

    // Get the current {id, text} objects from storage
    const todoObjects = getTodosFromStorage();
    if (todoObjects.length === 0) return; // No todos to filter

    // Create List object from the text strings
    const list = new jsTodoTxt.List(todoObjects.map(obj => obj.text));

    const filterCriteria = {};
    if (priority) {
      filterCriteria.priority = priority;
    }
    if (project) {
      // Filter expects an array for projects/contexts
      filterCriteria.projectsAnd = [project];
    }
    if (context) {
      filterCriteria.contextsAnd = [context];
    }

    // If no criteria selected, show all (effectively clearing filter)
    if (Object.keys(filterCriteria).length === 0) {
      loadTodos(todoList); // Reload all todos
      return;
    }

    const filteredItems = list.filter(filterCriteria);

    // Clear the current list display
    todoList.empty();

    // Display filtered items (maintaining original sorting logic within the filtered set)
    const sortedFilteredItems = filteredItems
      .map(f => f.item) // Get the Item objects
      .sort((a, b) => {
        if (a.complete() && !b.complete()) return 1;
        if (!a.complete() && b.complete()) return -1;
        return 0;
      });

    // Display filtered items
    // We need to find the original {id, text} object for each filtered item
    const filteredTodoObjects = sortedFilteredItems.map(filteredItem => {
      // Find the original object whose text matches the filtered item's string representation
      // This assumes toString() is consistent.
      return todoObjects.find(obj => obj.text === filteredItem.toString());
    }).filter(obj => obj !== undefined); // Filter out any potential undefined results if match failed

    filteredTodoObjects.forEach(obj => {
      // Pass the found object and the already parsed/filtered item to addTodoToList
      addTodoToList(obj, new jsTodoTxt.Item(obj.text), todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem);
    });
  });
});
