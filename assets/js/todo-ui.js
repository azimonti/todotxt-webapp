// assets/js/todo-ui.js

// Helper to get color based on priority
function getPriorityColor(priority) {
  switch (priority) {
    case 'A': return '#CC4027'; // Red
    case 'B': return '#B4B22A'; // Yellow
    case 'C': return '#3AC12B'; // Green
    default: return '#F8F8F2'; // Default/Gray for D, E, F or no priority
  }
}

// Helper to apply styles based on completion and priority
export function applyItemStyles(listItem, item) {
  if (item.complete()) {
    listItem.addClass('task-done');
    listItem.css('text-decoration', 'line-through');
    listItem.css('color', '#7E8E91'); // Specific color for completed tasks
  } else {
    listItem.removeClass('task-done');
    listItem.css('text-decoration', 'none');
    listItem.css('color', getPriorityColor(item.priority()));
  }
}

// Helper to create the main text span
export function createTodoSpan(item) {
  return $('<span></span>')
    .text(item.toString())
    .css('cursor', 'pointer')
    .attr('title', 'Click to copy')
    .click(function () {
      navigator.clipboard.writeText($(this).text())
        .then(() => console.log('Todo item copied to clipboard!'))
        .catch(err => console.error('Failed to copy text: ', err));
    });
}

// Main function to add a todo item to the list UI
export function addTodoToList(sortedItemData, item, todoList, toggleTodoCompletion, startEditTodo, deleteTodoItem) {
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
    .addClass('btn btn-sm ml-1') // Restored mr-1
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
