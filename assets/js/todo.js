$(document).ready(function () {
  const todoInput = $('#todoInput');
  const addButton = $('#addButton');
  const todoList = $('#todoList');
  const copyAllButton = $('#copyAllButton'); // Added Copy All button selector

 function loadTodos() {
    const todos = localStorage.getItem('todos');
    if (todos) {
      JSON.parse(todos).forEach(todoText => {
        const item = new jsTodoTxt.Item(todoText);
        addTodoToList(item);
      });
    }
  }

  function saveTodos(todos) {
    localStorage.setItem('todos', JSON.stringify(todos));
  }

  function addTodoToList(item) {
    const listItem = $('<li></li>').addClass('list-group-item');

    const todoSpan = $('<span></span>')
      .text(item.toString()) // Use item.toString() to display todo text
      .css('cursor', 'pointer')
      .attr('title', 'Click to copy')
      .click(function() {
        navigator.clipboard.writeText($(this).text())
          .then(() => {
            console.log('Todo item copied to clipboard!');
          })
          .catch(err => {
            console.error('Failed to copy text: ', err);
          });
      });
    listItem.append(todoSpan);

    const buttonGroup = $('<div>').addClass('float-right');

    const editButton = $('<button></button>')
      .addClass('btn btn-sm btn-outline-secondary ml-2')
      .html('<i class="fa-solid fa-pen-to-square"></i>')
      .attr('title', 'Edit')
      .click(function(event) {
        event.stopPropagation();
        const todoTextToEdit = todoSpan.text();
        const item = new jsTodoTxt.Item(todoTextToEdit);
        todoInput.val(item.body()); // Set input value to the body of the todo item for editing
        todoInput.focus();
        addButton.text('Save Edit').data('editing', listItem);
      });
    buttonGroup.append(editButton);

    const deleteButton = $('<button></button>')
      .addClass('btn btn-sm btn-outline-danger ml-1')
      .html('<i class="fa-solid fa-times"></i>')
      .attr('title', 'Delete')
      .click(function(event) {
        event.stopPropagation();
        const listItemToDelete = $(this).closest('.list-group-item');
        const todoTextToDelete = todoSpan.text();
        listItemToDelete.remove();
        removeTodoFromStorage(todoTextToDelete);
      });
    buttonGroup.append(deleteButton);

    listItem.append(buttonGroup);
    todoList.append(listItem);
  }

 function removeTodoFromStorage(todoTextToDelete) {
    let todos = JSON.parse(localStorage.getItem('todos') || '[]');
    const todoToDelete = new jsTodoTxt.Item(todoTextToDelete);
    todos = todos.filter(todo => {
      const item = new jsTodoTxt.Item(todo);
      return item.toString() !== todoToDelete.toString();
    });
    saveTodos(todos);
  }


 addButton.click(function () {
    if (addButton.data('editing')) {
      const editedListItem = addButton.data('editing');
      const oldTodoText = editedListItem.find('span').text();
      const newTodoText = todoInput.val().trim();

      if (newTodoText !== '') {
        const editedItem = new jsTodoTxt.Item(newTodoText);
        editedListItem.find('span').text(editedItem.toString());
        updateTodoInStorage(oldTodoText, editedItem);
        addButton.text('Add Todo').removeData('editing');
        todoInput.val('');
      }
    } else {
      const todoText = todoInput.val().trim();
      if (todoText !== '') {
        const item = new jsTodoTxt.Item(todoText);
        addTodoToList(item);

        let todos = JSON.parse(localStorage.getItem('todos') || '[]');
        todos.push(item.toString());
        saveTodos(todos);
        todoInput.val('');
      }
    }
  });


  function updateTodoInStorage(oldTodoText, newItem) {
    let todos = JSON.parse(localStorage.getItem('todos') || '[]');
    const oldItem = new jsTodoTxt.Item(oldTodoText);
    const index = todos.findIndex(todo => {
      const item = new jsTodoTxt.Item(todo);
      return item.toString() === oldItem.toString();
    });
    if (index > -1) {
      todos[index] = newItem.toString();
      saveTodos(todos);
    }
  }


  // Initialize Clipboard.js for the "Copy All" button
  const clipboard = new ClipboardJS('#copyAllButton', {
    text: function() {
      let allTodosText = '';
      $('#todoList li').each(function() {
        allTodosText += $(this).text() + '\n';
      });
      return allTodosText.trim();
    }
  });

  clipboard.on('success', function(e) {
    console.log('All todos copied!');
    // Optional: Provide user feedback
    e.clearSelection();
  });

  clipboard.on('error', function(e) {
    console.error('Failed to copy all todos:', e);
  });


  loadTodos();
});
