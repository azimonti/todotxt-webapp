// --- Verbose Logging ---
// Set this to true during development to see detailed logs, false for production/normal use.
const VERBOSE_LOGGING_ENABLED = false; // <<< Toggle this flag for verbose logs

/**
 * Logs messages to the console only if VERBOSE_LOGGING_ENABLED is true.
 * @param {...any} args - Arguments to pass to console.log.
 */
export function logVerbose(...args) {
  if (VERBOSE_LOGGING_ENABLED) {
    console.log('[Verbose]', ...args);
  }
}

/**
 * Logs warning messages to the console only if VERBOSE_LOGGING_ENABLED is true.
 * @param {...any} args - Arguments to pass to console.warn.
 */
export function warnVerbose(...args) {
  if (VERBOSE_LOGGING_ENABLED) {
    console.warn('[Verbose Warn]', ...args);
  }
}

// Note: Errors are generally always logged regardless of the verbose flag.
// You can decide if specific console.error calls should also be conditional.
