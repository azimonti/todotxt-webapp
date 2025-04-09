'use strict';

const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');

const app = express();
const httpPort = 5001;
const httpsPort = 8443;

// Middleware to parse JSON request bodies
app.use(express.json());

// Check for command line arguments
const verbose = process.argv.includes('--verbose');
const secure = process.argv.includes('--secure');

// --- Certificate Configuration ---
// Assumes mkcert generated files named 'localhost+N.pem' and 'localhost+N-key.pem'
let keyPath = '';
let certPath = '';
const defaultCertName = 'cert.pem'; // Define default names
const defaultKeyName = 'key.pem';

try {
  const files = fs.readdirSync('.');
  // Find the certificate file FIRST (ends with .pem but NOT -key.pem)
  certPath = files.find(f => f.startsWith('localhost+') && f.endsWith('.pem') && !f.endsWith('-key.pem')) || defaultCertName;
  // Find the key file SECOND (ends with -key.pem)
  keyPath = files.find(f => f.startsWith('localhost+') && f.endsWith('-key.pem')) || defaultKeyName;

  keyPath = path.resolve(keyPath);
  certPath = path.resolve(certPath);

  // Add a check to ensure both files were actually found or defaults are being used explicitly
  if ((certPath.endsWith(defaultCertName) || keyPath.endsWith(defaultKeyName)) && !(fs.existsSync(certPath) && fs.existsSync(keyPath))) {
    console.warn(`Could not automatically find both certificate ('localhost+N.pem') and key ('localhost+N-key.pem') files.`);
    console.warn(`Attempting to use defaults: ${defaultCertName} and ${defaultKeyName}. Ensure these files exist.`);
  }


} catch (err) {
  console.error("Error reading directory for certificate files:", err);
  console.warn(`Falling back to default certificate names: ${defaultCertName} and ${defaultKeyName}. Ensure these files exist.`);
  keyPath = path.resolve(defaultKeyName);
  certPath = path.resolve(defaultCertName);
}

// --- Middleware ---
// Middleware to disable caching
app.use((req, res, next) => {
  res.set('cache-control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Conditional request logging middleware
app.use((req, res, next) => {
  if (verbose) {
    const now = new Date();
    console.log(`[${now.toISOString()}] ${req.method} ${req.protocol}://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

// Serve static files from the current directory
app.use(express.static('.'));

// --- Server Startup ---
if (secure) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    const server = https.createServer(httpsOptions, app);
    server.listen(httpsPort, () => {
      console.log(`Secure server running at https://localhost:${httpsPort}`);
      console.log(`Using cert: ${certPath}`);
      console.log(`Using key:  ${keyPath}`);
    });
  } catch (err) {
    console.error(`Error starting HTTPS server. Did you generate certificates? (${keyPath}, ${certPath})`, err);
    console.log('Falling back to HTTP.');
    // Fallback to HTTP if HTTPS setup fails
    app.listen(httpPort, () => {
      console.log(`Server running at http://localhost:${httpPort}`);
    });
  }
} else {
  // Start standard HTTP server
  app.listen(httpPort, () => {
    console.log(`Server running at http://localhost:${httpPort}`);
  });
}
