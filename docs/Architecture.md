# Architecture

This document explains the implementation of the LDraw 3D Web Viewer & Editor for developers who want to understand or extend the codebase.

## Overview

The application follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    React UI Layer                           │
│  Canvas3D.tsx  │  LDrawEditor.tsx  │  Modals               │
└────────┬───────┴────────┬──────────┴───────────────────────┘
         │                │
         ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                  State Layer (Zustand)                      │
│           useModelStore.ts - Single source of truth         │
└────────┬───────────────────────────────┬────────────────────┘
         │                               │
         ▼                               ▼
┌─────────────────────────┐  ┌────────────────────────────────┐
│    Three.js Layer       │  │      LDraw Layer               │
│                         │  │                                │
│  SceneManager           │  │  LDrawParser                   │
│  PieceManager           │  │  LDrawSerializer               │
│  SelectionManager       │  │  ColorManager                  │
│  TransformControls      │  │  PartsFileManager              │
└─────────────────────────┘  └────────────────────────────────┘
```

---

## State Management

### Zustand Store (`src/state/useModelStore.ts`)

All application state lives in a single Zustand store:

```typescript
interface ModelState {
  // Model data
  model: LDrawModel;

  // Selection state
  selectedIds: Set<string>;

  // Editor state
  hasUnsavedChanges: boolean;
  currentFileName: string;
}
```

### Key Principles

1. **Single Source of Truth**: The Zustand store is the authoritative state
2. **Immutable Updates**: All state changes create new objects
3. **Derived Hooks**: Typed selector hooks for specific state slices

```typescript
// Selector hooks
export const useModel = () => useModelStore(state => state.model);
export const useSelection = () => useModelStore(state => state.selectedIds);
export const useActions = () => useModelStore(state => state.actions);
```

### Actions

```typescript
actions: {
  loadModel: (model: LDrawModel) => void;
  setSelection: (ids: Set<string>) => void;
  updatePieceTransforms: (updates: PieceTransformUpdate[]) => void;
  addPiece: (piece: LDrawPiece) => void;
  deletePiece: (id: string) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  setCurrentFileName: (name: string) => void;
}
```

---

## React Components

### Canvas3D (`src/components/Canvas3D.tsx`)

The 3D viewport component. Key responsibilities:

1. **Initialize Three.js scene** via SceneManager
2. **Handle input events** via InputEventHandler
3. **Sync with Zustand state** via reconcileScene
4. **Manage transform controls** for selection manipulation

```typescript
// Lifecycle
useEffect(() => {
  // Create managers
  sceneManagerRef.current = new SceneManager(containerRef.current);
  selectionManagerRef.current = new SelectionManager(scene, camera);
  // ... more managers

  return () => {
    // Cleanup
    sceneManagerRef.current?.dispose();
  };
}, []);
```

### LDrawEditor (`src/components/LDrawEditor.tsx`)

The Monaco editor component. Key responsibilities:

1. **Display LDraw code** from model state
2. **Parse edits** and update model
3. **Sync with 3D changes** when model updates externally
4. **File operations** via SceneFileManager

```typescript
// Bidirectional sync
useEffect(() => {
  if (modelChangedExternally) {
    setEditorContent(serializeModel(model));
  }
}, [model]);

const handleEditorChange = (value: string) => {
  const parsed = parseLDraw(value);
  actions.loadModel(parsed);
};
```

---

## Three.js Layer

### SceneManager (`src/three/SceneManager.ts`)

Central orchestrator for Three.js. Creates and manages:

- Scene, Camera, Renderer
- Lighting setup
- Grid helpers
- Animation loop

```typescript
class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private pieceManager: PieceManager;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.setupCamera();
    this.setupLighting();
    this.startAnimationLoop();
  }
}
```

### PieceManager (`src/three/PieceManager.ts`)

Manages 3D piece instances:

- Loads part geometry via PartGeometryLoader
- Creates Three.js objects for each piece
- Applies transforms and colors
- Tracks piece ID to object mapping

```typescript
class PieceManager {
  private pieces: Map<string, PieceInstance>;

