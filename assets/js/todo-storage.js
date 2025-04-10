'use strict';

// Helper to generate unique IDs
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function getTodosFromStorage() {
  const todosJSON = localStorage.getItem('todos');
  let todos = [];
  if (todosJSON) {
    try {
      const parsedData = JSON.parse(todosJSON);
      if (Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'string') {
        console.log("Migrating old storage format to {id, text}...");
        todos = parsedData.map(text => ({
          id: generateUniqueId(),
          text: text
        }));
        saveTodosToStorage(todos);
        console.log("Migration complete.");
      } else if (Array.isArray(parsedData) && (parsedData.length === 0 || (typeof parsedData[0] === 'object' && Object.prototype.hasOwnProperty.call(parsedData[0], 'id') && Object.prototype.hasOwnProperty.call(parsedData[0], 'text')))) {
        todos = parsedData;
      } else {
        console.warn("Invalid data format in localStorage. Resetting todos.");
        todos = [];
        saveTodosToStorage(todos);
      }
    } catch (e) {
      console.error("Error parsing todos from localStorage:", e);
      todos = [];
      saveTodosToStorage(todos);
      console.log("Error parsing todos, resetting storage");
    }
  }
  return Array.isArray(todos) ? todos : [];
}

export function saveTodosToStorage(todoObjects) {
  if (!Array.isArray(todoObjects)) {
    console.error("Attempted to save non-array to localStorage:", todoObjects);
    return;
  }
  localStorage.setItem('todos', JSON.stringify(todoObjects));
}

export function addTodoToStorage(item) {
  const todos = getTodosFromStorage();
  const newTodoObject = {
    id: generateUniqueId(),
    text: item.toString()
  };
  todos.push(newTodoObject);
  saveTodosToStorage(todos);
}

export function updateTodoInStorage(idToUpdate, newItem) {
  let todos = getTodosFromStorage();
  const index = todos.findIndex(todo => todo.id === idToUpdate);
  if (index > -1) {
    todos[index].text = newItem.toString();
    saveTodosToStorage(todos);
  } else {
    console.warn("Could not find todo to update using ID:", idToUpdate);
  }
}

export function removeTodoFromStorage(idToDelete) {
  let todos = getTodosFromStorage();
  const initialLength = todos.length;
  todos = todos.filter(todo => todo.id !== idToDelete);
  if (todos.length < initialLength) {
    saveTodosToStorage(todos);
  } else {
    console.warn("Could not find todo to delete using ID:", idToDelete);
  }
}
