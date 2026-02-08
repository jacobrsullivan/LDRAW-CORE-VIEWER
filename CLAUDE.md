# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LDraw 3D Web Viewer & Editor: A TypeScript/React/Three.js application for viewing and editing LEGO models using the LDraw format. Features real-time 3D rendering, Monaco editor integration, and multi-selection with transform controls.

## Development Commands

### Essential Commands
```bash
# Start development server (port 5173, auto-opens browser)
npm run dev

# Run all tests once
npm test

# Run tests in watch mode (for TDD)
npm run test:watch

# Lint code
npm run lint

# Production build (excludes 478MB ldraw library)
npm run build

# Full build with TypeScript compilation check
npm run build:full

# Preview production build locally (port 4173)
npm run preview
```

### Running Specific Tests
```bash
# Core rendering tests
npm run test:phase2

# Scene reconciliation tests
npm run test:phase3

# Selection and transform tests
npm run test:phase4

# Multi-selection tests
npm run test:phase5
```

## Architecture

### State Management (`src/state/useModelStore.ts`)

Single Zustand store with typed state and actions:
- **Model state**: `pieces` array, selection tracking
- **Editor state**: `hasUnsavedChanges`, `currentFileName`

Key actions: `loadModel()`, `setSelection()`, `updatePieceTransforms()`, `addPiece()`, `deletePiece()`

**Critical**: Always use immutable updates:
```typescript
// Clone Vector3
position: piece.position.clone()

// Spread RotationMatrix
rotationMatrix: [...piece.rotationMatrix] as RotationMatrix
```

### Three.js Layer (`src/three/`)

Core managers (created once in Canvas3D, stored in refs):
- `SceneManager.ts`: Main orchestrator, manages scene lifecycle
- `PieceManager.ts`: Individual piece rendering and geometry loading
- `SelectionManager.ts`: Selection state with visual highlighting (extends EventDispatcher)
- `TransformControlsManager.ts`: Transform gizmos (translate/rotate/scale)
- `SelectionGroupManager.ts`: Multi-selection grouping
- `InputEventHandler.ts`: Mouse/keyboard event processing
- `PartGeometryLoader.ts`: Loads geometry from LDraw parts
- `reconcileScene.ts`: Efficient syncing of Zustand state to Three.js objects

### LDraw Processing (`src/ldraw/`)

Pure TypeScript modules (no React dependencies):
- `LDrawParser.ts`: Parses LDraw text → `LDrawModel` data structure
- `LDrawSerializer.ts`: Converts `LDrawModel` → LDraw text with line mappings
- `LDrawDataModels.ts`: TypeScript interfaces (`LDrawPiece`, `LDrawModel`, etc.)
- `ColorManager.ts`: LDraw color definitions
- `PartsFileManager.ts`: Part file loading via API

### Components (`src/components/`)

- `Canvas3D.tsx`: Main 3D viewport, integrates all Three.js managers
- `LDrawEditor.tsx`: Monaco editor with LDraw syntax highlighting
- `AppHeader.tsx`: Application header
- `ResizablePaneContainer.tsx`: Split-pane layout
- `modals/`: Confirmation and file naming dialogs

## LDraw Coordinate System

**Critical difference from Three.js**:
- LDraw: **-Y is up** (positive Y points down)
- Three.js: **+Y is up**

Always use `LDrawTransforms.ts` for conversions:
```typescript
ldrawToThreePosition(ldrawPos: Vector3): Vector3
threeToLDrawPosition(threePos: Vector3): Vector3
```

**Center vs Origin**: LDraw positions refer to geometric center, Three.js uses local origin. Compensate with `geometryInfo.center` offset when applying transforms.

## Vite Middleware APIs

Development server provides several API endpoints:

**Scene Management**:
- `GET /api/scenes` - List scene files with folder structure
- `POST /api/save` - Save scenes to `public/scenes/`

**Parts Access**:
- `GET /api/parts/ldconfig` - LDraw color config
- `GET /api/parts/{path}` - Individual part files (cached 1 year)

All middleware defined in `vite.config.ts`.

## Testing

**Framework**: Vitest with happy-dom environment

**Setup**: `src/test/setup.ts` mocks global fetch and uuid

**Patterns**:
- Mock API responses in `beforeEach`
- Use `vi.fn()` for function mocks
- Reset state between tests

**Test files**: Located in `src/test/`

## Key Development Patterns

### Scene Reconciliation
Updates from Zustand → Three.js are debounced and batched via `reconcileScene()`. Never manipulate Three.js objects directly; always update Zustand store.

### Manager Lifecycle
```typescript
useEffect(() => {
  const manager = new SomeManager(dependencies);
  managerRef.current = manager;

  return () => {
    manager.dispose(); // Always cleanup Three.js resources
  };
}, []);
```

## File Locations

- **State**: `src/state/useModelStore.ts`
- **Three.js**: `src/three/`
- **LDraw processing**: `src/ldraw/`
- **Components**: `src/components/`
- **Utilities**: `src/utils/`
- **Tests**: `src/test/`
- **Scenes**: `public/scenes/`
- **Parts library**: `ldraw/` (478MB, excluded from builds)

## Important Implementation Notes

1. **Immutable state**: All Zustand updates must create new objects
2. **Coordinate conversion**: Always use `LDrawTransforms` when converting between LDraw and Three.js
3. **Debounced reconciliation**: Scene updates are debounced to prevent excessive re-renders
4. **Cleanup**: Always dispose Three.js geometries, materials, and managers in cleanup functions
5. **Line mappings**: Serializer maintains piece ID → line number mappings for editor sync

## Production Deployment

Build excludes the 478MB `ldraw/` directory. Parts must be served via external API:

Set `VITE_LDRAW_API_URL` environment variable to point to parts API server.

Default in development: `/api/parts` (Vite middleware)
Production example: `https://parts-api.yourdomain.com`

See `docs/DeployingPartsApi.md` for full deployment guide.