  async addPiece(piece: LDrawPiece): Promise<Object3D> {
    const geometry = await this.geometryLoader.load(piece.partId);
    const material = this.colorManager.getMaterial(piece.colorCode);
    const mesh = new THREE.Mesh(geometry, material);

    this.applyTransform(mesh, piece);
    this.pieces.set(piece.id, { piece, object: mesh });

    return mesh;
  }
}
```

### SelectionManager (`src/three/SelectionManager.ts`)

Handles piece selection with visual feedback:

- Tracks selected piece IDs
- Applies selection highlighting (emissive material)
- Extends EventDispatcher for selection change events

```typescript
class SelectionManager extends THREE.EventDispatcher {
  private selectedIds: Set<string>;

  select(id: string): void {
    this.selectedIds.add(id);
    this.applyHighlight(id);
    this.dispatchEvent({ type: 'selectionChanged' });
  }
}
```

### SelectionGroupManager (`src/three/SelectionGroupManager.ts`)

Manages multi-selection transforms:

- Creates a temporary group at selection centroid
- Reparents selected objects to group
- Applies transforms to group
- Extracts final transforms on completion

```typescript
class SelectionGroupManager {
  createGroup(pieceObjects: Object3D[]): Group {
    const centroid = this.calculateCentroid(pieceObjects);
    const group = new THREE.Group();
    group.position.copy(centroid);

    pieceObjects.forEach(obj => {
      group.attach(obj); // Preserves world transform
    });

    return group;
  }
}
```

### TransformControlsManager (`src/three/TransformControlsManager.ts`)

Wraps Three.js TransformControls:

- Attaches to selected objects or groups
- Handles mode switching (translate/rotate/scale)
- Commits transforms to Zustand on completion

```typescript
class TransformControlsManager {
  private controls: TransformControls;

  attach(object: Object3D): void {
    this.controls.attach(object);
  }

  setMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.controls.setMode(mode);
  }
}
```

### reconcileScene (`src/three/reconcileScene.ts`)

Efficiently syncs Zustand state to Three.js:

```typescript
async function reconcileScene(
  sceneManager: SceneManager,
  newModel: LDrawModel
): Promise<ReconciliationStats> {
  const existing = sceneManager.getPieces();
  const newPieceMap = new Map(newModel.pieces.map(p => [p.id, p]));

  // Remove deleted pieces
  for (const id of existing.keys()) {
    if (!newPieceMap.has(id)) {
      sceneManager.removePiece(id);
    }
  }

  // Add/update pieces
  for (const piece of newModel.pieces) {
    if (!existing.has(piece.id)) {
      await sceneManager.addPiece(piece);
    } else if (hasChanged(existing.get(piece.id), piece)) {
      sceneManager.updatePiece(piece.id, piece);
    }
  }
}
```

---

## LDraw Layer

### LDrawParser (`src/ldraw/LDrawParser.ts`)

Parses LDraw text into data models:

```typescript
function parseLDraw(content: string): LDrawModel {
  const lines = content.split('\n');
  const pieces: LDrawPiece[] = [];
  const metadata = {};

  for (const line of lines) {
    const type = parseInt(line.trim()[0]);

    switch (type) {
      case 0: // Comment/meta
        parseMetadata(line, metadata);
        break;
      case 1: // Part reference
        pieces.push(parsePieceLine(line));
        break;
    }
  }

  return { pieces, ...metadata };
}
```

### LDrawSerializer (`src/ldraw/LDrawSerializer.ts`)

Converts model back to LDraw text:

```typescript
function serializeModel(model: LDrawModel): string {
  const lines: string[] = [];

  // Metadata
  if (model.name) lines.push(`0 Name: ${model.name}`);
  if (model.author) lines.push(`0 Author: ${model.author}`);

  // Pieces
  for (const piece of model.pieces) {
    lines.push(serializePiece(piece));
  }

  return lines.join('\n');
}

function serializePiece(piece: LDrawPiece): string {
  const { position, rotationMatrix, colorCode, partId } = piece;
  const [a,b,c,d,e,f,g,h,i] = rotationMatrix;

  return `1 ${colorCode} ${position.x} ${position.y} ${position.z} ${a} ${b} ${c} ${d} ${e} ${f} ${g} ${h} ${i} ${partId}`;
}
```

### Coordinate Conversion (`src/three/LDrawTransforms.ts`)

LDraw uses -Y up, Three.js uses +Y up:

```typescript
function ldrawToThreePosition(ldrawPos: Vector3): Vector3 {
  return new Vector3(ldrawPos.x, -ldrawPos.y, ldrawPos.z);
}

