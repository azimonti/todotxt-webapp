/* global jsTodoTxt */
'use strict';

// Import generateUniqueId if needed, or import saveTodosToStorage which uses it
import { getTodosFromStorage, saveTodosToStorage } from './todo-storage.js';
import { toggleTodoCompletion, startEditTodo, deleteTodoItem  } from './todo.js';
import { addTodoToList } from './todo-ui.js';
import { updateDropdowns } from './todo-dropdowns.js';

export function loadTodos(todoList) {
  // getTodosFromStorage now returns array of {id, text} or empty array
  const todoObjects = getTodosFromStorage();

  // Map to temporary objects containing id, text, and parsed item for sorting
  const itemsForSorting = todoObjects.map(obj => ({
    id: obj.id,
    text: obj.text,
    item: new jsTodoTxt.Item(obj.text) // Parse the text into an item
  }));

  // Sort based on the parsed item
  itemsForSorting.sort((a, b) => {
    const itemA = a.item;
    const itemB = b.item;

    if (itemA.complete() && !itemB.complete()) return 1; // Completed items last
    if (!itemA.complete() && itemB.complete()) return -1; // Incomplete items first

    const priorityA = itemA.priority() || 'Z'; // 'Z' for no priority
    const priorityB = itemB.priority() || 'Z';

    if (priorityA < priorityB) return -1; // Higher priority first (A < B)
    if (priorityA > priorityB) return 1;

    return 0; // Keep original relative order if same priority/completion
  });

  // Clear the current list before adding sorted items
  todoList.empty();

  // Add sorted items to the list UI, passing the original object and parsed item
  itemsForSorting.forEach(sortedItem => {
    addTodoToList(sortedItem, sortedItem.item, todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem); // Pass the object containing id/text and the parsed item
  });

  // Update dropdowns with projects/contexts from loaded items
  // Pass only the parsed items to updateDropdowns
  updateDropdowns(itemsForSorting.map(i => i.item));
}

/**
 * Parses raw text content (one todo per line) and saves it to local storage,
 * overwriting existing content. Generates new IDs for each item.
 * @param {string} textContent - The raw text content from the todo file.
 */
export function saveTodosFromText(textContent) {
  if (typeof textContent !== 'string') {
    console.error('saveTodosFromText requires a string input.');
    return;
  }

  const lines = textContent.split('\n');
  const newTodoObjects = lines
    .map(line => line.trim()) // Trim whitespace
    .filter(line => line.length > 0) // Filter out empty lines
    .map(line => ({
      // We need a way to generate IDs here. Let's assume generateUniqueId is accessible
      // or re-import saveTodosToStorage which handles ID generation implicitly if needed.
      // For simplicity, let's structure it assuming saveTodosToStorage handles it,
      // but the current saveTodosToStorage expects objects with IDs already.
      // Let's refine: We need generateUniqueId here.
      // Re-importing from todo-storage might cause circular dependency issues.
      // Best approach: todo-storage should export generateUniqueId or saveTodos should handle text array.
      // Let's modify todo-storage slightly later if needed. For now, assume we can generate IDs.
      // TEMPORARY ID generation - will refine if needed by modifying todo-storage
      id: Date.now().toString(36) + Math.random().toString(36).substring(2) + lines.indexOf(line), // Simple unique ID
      text: line
    }));

  console.log(`Parsed ${newTodoObjects.length} todos from downloaded text.`);
  saveTodosToStorage(newTodoObjects); // Overwrite local storage
  console.log('Saved downloaded todos to local storage.');
  // The UI reload should happen in the calling function (syncWithDropbox)
}
