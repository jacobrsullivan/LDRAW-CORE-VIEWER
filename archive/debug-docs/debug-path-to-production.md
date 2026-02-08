# Debug: Path to Production Issues

## Current Status: NOT WORKING

The production server fails to load LDraw parts. The 3D model does not render.

---

## Error Message

```
LDrawLoader: Unknown line type "<!doctype" at line 1
```

This means the server is returning HTML (SPA fallback) instead of LDraw file content.

---

## Root Cause Analysis

### Why Dev Works But Production Doesn't

**Dev Server (Vite)** has middleware that intercepts ALL `.dat` and `.ldr` requests regardless of URL path and searches multiple directories:

```javascript
// vite.config.ts lines 301-312
const possiblePaths = [
  path.join(process.cwd(), url),                          // Direct from root
  path.join(process.cwd(), 'public', url),                // In public
  path.join(process.cwd(), 'ldraw/parts', path.basename(url)),   // In parts
  path.join(process.cwd(), 'ldraw/parts/s', path.basename(url)), // In subparts
  path.join(process.cwd(), 'ldraw/p', path.basename(url))        // In primitives
];
```

**Production Server (Express)** only serves files from their exact paths. When a file isn't found, it falls through to the SPA fallback.

### The Three.js LDrawLoader Path Resolution Problem

The LDrawLoader resolves subfile references relative to the parent file's URL location, NOT relative to `partsLibraryPath`.

**Example flow:**
1. App calls `loadAsync('/ldraw/parts/3001.dat')`
2. LDrawLoader fetches `/ldraw/parts/3001.dat` ✓
3. 3001.dat contains: `1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\3001s01.dat`
4. LDrawLoader resolves `s\3001s01.dat` relative to parent directory:
   - Parent: `/ldraw/parts/3001.dat`
   - Parent dir: `/ldraw/parts/`
   - Result: `/ldraw/parts/s/3001s01.dat` ✓ (but also adds `parts/` → double parts bug)
5. 3001s01.dat contains: `1 16 0 -4 0 1 0 0 0 1 0 0 0 1 stud4.dat`
6. LDrawLoader resolves `stud4.dat` relative to parent:
   - Parent: `/ldraw/parts/s/3001s01.dat`
   - Parent dir: `/ldraw/parts/s/`
   - Result: `/ldraw/parts/s/stud4.dat` ✗ (WRONG! Should be `/ldraw/p/stud4.dat`)

**The `partsLibraryPath` setting is NOT used for relative path resolution** - it's only used when the LDrawLoader specifically identifies a file as needing library lookup.

---

## Attempts and Results

### Attempt 1: Add LDraw file middleware
**Change:** Added middleware to catch `/3001.dat` requests and search ldraw directories.

**Result:** Initial part load works, but subpart loading fails.

### Attempt 2: Fix backslash encoding
**Change:** Rewrite `%5C` to `/` in URLs for Windows-style paths like `s\3001s01.dat`.

**Result:** Backslash paths now resolve, but double `parts/` issue appeared.

### Attempt 3: Load from full path
**Change:** Modified `PartGeometryLoader` to load from `/ldraw/parts/3001.dat` instead of `/3001.dat`.

**Result:** Main part loads, but subpart paths have double `parts/` (e.g., `/ldraw/parts/parts/s/3001s01.dat`).

### Attempt 4: Rewrite double parts path
**Change:** Added URL rewriting to convert `/parts/parts/` to `/parts/`.

**Result:** Subparts load, but primitives fail. Primitives like `stud.dat` are requested from `/ldraw/parts/stud.dat` but exist at `/ldraw/p/stud.dat`.

---

## Current Server Logs

```
[/ldraw static] Request: /parts/3001.dat          ← Main part (correct)
[/ldraw static] Request: /parts/parts/s/3001s01.dat   ← Subpart (rewritten to /parts/s/)
[/ldraw static] Rewritten to: /parts/s/3001s01.dat
[/ldraw static] Request: /parts/stud4.dat         ← Primitive (WRONG - should be /p/)
[/ldraw static] Request: /parts/box5.dat          ← Primitive (WRONG - should be /p/)
[/ldraw static] Request: /parts/stud.dat          ← Primitive (WRONG - should be /p/)
```

