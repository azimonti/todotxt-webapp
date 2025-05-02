// Dropbox App Configuration
'use strict';

export const CLIENT_ID = 'YOUR_DROPBOX_APP_KEY'; // Replace with your actual Dropbox App Key
// Construct the full redirect URI dynamically to work across different paths
// to be registered in the Dropbox App Console for each environment.
const currentPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
export const REDIRECT_URI = window.location.origin + currentPath;
// File and Storage Configuration
export const TODO_FILENAME = '/todo.txt';
export const PENDING_UPLOAD_KEY = 'dropboxUploadPending';
export const ACCESS_TOKEN_KEY = 'dropboxAccessToken';
export const REFRESH_TOKEN_KEY = 'dropboxRefreshToken';
