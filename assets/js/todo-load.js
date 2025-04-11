/* global jsTodoTxt */
'use strict';

import { getTodosFromStorage } from './todo-storage.js';
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
