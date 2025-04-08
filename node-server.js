'use strict';

const express = require('express');
const app = express();
const port = 8000;
// Check for --verbose flag in command line arguments
const verbose = process.argv.includes('--verbose');

// middleware to disable caching
app.use((req, res, next) => {
  res.set('cache-control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// conditional request logging middleware
app.use((req, res, next) => {
  if (verbose) {
    const now = new Date();
    console.log(`[${now.toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});
// serve static files from the current directory
app.use(express.static('.'));

app.listen(port, () => {
  console.log('server running at http://localhost:' + port);
});
