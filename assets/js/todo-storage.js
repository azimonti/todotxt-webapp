'use strict';

import { uploadTodosToDropbox } from './dropbox-sync.js'; // Import the upload function

const LOCAL_STORAGE_KEY = 'todos';
const LOCAL_TIMESTAMP_KEY = 'todosLastModifiedLocal';

// Helper to generate unique IDs - Exporting for use elsewhere
export function generateUniqueId() {
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
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(todoObjects));
  // Store the current timestamp whenever todos are saved
  localStorage.setItem(LOCAL_TIMESTAMP_KEY, new Date().toISOString());
}

/**
 * Retrieves the timestamp of the last local save operation.
 * @returns {string | null} ISO 8601 timestamp string or null if not set.
 */
export function getLocalLastModified() {
  return localStorage.getItem(LOCAL_TIMESTAMP_KEY);
}

export function addTodoToStorage(item) {
  const todos = getTodosFromStorage();
  const newTodoObject = {
    id: generateUniqueId(),
    text: item.toString()
  };
  todos.push(newTodoObject);
  saveTodosToStorage(todos);
  uploadTodosToDropbox().catch(err => console.error("Upload after add failed:", err)); // Trigger upload
}

export function updateTodoInStorage(idToUpdate, newItem) {
  let todos = getTodosFromStorage();
  const index = todos.findIndex(todo => todo.id === idToUpdate);
  if (index > -1) {
    todos[index].text = newItem.toString();
    saveTodosToStorage(todos);
    uploadTodosToDropbox().catch(err => console.error("Upload after update failed:", err)); // Trigger upload
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
    uploadTodosToDropbox().catch(err => console.error("Upload after delete failed:", err)); // Trigger upload
  } else {
    console.warn("Could not find todo to delete using ID:", idToDelete);
  }
}
