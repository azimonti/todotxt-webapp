// assets/js/todo-list-display.js

import { applyItemStyles, createTodoSpan } from './todo-ui.js';

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

  // Clear the current list before adding sorted items
  todoList.empty();

  // Add sorted items to the list UI, passing the original object and parsed item
  itemsForSorting.forEach(sortedItem => {
    addTodoToList(sortedItem, sortedItem.item, todoList); // Pass the object containing id/text and the parsed item
  });
}