function threeToLDrawPosition(threePos: Vector3): Vector3 {
  return new Vector3(threePos.x, -threePos.y, threePos.z);
}
```

---

## Data Flow

### Loading a Model

```
User selects file
       │
       ▼
SceneFileManager.loadScene(path)
       │
       ▼
fetch() returns LDraw text
       │
       ▼
LDrawParser.parseLDraw(text) → LDrawModel
       │
       ▼
actions.loadModel(model) → Zustand update
       │
       ▼
Canvas3D receives new model via useModel()
       │
       ▼
reconcileScene() syncs to Three.js
       │
       ▼
LDrawEditor receives model, serializes to text
```

### Transforming a Piece

```
User drags transform gizmo
       │
       ▼
TransformControls 'objectChange' event
       │
       ▼
Extract new position/rotation from Object3D
       │
       ▼
Convert Three.js → LDraw coordinates
       │
       ▼
actions.updatePieceTransforms([{ id, position, rotation }])
       │
       ▼
Zustand updates model.pieces
       │
       ▼
LDrawEditor serializes new model to text
```

### Editing Code

```
User types in Monaco editor
       │
       ▼
onChange debounced (500ms)
       │
       ▼
LDrawParser.parseLDraw(newText) → LDrawModel
       │
       ▼
actions.loadModel(model) → Zustand update
       │
       ▼
reconcileScene() diffs and updates Three.js
```

---

## Key Implementation Details

### Piece IDs

Every piece has a unique ID generated on parse:

```typescript
// During parsing
const piece: LDrawPiece = {
  id: crypto.randomUUID(),
  partId: '3001.dat',
  // ...
};
```

IDs are preserved through transforms but regenerated on re-parse. The serializer includes IDs as comments for round-trip stability.

### Immutable State Updates

Always clone objects when updating state:

```typescript
// Correct
updatePieceTransforms: (updates) => set(state => ({
  model: {
    ...state.model,
    pieces: state.model.pieces.map(piece => {
      const update = updates.find(u => u.id === piece.id);
      return update
        ? { ...piece, position: update.position.clone() }
        : piece;
    })
  }
}));
```

### Three.js Cleanup

Always dispose resources:

```typescript
class SceneManager {
  dispose(): void {
    this.pieceManager.dispose();
    this.renderer.dispose();

    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
  }
}
```

---

## Testing

### Framework

- **Vitest** for test runner
- **happy-dom** for lightweight DOM simulation
- Tests located in `src/test/`

### Patterns

```typescript
// Mock store
vi.mock('../state/useModelStore', () => ({
  useModel: () => mockModel,
  useActions: () => mockActions,
}));

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, text: () => 'LDraw content' })
);
```

### Running Tests

```bash
npm test          # Run once
npm run test:watch # Watch mode
```

---

## File Reference

| File | Purpose |
|------|---------|
| `src/state/useModelStore.ts` | Zustand store |
| `src/components/Canvas3D.tsx` | 3D viewport |
| `src/components/LDrawEditor.tsx` | Code editor |
| `src/three/SceneManager.ts` | Three.js orchestrator |
| `src/three/PieceManager.ts` | Piece instance management |
| `src/three/SelectionManager.ts` | Selection handling |
| `src/three/reconcileScene.ts` | State → Three.js sync |
| `src/ldraw/LDrawParser.ts` | Text → Model |
| `src/ldraw/LDrawSerializer.ts` | Model → Text |
| `src/ldraw/LDrawTransforms.ts` | Coordinate conversion |
| `src/utils/SceneFileManager.ts` | File I/O |

---

## Extending the Application

### Adding a New Feature

1. **State**: Add to Zustand store if needed
2. **UI**: Create React component
3. **Three.js**: Add manager if 3D logic needed
4. **Tests**: Add test coverage

### Adding a New Transform Mode

1. Extend `TransformControlsManager` with new mode
2. Add keyboard shortcut in `InputEventHandler`
3. Update UI to show current mode

### Supporting New LDraw Features

1. Update `LDrawParser` to parse new syntax
2. Update `LDrawSerializer` to output new syntax
3. Update `LDrawDataModels` with new interfaces
4. Add rendering support in Three.js layer if visual
