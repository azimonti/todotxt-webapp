const CACHE_NAME = 'todotxt-cache-v1-0-0';
const CACHE_AT_ONCE = false;
const assetsToCache = [
  '/',
  '/data/json/manifest.json',
  '/data/json/version.json',
  '/assets/css/lib/bootstrap-5.3.2.min.css',
  '/assets/js/lib/bootstrap-5.3.2.min.js',
  '/assets/js/lib/bootstrap-5.3.2.min.js.map',
  '/assets/js/lib/clipboard-2.0.11.min.js',
  '/assets/js/lib/clipboard-2.0.11.min.js.map',
  '/assets/js/lib/fontawesome-6.7.2.min.js',
  '/assets/js/lib/brands-6.7.2.min.js',
  '/assets/js/lib/solid-6.7.2.min.js',
  '/assets/js/lib/jquery-3.7.1.slim.min.js',
  '/assets/js/lib/jquery-3.7.1.slim.min.js.map',
  '/assets/js/lib/jstodotxt.min.js',
  '/assets/js/lib/jstodotxt.min.js.map',
  '/assets/js/lib/popper-2.11.8.min.js',
  '/assets/js/lib/popper-2.11.8.min.js.map',
  '/assets/js/cache.js',
  '/assets/js/todo-dropdowns.js',
  '/assets/js/todo-event-handlers.js',
  '/assets/js/todo-import.js',
  '/assets/js/todo-list-display.js',
  '/assets/js/todo-load.js',
  '/assets/js/todo-storage.js',
  '/assets/js/todo-ui.js',
  '/assets/js/todo.js',
  '/img/icons/todotxt.ico',
  '/img/icons/todotxt-32x32.png',
  '/img/icons/todotxt-180x180.png',
  '/img/icons/todotxt-192x192.png',
  '/img/icons/todotxt-512x512.png',
  '/img/icons/todotxt-512x512-maskable.png'
];

// Function to cache assets
function cacheAssets() {
  return caches.open(CACHE_NAME).then(cache => {
    if (CACHE_AT_ONCE) {
      return cache.addAll(assetsToCache).catch(error => {
        console.error('Failed to cache some assets:', error);
      });
    } else {
      return Promise.allSettled(
        assetsToCache.map(asset =>
          cache.add(asset).catch(error => ({ error, asset }))
        )
      ).then(results => {
        results.forEach(result => {
          if (result.status === 'rejected' || result.value?.error) {
            console.error(`Failed to cache ${result.reason?.asset || result.value?.asset}: ${result.reason || result.value?.error}`);
          }
        });
      });
    }
  });
}

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(cacheAssets());
});

// Activate event - clean up old caches and cache assets
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ).then(() => cacheAssets());
    })
  );
});

// Fetch event - serve cached content or fall back to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Refresh cache event - handle cache refresh from the main thread
self.addEventListener('message', event => {
  if (event.data === 'refresh_cache') {
    event.waitUntil(cacheAssets());
  }
});
