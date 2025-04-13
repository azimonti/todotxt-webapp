// Dropbox App Configuration
export const CLIENT_ID = 'itl0pexh8y06vl7'; // Replace with your actual Dropbox App Key
// Construct the full redirect URI dynamically to work across different paths
// This requires the exact full path URI (e.g., http://localhost:8000/apps/sandbox/todotxt/)
// to be registered in the Dropbox App Console for each environment.
const currentPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
export const REDIRECT_URI = window.location.origin + currentPath;
// File and Storage Configuration
export const TODO_FILENAME = '/todo.txt'; // Path within the app folder
export const PENDING_UPLOAD_KEY = 'dropboxUploadPending';
export const ACCESS_TOKEN_KEY = 'dropboxAccessToken';