---

## LDraw Directory Structure

```
ldraw/
├── LDConfig.ldr          # Color definitions
├── parts/                # Main parts
│   ├── 3001.dat          # Brick 2x4
│   └── s/                # Subparts
│       └── 3001s01.dat   # Brick 2x4 subpart
├── p/                    # Primitives
│   ├── stud.dat          # Standard stud
│   ├── stud4.dat         # 4-sided stud
│   ├── box5.dat          # Box primitive
│   └── 48/               # High-res primitives
└── models/               # Complete models (optional)
```

---

## Key Code Locations

| File | Line | Purpose |
|------|------|---------|
| `Canvas3D.tsx` | 424 | Sets `partsLibraryPath: '/ldraw/'` |
| `SceneManager.ts` | 132-139 | Normalizes partsLibraryPath |
| `PartGeometryLoader.ts` | 118 | Constructs part path: `${partsLibraryPath}parts/${partId}` |
| `PartGeometryLoader.ts` | 121 | Calls `loader.loadAsync(partPath)` |
| `LDrawLoaderModule.ts` | 57-60 | Sets partsLibraryPath on Three.js loader |
| `LDrawLoaderModule.ts` | 125-126 | Loads LDConfig from `/api/parts/ldconfig` |
| `PartsFileManager.ts` | 12 | API base path: `/api/parts` |
| `vite.config.ts` | 287-349 | Dev middleware that searches multiple directories |
| `server.cjs` | 141-154 | Production `/ldraw` static serving |

---

## Potential Causes Still Under Investigation

### 1. LDrawLoader's partsLibraryPath Not Being Used
The Three.js LDrawLoader might have specific logic for when to use `partsLibraryPath` vs relative path resolution. When loading a .dat file (part) vs a .ldr file (model), the behavior might differ.

### 2. Missing Primitive Path Resolution
The loader should know that files like `stud.dat`, `stud4.dat` are primitives and look in `p/` directory. This logic might require the partsLibraryPath to be set correctly AND the file to be loaded from a specific location.

### 3. Dev Server Masks All Path Issues
The Vite middleware's multi-directory search masks all path resolution issues. ANY `.dat` file is found regardless of the URL path because it searches:
- parts/
- parts/s/
- p/
- p/48/

### 4. Production Server Doesn't Search Directories
The production `/ldraw` static middleware only serves files from their exact URL path. There's no fallback directory search.

---

## Recommended Solution

### Option A: Mimic Vite Middleware Behavior (Simplest)

Make the production `/ldraw` middleware search multiple directories, just like Vite does:

```javascript
app.use('/ldraw', (req, res, next) => {
  // Extract filename from any path
  const filename = path.basename(req.url).toLowerCase();

  // Search directories in order
  const searchDirs = ['parts', 'parts/s', 'p', 'p/48', ''];

  for (const dir of searchDirs) {
    const filePath = path.join(LDRAW_DIR, dir, filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }

  next();
});
```

### Option B: Fix partsLibraryPath Usage

Investigate why Three.js LDrawLoader isn't using `partsLibraryPath` for primitive resolution. May need to:
- Load parts from a different location
- Configure the loader differently
- Use a wrapper model file

### Option C: Custom URL Rewriting

Expand the URL rewriting to handle all known path patterns:
- `/parts/stud.dat` → `/p/stud.dat`
- `/parts/s/*.dat` with primitives → `/p/*.dat`

This requires knowing which files are primitives vs parts.

---

## Test Commands

```bash
# Test main part
curl http://localhost:3000/ldraw/parts/3001.dat | head -3

# Test subpart
curl http://localhost:3000/ldraw/parts/s/3001s01.dat | head -3

# Test primitive (should work but currently fails)
curl http://localhost:3000/ldraw/parts/stud.dat | head -3
# Returns: 404 or HTML

# Correct primitive path
curl http://localhost:3000/ldraw/p/stud.dat | head -3
# Returns: LDraw content
```

---

## Files Modified During Debugging

1. `server.cjs` - Added middleware, logging, URL rewrites
2. `PartGeometryLoader.ts` - Changed partPath construction
3. `docs/path-to-production-plan.md` - Initial analysis
4. `docs/debug-path-to-production.md` - This file
