import { loadTodos } from './todo-load.js';
import './todo-event-handlers.js';
import { removeTodoFromStorage, addTodoToStorage, updateTodoInStorage } from './todo-storage.js';
import { applyItemStyles } from './todo-ui.js';
import './todo-import.js';

const todoInput = $('#todoInput');
const addButton = $('#addButton');
const todoList = $('#todoList');
const copyAllButton = $('#copyAllButton');
const prioritySelect = $('#prioritySelect');
const projectSelect = $('#projectSelect');
const contextSelect = $('#contextSelect');
const filterButton = $('#filterButton');
const importButton = $('#importButton');
const importTextarea = $('#importTextarea');

export { todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem, projectSelect, contextSelect, todoInput, addButton, prioritySelect, filterButton, copyAllButton }; // Added missing exports

function toggleTodoCompletion(listItem) {
  const itemId = listItem.data('id');
  const itemText = listItem.find('span').text();
  const item = new jsTodoTxt.Item(itemText);

  item.setComplete(!item.complete()); // Toggle completion
  if (item.complete()) {
    item.clearPriority(); // Remove priority when completed
  }

  updateTodoInStorage(itemId, item); // Update in storage
  applyItemStyles(listItem, item); // Update styles
  listItem.find('span').text(item.toString()); // Update the text in the span
  listItem.find('button[title]').attr('title', item.complete() ? 'Mark as Incomplete' : 'Mark as Done'); // Update button title
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
  contextSelect.val(item.contexts()[0] || '');

  listItem.remove(); // Remove from the UI
}

function deleteTodoItem(listItem) {
  const itemId = listItem.data('id');
  removeTodoFromStorage(itemId); // Remove from storage
  listItem.remove(); // Remove from the UI
}

$(document).ready(function () {

  loadTodos(todoList);
  
  // --- Import Event Handlers ---
  
  // --- Import Import Functions ---
  
  // --- Initialization ---
});
