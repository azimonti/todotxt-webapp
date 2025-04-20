'use strict';

document.addEventListener('DOMContentLoaded', function() {
  const versionUrl = '/data/json/version.json';
  // Fetch version file using fetch API
  fetch(versionUrl)
    .then(response => {
      if (!response.ok) return; // If response is not OK (e.g., offline), exit
      return response.json();
    })
    .then(data => {
      if (!data) return; // If fetch failed (e.g., offline), skip further processing
      const onlineVersion = data.version;
      const localVersion = localStorage.getItem('version');
      // Compare versions and trigger refresh if different
      if (onlineVersion !== localVersion) {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage('refresh_cache');
          localStorage.setItem('version', onlineVersion);
        }
      }
    })
    .catch(() => {
      // Simply return if there's an error (e.g., offline)
      return;
    });
});
