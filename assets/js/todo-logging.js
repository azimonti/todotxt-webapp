'use strict';
/**
 * Attempts to extract caller information (file:line) from the stack trace.
 * @returns {string} Formatted caller information like "[file.js:12]" or "[Unknown]".
 */
function getCallerInfo() {
  try {
    const err = new Error();
    const stack = err.stack?.split('\n');
    if (stack && stack.length > 3) {
      const callerLine = stack[3].trim();
      // Match patterns like "...(file:///path/to/file.js:12:34)" or "... at file.js:12:34"
      const match = callerLine.match(/(?:(?:file|https?):\/\/.+\/|at\s+)?([^:\s)]+:\d+)(?::\d+)?/);
      if (match && match[1]) {
        // Extract the filename:line part
        const parts = match[1].split(/[/\\]/); // Split path by / or \
        return `[${parts[parts.length - 1]}]`; // Return last part (filename:line)
      }
      // Fallback for unexpected formats: try to grab the last part
      const fallbackMatch = callerLine.match(/(\S+)$/);
      if (fallbackMatch && fallbackMatch[1]) {
        return `[${fallbackMatch[1]}]`;
      }
    }
  } catch (e) {
    // Ignore potential errors during stack trace parsing
  }
  return '[Unknown]'; // Default if info cannot be retrieved
}

// --- Development Logging ---
const DEVELOPMENT_LOGGING_ENABLED = true; // <<< Toggle this flag for development logs
/**
 * Logs messages with caller info if DEVELOPMENT_LOGGING_ENABLED is true.
 * @param {...any} args - Arguments to pass to console.log.
 */
export function logDevelopment(...args) {
  if (DEVELOPMENT_LOGGING_ENABLED) {
    console.log(getCallerInfo(), ...args);
  }
}

// --- Verbose Logging ---
const VERBOSE_LOGGING_ENABLED = false; // <<< Toggle this flag for verbose logs

/**
 * Logs messages with caller info if VERBOSE_LOGGING_ENABLED is true.
 * @param {...any} args - Arguments to pass to console.log.
 */
export function logVerbose(...args) {
  if (VERBOSE_LOGGING_ENABLED) {
    console.log(getCallerInfo(), ...args);
  }
}

// Note: Errors are generally always logged regardless of the verbose flag.
// You can decide if specific console.error calls should also be conditional.
