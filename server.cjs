/**
 * Production Server for LDraw 3D Web Viewer
 *
 * This server serves both the built application and the LDraw parts library.
 *
 * Setup:
 *   1. Install express: npm install express
 *   2. Build the app: npm run build
 *   3. Start server: npm start (or: node server.cjs)
 *   4. Open: http://localhost:3000
 *
 * Environment Variables:
 *   PORT - Server port (default: 3000)
 *   LDRAW_DIR - Path to ldraw library (default: ./ldraw)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const LDRAW_DIR = process.env.LDRAW_DIR || path.join(__dirname, 'ldraw');
const DIST_DIR = path.join(__dirname, 'dist');

// Check if dist exists
if (!fs.existsSync(DIST_DIR)) {
  console.error('Error: dist/ folder not found. Run "npm run build" first.');
  process.exit(1);
}

// Check if ldraw exists
if (!fs.existsSync(LDRAW_DIR)) {
  console.warn('Warning: ldraw/ folder not found. Parts will not load.');
  console.warn(`Expected location: ${LDRAW_DIR}`);
}

// ============================================
// Parts API endpoints
// ============================================

// Serve LDConfig.ldr
app.get('/api/parts/ldconfig', (req, res) => {
  const configPath = path.join(LDRAW_DIR, 'LDConfig.ldr');

  if (fs.existsSync(configPath)) {
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000', // 1 year
    });
    res.sendFile(configPath);
  } else {
    res.status(404).json({ error: 'LDConfig.ldr not found' });
  }
});

// Serve part files - use regex for wildcard path matching
app.get(/^\/api\/parts\/(.+)$/, (req, res) => {
  // Get the path after /api/parts/
  const partPath = req.params[0].toLowerCase();

  // Try multiple locations
  const searchPaths = [
    path.join(LDRAW_DIR, 'parts', partPath),
    path.join(LDRAW_DIR, 'parts', 's', partPath),
    path.join(LDRAW_DIR, 'p', partPath),
    path.join(LDRAW_DIR, 'p', '48', partPath),
    path.join(LDRAW_DIR, partPath),
  ];

  for (const filePath of searchPaths) {
    if (fs.existsSync(filePath)) {
      res.set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000', // 1 year
      });
      return res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: `Part not found: ${partPath}` });
        }
      });
    }
  }

  res.status(404).json({ error: `Part not found: ${partPath}` });
});

// ============================================
// Scene API endpoints (for save functionality)
// ============================================

// List available scenes
app.get('/api/scenes', (req, res) => {
  const scenesDir = path.join(DIST_DIR, 'scenes');

  try {
    const files = fs.readdirSync(scenesDir)
      .filter(f => f.toLowerCase().endsWith('.ldr'))
      .map(f => ({
        type: 'file',
        name: f,
        path: `scenes/${f}`
      }));

    res.json({
      type: 'folder',
      name: 'public',
      children: [{
        type: 'folder',
        name: 'scenes',
        children: files
      }]
    });
  } catch (error) {
    res.json({ type: 'folder', name: 'public', children: [] });
  }
});

// Save scene (optional - only if you want save to work in production)
app.post('/api/save', express.json(), (req, res) => {
  const { filename, content } = req.body;

  if (!filename || !content) {
    return res.status(400).json({ error: 'Missing filename or content' });
  }

  const scenesDir = path.join(DIST_DIR, 'scenes');
  const filePath = path.join(scenesDir, path.basename(filename));

  try {
    fs.writeFileSync(filePath, content);
    res.json({ success: true, filename });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// ============================================
// LDraw library static serving (for Three.js LDrawLoader)
// ============================================

// Smart LDraw file serving - searches multiple directories like Vite dev server
// This handles the path resolution issues with Three.js LDrawLoader
app.use('/ldraw', (req, res, next) => {
  let url = req.url || '';

  // Convert backslashes to forward slashes (Windows-style paths in LDraw files)
  if (url.includes('%5C') || url.includes('\\')) {
    url = url.replace(/%5C/g, '/').replace(/\\/g, '/');
  }

  // Only process .dat and .ldr files with smart directory search
  if (!url.endsWith('.dat') && !url.endsWith('.ldr')) {
    // For non-LDraw files (like LDConfig.ldr at root), use standard static serving
    req.url = url;
    return next();
  }

  // Extract just the filename for searching
  const filename = path.basename(url).toLowerCase();

  console.log(`[/ldraw smart] Request: ${url} -> searching for: ${filename}`);

  // Search directories in order (same as Vite middleware)
  // This handles cases where LDrawLoader resolves paths incorrectly
  const searchPaths = [
    path.join(LDRAW_DIR, 'parts', filename),           // Main parts
    path.join(LDRAW_DIR, 'parts', 's', filename),      // Subparts
    path.join(LDRAW_DIR, 'p', filename),               // Primitives
    path.join(LDRAW_DIR, 'p', '48', filename),         // High-res primitives
    path.join(LDRAW_DIR, 'p', '8', filename),          // Low-res primitives
    path.join(LDRAW_DIR, filename),                    // Root level
  ];

  for (const filePath of searchPaths) {
    if (fs.existsSync(filePath)) {
      console.log(`[/ldraw smart] Found: ${filePath}`);
      res.set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000',
      });
      return res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).set('Content-Type', 'text/plain').send('');
        }
      });
    }
  }

  // File not found in any directory
  console.warn(`[/ldraw smart] Not found: ${filename}`);
  res.status(404).set('Content-Type', 'text/plain').send('');
});

// ============================================
// Static file serving
// ============================================

// Serve scene files
app.use('/scenes', express.static(path.join(DIST_DIR, 'scenes'), {
  setHeaders: (res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
  }
}));

// Serve built app
app.use(express.static(DIST_DIR));

// ============================================
// LDraw file middleware (catch-all for .dat/.ldr files)
// ============================================

// This middleware catches requests like /3001.dat that aren't prefixed with /ldraw/
// Three.js LDrawLoader calls loadAsync("3001.dat") which resolves to the page root
// In dev, Vite's middleware handles this; in production, we need this middleware
app.use((req, res, next) => {
  const url = req.url || '';

  // Only handle .dat and .ldr files
  if (!url.endsWith('.dat') && !url.endsWith('.ldr')) {
    return next();
  }

  // Skip if already handled by /ldraw or /api routes (shouldn't reach here, but safety check)
  if (url.startsWith('/ldraw/') || url.startsWith('/api/')) {
    return next();
  }

  console.log(`[LDraw middleware] Processing: ${url}`);

  // Extract the filename, handling paths like /3001.dat or /parts/3001.dat
  const filename = path.basename(url).toLowerCase();

  // Search paths (same as Vite middleware and /api/parts endpoint)
  const searchPaths = [
    path.join(LDRAW_DIR, 'parts', filename),
    path.join(LDRAW_DIR, 'parts', 's', filename),
    path.join(LDRAW_DIR, 'p', filename),
    path.join(LDRAW_DIR, 'p', '48', filename),
    path.join(LDRAW_DIR, filename),
  ];

  for (const filePath of searchPaths) {
    if (fs.existsSync(filePath)) {
      console.log(`[LDraw middleware] Found: ${filePath}`);
      res.set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000',
      });
      return res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).set('Content-Type', 'text/plain').send('');
        }
      });
    }
  }

  // Return 404 with empty content, NOT HTML (prevents LDrawLoader parse errors)
  console.warn(`[LDraw middleware] Not found: ${url}`);
  res.status(404).set('Content-Type', 'text/plain').send('');
});

// SPA fallback - serve index.html for navigation routes only
app.use((req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// ============================================
// Start server
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         LDraw 3D Web Viewer - Production Server            ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT.toString().padEnd(24)}║
║  Parts library:     ${fs.existsSync(LDRAW_DIR) ? 'Found ✓'.padEnd(37) : 'NOT FOUND ✗'.padEnd(37)}║
╚════════════════════════════════════════════════════════════╝
  `);
});
