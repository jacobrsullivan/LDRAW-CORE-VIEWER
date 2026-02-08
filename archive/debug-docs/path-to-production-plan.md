# Path to Production Plan

This document describes the differences between the development and production server configurations and the changes needed to make the production server work correctly.

## Problem Summary

The production server fails to load LDraw parts because of differences in how the dev server (Vite) and production server (Express) handle file requests. The error manifests as:

```
LDrawLoader: Unknown line type "<!doctype" at line 1
```

This means the server returned HTML (the SPA fallback `index.html`) instead of an LDraw part file.

---

## Architecture Analysis

### How Part Loading Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Part Loading Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PartGeometryLoader.loadPartGeometry("3001.dat")             │
│           │                                                      │
│           ▼                                                      │
│  2. LDrawFileManager.validateLDrawFile("3001.dat")              │
│           │                                                      │
│           ▼                                                      │
│  3. fetch("/api/parts/3001.dat") ──────► Server API endpoint    │
│           │                              (works in both envs)    │
│           ▼                                                      │
│  4. LDrawLoader.loadAsync("3001.dat")                           │
│           │                                                      │
│           ▼                                                      │
│  5. Three.js fetches "/3001.dat" ──────► ??? (see below)        │
│           │                                                      │
│           ▼                                                      │
│  6. LDrawLoader parses file, finds subpart: "s\3001s01.dat"     │
│           │                                                      │
│           ▼                                                      │
│  7. Three.js fetches "/ldraw/parts/s/3001s01.dat"               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### The Key Difference

**Step 5** is where dev and production differ:

| Step | Dev Server (Vite) | Production Server (Express) |
|------|-------------------|------------------------------|
| Request URL | `GET /3001.dat` | `GET /3001.dat` |
| Handler | `vite-plugin-ldraw-files` middleware intercepts ALL `.dat`/`.ldr` requests | No specific handler - falls through to SPA fallback |
| Result | Searches ldraw directories, returns part content | Returns `index.html` |

---

## Dev Server Configuration (vite.config.ts)

### Key Middleware: `vite-plugin-ldraw-files`

```typescript
// Lines 287-349 in vite.config.ts
server.middlewares.use((req, res, next) => {
  const url = req.url || '';

  // Intercepts ALL .dat and .ldr requests
  if ((url.endsWith('.dat') || url.endsWith('.ldr'))) {
    // Try multiple paths to find the file
    const possiblePaths = [
      path.join(process.cwd(), url),                          // Direct from root
      path.join(process.cwd(), 'public', url),                // In public
      path.join(process.cwd(), 'ldraw/parts', path.basename(url)),   // In parts
      path.join(process.cwd(), 'ldraw/parts/s', path.basename(url)), // In subparts
      path.join(process.cwd(), 'ldraw/p', path.basename(url))        // In primitives
    ];

    // Find and serve the file, or return 404 (NOT HTML)
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(fs.readFileSync(testPath));
        return;
      }
    }

    // Return 404 with empty content, NOT HTML
    res.statusCode = 404;
    res.end('');
    return;
  }

  next();
});
```

This middleware is **critical** - it catches requests like `/3001.dat` and finds them in the ldraw directory structure.

### Other Middleware

1. **`/api/parts/*`** - Used by `LDrawFileManager` for validation (works in both envs)
2. **`/api/scenes`** - Scene listing (works in both envs)
3. **`/api/save`** - Scene saving (works in both envs)

---

## Production Server Configuration (server.cjs)

### Current State

```javascript
// API endpoints - work correctly
app.get('/api/parts/ldconfig', ...);  // ✓ Works
app.get(/^\/api\/parts\/(.+)$/, ...); // ✓ Works

// Static serving for /ldraw path
app.use('/ldraw', (req, res, next) => {
  // Backslash to forward slash conversion
  if (req.url.includes('%5C') || req.url.includes('\\')) {
    req.url = req.url.replace(/%5C/g, '/').replace(/\\/g, '/');
  }
  next();
}, express.static(LDRAW_DIR, ...));    // ✓ Works for subpart loading

// Static app serving
app.use(express.static(DIST_DIR));     // ✓ Works

// SPA fallback - THIS IS THE PROBLEM
app.use((req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));  // ✗ Catches /3001.dat
});
```

### What's Missing

**No middleware to intercept `.dat`/`.ldr` requests before the SPA fallback.**

When Three.js LDrawLoader calls `loadAsync("3001.dat")`, it requests `GET /3001.dat`. This request:
1. Doesn't match `/api/parts/*` (no `/api/parts` prefix)
2. Doesn't match `/ldraw/*` (no `/ldraw` prefix)
3. Isn't in `dist/` (no static file)
4. Falls through to SPA fallback → returns HTML

---

## Required Changes

### Change 1: Add LDraw File Middleware to Production Server

