/* global jsTodoTxt */
'use strict';

import { applyItemStyles, createTodoSpan } from './todo-ui.js';
import { toggleTodoCompletion, startEditTodo, deleteTodoItem } from './todo.js';
import { getTodosFromStorage } from './todo-storage.js';

// Constants for localStorage keys (mirroring todo-switch.js)
const SHOW_COMPLETED_KEY = 'todoWebAppShowCompleted';
const SHOW_FUTURE_THRESHOLD_KEY = 'todoWebAppShowFutureThreshold';

// Helper function to get today's date as YYYY-MM-DD
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Main function to add a todo item to the list UI
export function addTodoToList(sortedItemData, item, todoList) {
  const listItem = $('<li></li>')
    .addClass('list-group-item')
    .css('background-color', '#2C2C2C') // Base background
    .data('id', sortedItemData.id); // Store the unique ID on the list item

  // Pass the parsed item to createTodoSpan and applyItemStyles
  const todoSpan = createTodoSpan(item);

  // --- Revert Button Creation Logic Back Inline ---
  // Make button group a flex container itself, keep flex-shrink: 0.
  const buttonGroup = $('<div>').css({'display': 'flex', 'flex-shrink': '0'}); // Use display:flex for button children
  const buttonColor = '#F8F8F2'; // Common color for icons

  // Add Check button (restore mr-1)
  const checkButton = $('<button></button>')
    .addClass('btn btn-sm mr-1') // Restored mr-1
    .html('<i class="fa-solid fa-check"></i>')
    .attr('title', item.complete() ? 'Mark as Incomplete' : 'Mark as Done') // Updated title
    .css('color', buttonColor)
    .click(function (event) {
      event.stopPropagation();
      toggleTodoCompletion(listItem); // Call extracted action function
    });
  buttonGroup.append(checkButton); // Append check button first

  // Add Edit button (restore ml-2)
  const editButton = $('<button></button>')
    .addClass('btn btn-sm ml-2') // Restored ml-2
    .html('<i class="fa-solid fa-pen-to-square"></i>')
    .attr('title', 'Edit')
    .css('color', buttonColor)
    .click(function (event) {
      event.stopPropagation();
      startEditTodo(listItem); // Call extracted action function
    });
  buttonGroup.append(editButton);

  // Add Delete button (restore ml-1)
  const deleteButton = $('<button></button>')
    .addClass('btn btn-sm ml-1') // Restored ml-1
    .html('<i class="fa-solid fa-times"></i>')
    .attr('title', 'Delete')
    .css('color', buttonColor)
    .click(function (event) {
      event.stopPropagation();
      deleteTodoItem(listItem); // Call extracted action function
    });
  buttonGroup.append(deleteButton);
  // --- End of Inlined Button Logic ---

  listItem.append(todoSpan);
  listItem.append(buttonGroup); // Append the group containing the buttons

  applyItemStyles(listItem, item); // Apply initial styles using helper

  todoList.append(listItem);
}

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
    const priorityB = b.item.priority() || 'Z';

    if (priorityA < priorityB) return -1; // Higher priority first (A < B)
    if (priorityA > priorityB) return 1;

    return 0; // Keep original relative order if same priority/completion
  });

  // --- Filtering based on switches ---
  const showCompleted = localStorage.getItem(SHOW_COMPLETED_KEY) === null ? true : localStorage.getItem(SHOW_COMPLETED_KEY) === 'true';
  const showFutureThreshold = localStorage.getItem(SHOW_FUTURE_THRESHOLD_KEY) === null ? true : localStorage.getItem(SHOW_FUTURE_THRESHOLD_KEY) === 'true';
  const todayDateStr = getTodayDateString();

  const filteredItems = itemsForSorting.filter(sortedItem => {
    const item = sortedItem.item;

    // Filter 1: Hide completed if switch is off
    if (!showCompleted && item.complete()) {
      return false;
    }

    // Filter 2: Hide future threshold if switch is off
    if (!showFutureThreshold) {
      const thresholdExtension = item.extensions().find(ext => ext.key === 't');
      const thresholdValue = thresholdExtension ? thresholdExtension.value : undefined;
      if (thresholdValue && thresholdValue > todayDateStr) {
        return false;
      }
    }

    return true; // Keep item if no filter condition met
  });
  // --- End Filtering ---


  // Clear the current list before adding filtered items
  todoList.empty();

  // Add filtered items to the list UI, passing the original object and parsed item
  filteredItems.forEach(sortedItem => {
    addTodoToList(sortedItem, sortedItem.item, todoList); // Pass the object containing id/text and the parsed item
  });
}
