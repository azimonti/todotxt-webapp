/* global jsTodoTxt */
'use strict';

import { loadTodos } from './todo-load.js';
import './todo-event-handlers.js';
import { removeTodoFromStorage, updateTodoInStorage } from './todo-storage.js';
import { applyItemStyles } from './todo-ui.js';
import './todo-import.js';
import { setupDropdownHandlers } from './todo-dropdowns.js';

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

export { todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem, projectSelect, contextSelect, todoInput, addButton, prioritySelect, filterButton, copyAllButton }; // Added missing exports

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

$(document).ready(function () {

  setupDropdownHandlers();
  loadTodos(todoList);
});