Add middleware similar to Vite's `vite-plugin-ldraw-files` that:
1. Intercepts all `.dat` and `.ldr` file requests
2. Searches the ldraw directory structure to find the file
3. Returns 404 with empty content (not HTML) if not found

**Location:** `server.cjs`, add BEFORE the SPA fallback

```javascript
// LDraw file middleware - must be BEFORE SPA fallback
// Intercepts all .dat and .ldr requests and searches the ldraw library
app.use((req, res, next) => {
  const url = req.url || '';

  // Only handle .dat and .ldr files
  if (!url.endsWith('.dat') && !url.endsWith('.ldr')) {
    return next();
  }

  // Skip if already handled by /ldraw or /api routes
  if (url.startsWith('/ldraw/') || url.startsWith('/api/')) {
    return next();
  }

  console.log(`[LDraw middleware] Processing: ${url}`);

  // Extract the filename, handling paths like /3001.dat or /parts/3001.dat
  const filename = path.basename(url).toLowerCase();

  // Search paths (same as vite middleware)
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
      return res.sendFile(filePath);
    }
  }

  // Return 404 with empty content, NOT HTML
  console.warn(`[LDraw middleware] Not found: ${url}`);
  res.status(404).set('Content-Type', 'text/plain').send('');
});
```

### Change 2: Ensure Middleware Order is Correct

The middleware order in `server.cjs` should be:

1. `/api/parts/ldconfig` - LDConfig endpoint
2. `/api/parts/*` - Parts API endpoint
3. `/api/scenes` - Scenes listing
4. `/api/save` - Scene saving
5. `/ldraw/*` - Static ldraw directory (with backslash fix)
6. `/scenes/*` - Static scenes directory
7. **NEW: LDraw file middleware** - Catch all `.dat`/`.ldr` requests
8. `express.static(DIST_DIR)` - Serve built app
9. SPA fallback - Only for actual navigation routes

### Change 3: (Optional) Move SPA Fallback to Be More Specific

Instead of catching ALL routes, the SPA fallback could be smarter:

```javascript
// SPA fallback - only for navigation routes, not API/file requests
app.use((req, res, next) => {
  // Don't send HTML for requests that look like files
  if (req.url.includes('.') && !req.url.endsWith('.html')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});
```

---

## File Changes Summary

| File | Change | Description |
|------|--------|-------------|
| `server.cjs` | **Add middleware** | LDraw file middleware before SPA fallback |
| `server.cjs` | **Modify fallback** | Optional: Make SPA fallback smarter |

---

## Testing Checklist

After making changes, verify:

### Production Server Tests
```bash
# Build and start
npm run build
npm start

# Test part loading (should return LDraw content)
curl http://localhost:3000/3001.dat | head -3
# Expected: "0 Brick  2 x  4"

# Test subpart path (should return LDraw content)
curl "http://localhost:3000/ldraw/parts/s/3001s01.dat" | head -3
# Expected: "0 ~Brick  2 x  4 without..."

# Test backslash path (should return LDraw content)
curl "http://localhost:3000/ldraw/parts/s%5C3001s01.dat" | head -3
# Expected: "0 ~Brick  2 x  4 without..."

# Test API endpoint (should return LDraw content)
curl http://localhost:3000/api/parts/3001.dat | head -3
# Expected: "0 Brick  2 x  4"

# Test 404 for missing part (should NOT return HTML)
curl -I http://localhost:3000/nonexistent.dat
# Expected: 404 with text/plain

# Test app loading
curl http://localhost:3000 | head -2
# Expected: "<!doctype html>"
```

### Browser Tests
1. Open http://localhost:3000
2. Check browser console - no "<!doctype" errors
3. 3D model should render correctly
4. Verify parts have correct colors and geometry

### Dev Server Tests (Regression)
```bash
npm run dev

# Verify dev still works
# Open http://localhost:5173
# 3D model should render correctly
```

---

## Why This Approach?

### Alternative: Modify App Code

Could modify `PartGeometryLoader` to use full paths like `/ldraw/parts/3001.dat`:

```javascript
// Instead of:
const group = await this.loader.loadAsync(partId);

// Use:
const partPath = `${this.options.partsLibraryPath}parts/${partId}`;
const group = await this.loader.loadAsync(partPath);
```

**Problems:**
- Need to know which subdirectory the part is in (`parts/`, `parts/s/`, `p/`, etc.)
- Would need to try multiple paths or do a lookup first
- Changes app behavior for both dev and prod

### Chosen: Server Middleware

Adding middleware to the production server:

**Benefits:**
- No app code changes
- Works identically to dev server
- Single source of truth for file resolution logic
- Easier to debug and maintain

**Trade-offs:**
- Slight runtime overhead (searching directories)
- Need to keep server logic in sync with Vite config if paths change
