import { projectSelect, contextSelect, todoInput, addButton, prioritySelect, filterButton, copyAllButton, todoList } from './todo.js';
import { addTodoToStorage, removeTodoFromStorage, getTodosFromStorage } from './todo-storage.js'; // Import storage functions
import { loadTodos } from './todo-load.js'; // Import loadTodos
import { addTodoToList } from './todo-ui.js'; // Import addTodoToList
import { toggleTodoCompletion, startEditTodo, deleteTodoItem } from './todo.js'; // Import action functions

$(document).ready(function () { // Wrap in document ready
  addButton.click(function () {
      const editingId = addButton.data('editingId'); // Get the ID being edited, if any

    if (editingId) {
      // --- Handle Saving Edit (Simplified: Delete + Add New) ---
      const newTextFromInput = todoInput.val().trim(); // Get text from input

      if (newTextFromInput !== '') {
        // 1. Delete the old item
        removeTodoFromStorage(editingId);

        // 2. Construct the new item text (similar to adding a new todo)
        let newTodoText = newTextFromInput;
        const priority = prioritySelect.val(); // Check if priority dropdown was used during edit
        const project = projectSelect.val();   // Check project dropdown
        const context = contextSelect.val();   // Check context dropdown

        // Prepend priority if selected or if present in the input text itself
        const inputPriorityMatch = newTodoText.match(/^\( *([A-Z]) *\) /);
        if (priority) {
            newTodoText = `(${priority}) ${newTodoText.replace(/^\( *[A-Z] *\) /, '')}`; // Replace existing if dropdown used
        } else if (inputPriorityMatch) {
            // Keep priority parsed from input if dropdown wasn't used
            // No change needed to newTodoText
        }

        // Append project/context if selected via dropdowns (avoid duplicates if already in text)
        const tempItemForMeta = new jsTodoTxt.Item(newTodoText); // Parse to check existing meta
        if (project && !tempItemForMeta.projects().includes(project)) {
          newTodoText = `${newTodoText} +${project}`;
        }
        if (context && !tempItemForMeta.contexts().includes(context)) {
          newTodoText = `${newTodoText} @${context}`;
        }
        // --- Creation date is NOT added or modified during edit ---
        // It will only be present if included in newTodoText from the input field.

        // 3. Add the final constructed text string to storage
        addTodoToStorage(newTodoText); // Pass the raw string

        // 4. Reset UI
        addButton.text('Add Todo').removeData('editingId'); // Remove the editing ID
        todoInput.val('');
        prioritySelect.val(''); // Reset dropdowns after edit
        projectSelect.val('');
        contextSelect.val('');

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

      if (todoBodyText !== '') {
        let todoText = todoBodyText;

        // Prepend priority if selected
        if (priority) {
          todoText = `(${priority}) ${todoText}`;
        }
        // Append project if selected
        if (project) {
          todoText = `${todoText} +${project}`;
        }
        // Append context if selected
        if (context) {
          todoText = `${todoText} @${context}`;
        }

        // --- Removed automatic creation date addition ---


        // Pass the raw todoText string directly to storage
        addTodoToStorage(todoText);

        // Reset input fields
        todoInput.val('');
        prioritySelect.val('');
        projectSelect.val('');
        contextSelect.val('');

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

    // Optional: Change button text to indicate filter is active?
    // filterButton.text('Clear Filter'); // Need logic to toggle back
  });
}); // Close document ready
