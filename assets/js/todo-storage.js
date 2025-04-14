'use strict';

import { logVerbose, warnVerbose } from './todo-logging.js'; // Import logging functions

// --- Constants ---
const KNOWN_FILES_KEY = 'todoFiles'; // Stores array of { name: string, path: string }
const ACTIVE_FILE_KEY = 'activeTodoFile'; // Stores the path (string) of the active file
export const DEFAULT_FILE_PATH = '/todo.txt'; // Default file if none active or found

// --- Helper Functions ---
// Helper to generate unique IDs - Exporting for use elsewhere
export function generateUniqueId() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).substring(2)}`;
}

function getDynamicStorageKey(baseKey, filePath) {
  if (!filePath) {
    warnVerbose(`Cannot generate dynamic key for base "${baseKey}" without a file path.`);
    return null; // Or handle appropriately
  }
  // Replace slashes to create a valid key, ensure uniqueness
  const safePath = filePath.replace(/\//g, '_');
  return `${baseKey}${safePath}`;
}

// --- Active File Management ---

export function getActiveFile() {
  return localStorage.getItem(ACTIVE_FILE_KEY) || DEFAULT_FILE_PATH;
}

export function setActiveFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    console.error("Invalid file path provided to setActiveFile:", filePath);
    return;
  }
  // Optional: Validate if filePath exists in known files?
  localStorage.setItem(ACTIVE_FILE_KEY, filePath);
  logVerbose(`Active file set to: ${filePath}`);
  // Potentially trigger UI update or data reload here
}

// --- Known Files Management ---

export function getKnownFiles() {
  const filesJSON = localStorage.getItem(KNOWN_FILES_KEY);
  try {
    const files = filesJSON ? JSON.parse(filesJSON) : [];
    // Ensure default file is always present if list is empty or doesn't contain it
    if (!files.some(file => file.path === DEFAULT_FILE_PATH)) {
       if (files.length === 0) {
         // If list is empty, add default and save
         const defaultFile = { name: 'todo.txt', path: DEFAULT_FILE_PATH };
         saveKnownFiles([defaultFile]);
         return [defaultFile];
       } else {
         // If list exists but missing default, just add it for the return value
         // It will be saved if other operations modify the list later
         warnVerbose("Default file path missing from known files list, adding temporarily.");
         files.unshift({ name: 'todo.txt', path: DEFAULT_FILE_PATH });
       }
    }
    return files;
  } catch (e) {
    console.error("Error parsing known files from localStorage:", e);
    // Provide default if parsing fails
    const defaultFile = { name: 'todo.txt', path: DEFAULT_FILE_PATH };
    saveKnownFiles([defaultFile]); // Attempt to fix storage
    return [defaultFile];
  }
}

export function saveKnownFiles(filesArray) {
   if (!Array.isArray(filesArray)) {
     console.error("Attempted to save non-array as known files:", filesArray);
     return;
   }
   // Ensure default file is always present
   if (!filesArray.some(file => file.path === DEFAULT_FILE_PATH)) {
     warnVerbose("Default file path missing from saveKnownFiles input, adding it.");
     filesArray.unshift({ name: 'todo.txt', path: DEFAULT_FILE_PATH });
   }
   localStorage.setItem(KNOWN_FILES_KEY, JSON.stringify(filesArray));
}

export function addKnownFile(name, path) {
  if (!name || !path) {
    console.error("Cannot add known file without name and path.");
    return false;
  }
  const files = getKnownFiles();
  if (files.some(file => file.path === path)) {
    warnVerbose(`File with path "${path}" already exists.`);
    return false; // Indicate file already exists
  }
  files.push({ name, path });
  saveKnownFiles(files);
  return true; // Indicate success
}

export function renameKnownFile(oldPath, newName, newPath) {
   if (!oldPath || !newName || !newPath) {
     console.error("Cannot rename known file without oldPath, newName, and newPath.");
     return false;
   }
  const files = getKnownFiles();
  const index = files.findIndex(file => file.path === oldPath);
  if (index === -1) {
    warnVerbose(`Cannot find file with path "${oldPath}" to rename.`);
    return false;
  }
  if (files.some(file => file.path === newPath && file.path !== oldPath)) {
      warnVerbose(`File with new path "${newPath}" already exists.`);
      return false; // Prevent renaming to an existing path
  }
  // --- Move associated data in localStorage ---
  const oldTodoKey = getDynamicStorageKey('todos_', oldPath);
  const newTodoKey = getDynamicStorageKey('todos_', newPath);
  const oldLocalModKey = getDynamicStorageKey('todosLastModifiedLocal_', oldPath);
  const newLocalModKey = getDynamicStorageKey('todosLastModifiedLocal_', newPath);
  const oldSyncTimeKey = getDynamicStorageKey('lastSyncTime_', oldPath);
  const newSyncTimeKey = getDynamicStorageKey('lastSyncTime_', newPath);

  let dataMoved = false;
  if (oldTodoKey && newTodoKey) {
    const todosData = localStorage.getItem(oldTodoKey);
    if (todosData) {
      localStorage.setItem(newTodoKey, todosData);
      localStorage.removeItem(oldTodoKey);
      logVerbose(`Moved todo data from ${oldTodoKey} to ${newTodoKey}`);
      dataMoved = true; // Mark that main data was moved

      // Move timestamps only if main data was moved successfully
      const localModTimestamp = localStorage.getItem(oldLocalModKey);
      if (localModTimestamp && newLocalModKey) {
        localStorage.setItem(newLocalModKey, localModTimestamp);
        localStorage.removeItem(oldLocalModKey);
        logVerbose(`Moved local modified timestamp for ${oldPath} to ${newPath}`);
      }
      const syncTimestamp = localStorage.getItem(oldSyncTimeKey);
      if (syncTimestamp && newSyncTimeKey) {
        localStorage.setItem(newSyncTimeKey, syncTimestamp);
        localStorage.removeItem(oldSyncTimeKey);
        logVerbose(`Moved last sync timestamp for ${oldPath} to ${newPath}`);
      }
    } else {
      warnVerbose(`No todo data found for ${oldPath} to move during rename.`);
      // Ensure old keys are removed even if no data existed
      if (oldLocalModKey) localStorage.removeItem(oldLocalModKey);
      if (oldSyncTimeKey) localStorage.removeItem(oldSyncTimeKey);
    }
  } else {
    console.error(`Failed to generate storage keys during rename from ${oldPath} to ${newPath}. Data not moved.`);
    // Don't proceed with saving the known file rename if keys failed? Or proceed carefully?
    // Let's proceed with the known file rename but log the error.
  }
  // --- End data move ---


  // Update the known files list entry
  files[index].name = newName;
  files[index].path = newPath;
  saveKnownFiles(files); // Save the updated list

  // If the renamed file was the active one, update the active file path
  if (getActiveFile() === oldPath) {
    setActiveFile(newPath);
  }
  return true;
}

export function removeKnownFile(pathToRemove) {
  if (!pathToRemove) {
    console.error("Cannot remove known file without a path.");
    return false;
  }
  if (pathToRemove === DEFAULT_FILE_PATH) {
      warnVerbose("Cannot remove the default file.");
      return false; // Prevent removing the default file
  }
  let files = getKnownFiles();
  const initialLength = files.length;
  files = files.filter(file => file.path !== pathToRemove);

  if (files.length < initialLength) {
    saveKnownFiles(files);
    // If the removed file was the active one, switch to default
    if (getActiveFile() === pathToRemove) {
      setActiveFile(DEFAULT_FILE_PATH);
      logVerbose(`Removed active file "${pathToRemove}", switched to default.`);
      // Consider triggering a reload of the UI/data for the new active file
    }
    // Also remove associated data from localStorage
    const todoKey = getDynamicStorageKey('todos_', pathToRemove);
    const timestampKey = getDynamicStorageKey('todosLastModifiedLocal_', pathToRemove);
    if (todoKey) localStorage.removeItem(todoKey);
    if (timestampKey) localStorage.removeItem(timestampKey);
    logVerbose(`Removed stored data for file: ${pathToRemove}`);
    return true;
  } else {
    warnVerbose(`Could not find file with path "${pathToRemove}" to remove.`);
    return false;
  }
}


// --- Todo Item Storage (Per-File) ---

export function getTodosFromStorage() {
  const activeFilePath = getActiveFile();
  const storageKey = getDynamicStorageKey('todos_', activeFilePath);
  if (!storageKey) return []; // Handle case where key generation failed

  const todosJSON = localStorage.getItem(storageKey);
  let todos = [];
  if (todosJSON) {
    try {
      const parsedData = JSON.parse(todosJSON);
      // Existing migration/validation logic (seems fine)
      if (Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'string') {
        // This migration logic might be problematic with multiple files.
        // It assumes the old format exists under the *new* dynamic key.
        // Consider if migration is still needed or how it should work.
        // For now, let's assume new format or empty for new keys.
        warnVerbose("Old storage format detected under new key system. This might indicate an issue. Resetting for this file.", storageKey);
        todos = [];
        // saveTodosToStorage(todos); // Avoid recursive call during get
      } else if (Array.isArray(parsedData) && (parsedData.length === 0 || (typeof parsedData[0] === 'object' && Object.prototype.hasOwnProperty.call(parsedData[0], 'id') && Object.prototype.hasOwnProperty.call(parsedData[0], 'text')))) {
        todos = parsedData; // Correct format
      } else {
        warnVerbose(`Invalid data format in localStorage for key "${storageKey}". Resetting todos for this file.`);
        todos = [];
        // saveTodosToStorage(todos); // Avoid recursive call during get
      }
    } catch (e) {
      console.error(`Error parsing todos from localStorage for key "${storageKey}":`, e);
      todos = [];
      // saveTodosToStorage(todos); // Avoid recursive call during get
      logVerbose(`Error parsing todos for key "${storageKey}", returning empty array.`);
    }
  }
  // Final safety check
  return Array.isArray(todos) ? todos : [];
}

export function saveTodosToStorage(todoObjects) {
  const activeFilePath = getActiveFile();
  const storageKey = getDynamicStorageKey('todos_', activeFilePath);
  const timestampKey = getDynamicStorageKey('todosLastModifiedLocal_', activeFilePath);

  if (!storageKey || !timestampKey) {
      console.error("Cannot save todos, failed to generate storage keys for path:", activeFilePath);
      return;
  }

  if (!Array.isArray(todoObjects)) {
    console.error(`Attempted to save non-array to localStorage for key "${storageKey}":`, todoObjects);
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(todoObjects));
  const saveTimestamp = new Date().toISOString();
  // Store the current timestamp for the specific file
  localStorage.setItem(timestampKey, saveTimestamp);
  // console.log(`Saved todos and timestamp for ${activeFilePath}`);

  // Dispatch an event indicating data has changed for the active file
  document.dispatchEvent(new CustomEvent('localDataChanged', {
    detail: {
      filePath: activeFilePath,
      timestamp: saveTimestamp // Include timestamp for potential use by listener
    }
  }));
  logVerbose(`Dispatched localDataChanged event for ${activeFilePath}`);
}

/**
 * Retrieves the timestamp of the last local save operation for the active file.
 * @returns {string | null} ISO 8601 timestamp string or null if not set.
 */
export function getLocalLastModified() {
  const activeFilePath = getActiveFile();
  const timestampKey = getDynamicStorageKey('todosLastModifiedLocal_', activeFilePath);
  if (!timestampKey) return null;
  return localStorage.getItem(timestampKey);
}

// --- Last Sync Time Storage (Per-File) ---

/**
 * Stores the timestamp of the last successful sync operation for a specific file.
 * @param {string} filePath - The path of the file that was synced.
 */
export function setLastSyncTime(filePath) {
  const timestampKey = getDynamicStorageKey('lastSyncTime_', filePath);
  if (!timestampKey) {
    console.error("Cannot set last sync time, failed to generate storage key for path:", filePath);
    return;
  }
  const now = new Date().toISOString();
  localStorage.setItem(timestampKey, now);
  logVerbose(`Last sync time set for ${filePath}: ${now}`);
}

/**
 * Retrieves the timestamp of the last successful sync operation for a specific file.
 * @param {string} filePath - The path of the file to check.
 * @returns {string | null} ISO 8601 timestamp string or null if not set.
 */
export function getLastSyncTime(filePath) {
  const timestampKey = getDynamicStorageKey('lastSyncTime_', filePath);
  if (!timestampKey) return null;
  return localStorage.getItem(timestampKey);
}


// --- Todo Modification Functions (Operating on Active File) ---

export function addTodoToStorage(item) {
  // getTodosFromStorage and saveTodosToStorage now implicitly use the active file
  const todos = getTodosFromStorage(); // Gets todos for the active file
  const newTodoObject = {
    id: generateUniqueId(),
    text: item.toString() // Assuming item is a TodoTxtItem object or similar
  };
  todos.push(newTodoObject);
  saveTodosToStorage(todos); // Saves todos for the active file and dispatches event
}

export function updateTodoInStorage(idToUpdate, newItem) {
  // getTodosFromStorage and saveTodosToStorage now implicitly use the active file
  let todos = getTodosFromStorage(); // Gets todos for the active file
  const index = todos.findIndex(todo => todo.id === idToUpdate);
  if (index > -1) {
    todos[index].text = newItem.toString(); // Assuming newItem is a TodoTxtItem object or similar
    saveTodosToStorage(todos); // Saves todos for the active file and dispatches event
  } else {
    warnVerbose(`Could not find todo with ID "${idToUpdate}" in active file "${getActiveFile()}" to update.`);
  }
}

export function removeTodoFromStorage(idToDelete) {
  // getTodosFromStorage and saveTodosToStorage now implicitly use the active file
  let todos = getTodosFromStorage(); // Gets todos for the active file
  const initialLength = todos.length;
  todos = todos.filter(todo => todo.id !== idToDelete);
  if (todos.length < initialLength) {
    saveTodosToStorage(todos); // Saves todos for the active file and dispatches event
  } else {
    warnVerbose(`Could not find todo with ID "${idToDelete}" in active file "${getActiveFile()}" to delete.`);
  }
}
