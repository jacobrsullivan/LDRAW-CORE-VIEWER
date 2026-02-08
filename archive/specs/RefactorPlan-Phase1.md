This detailed implementation guide provides the technical details, code examples, and testing strategy for Phase 1 of the refactoring plan. This phase establishes the foundation: the Single Source of Truth (SSoT) and Uni-directional Data Flow (UDF).

### Prerequisites

Install Zustand for state management and `uuid` for generating stable identifiers.

```bash
npm install zustand uuid
npm install --save-dev @types/uuid
```

### 1.1. Centralized Store and Data Model

#### A. Data Model Refinement

Update the core TypeScript interfaces to mandate the `id` and ensure type safety for the rotation matrix.

`src/ldraw/LDrawDataModels.ts`

```typescript
import { Vector3 } from 'three';

// Define the 3x3 rotation matrix as a specific tuple
export type RotationMatrix = [number, number, number, number, number, number, number, number, number];

export interface LDrawPiece {
  // CRITICAL: Mandatory UUID for tracking and reconciliation.
  id: string;
  partId: string; // e.g., "3001.dat"
  position: Vector3; // Stored in LDraw coordinates (-Y up)
  rotationMatrix: RotationMatrix;
  colorCode: number;
  // ... other properties like specialBoxes
}

export interface LDrawModel {
  pieces: LDrawPiece[];
  name?: string;
  // ... other metadata
}
```

#### B. Refactor Parser

Modify the parser to generate a UUID for every Type 1 line (piece instance).

`src/ldraw/LDrawParser.ts` (Relevant excerpts)

```typescript
import { v4 as uuidv4 } from 'uuid';
import { LDrawModel, LDrawPiece, RotationMatrix } from './LDrawDataModels';
import { Vector3 } from 'three';

// Adapt this to your existing parser structure
export function parseLDraw(ldrawText: string): LDrawModel {
  const lines = ldrawText.split('\n');
  const pieces: LDrawPiece[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('1 ')) {
      // ... (Your existing logic to parse the line parts) ...
      const parts = trimmedLine.split(/\s+/);

      const piece: LDrawPiece = {
        id: uuidv4(), // <-- THE KEY CHANGE: Assign stable ID during parsing
        colorCode: parseInt(parts[1], 10),
        position: new Vector3(parseFloat(parts[2]), parseFloat(parts[3]), parseFloat(parts[4])),
        rotationMatrix: parts.slice(5, 14).map(parseFloat) as RotationMatrix,
        partId: parts.slice(14).join(' '),
      };

      pieces.push(piece);
    }
    // ... handle metadata (Type 0 lines)
  }

  return { pieces /*, ...metadata */ };
}
```

#### C. Implement Serializer

Implement the serializer that converts the `LDrawModel` back into canonical LDraw text.

`src/ldraw/LDrawSerializer.ts`

```typescript
import { LDrawModel } from './LDrawDataModels';

// Helper to format numbers cleanly for LDraw, removing trailing zeros.
const fmt = (num: number): string => {
    if (Number.isInteger(num)) {
        return num.toString();
    }
    // Use 5 decimal precision as a safe standard
    return num.toFixed(5).replace(/\.?0+$/, '');
}

export function serializeModel(model: LDrawModel): string {
  const lines: string[] = [];

  // Handle metadata
  if (model.name) {
    lines.push(`0 Name: ${model.name}`);
  }

  // Handle pieces (Type 1 lines)
  for (const piece of model.pieces) {
    const { colorCode, position, rotationMatrix, partId } = piece;

    const pos = `${fmt(position.x)} ${fmt(position.y)} ${fmt(position.z)}`;
    const rot = rotationMatrix.map(fmt).join(' ');

    // Format: 1 <color> <x> <y> <z> <a>..<i> <file>
    lines.push(`1 ${colorCode} ${pos} ${rot} ${partId}`);
  }

  return lines.join('\n');
}
```

### 1.2. Define Core Actions (The Zustand Store)

Create the SSoT. We use a pattern that separates actions from the state data to optimize React rendering.

`src/state/useModelStore.ts`

```typescript
import { create } from 'zustand';
import { Vector3 } from 'three';
import { LDrawModel, RotationMatrix } from '../ldraw/LDrawDataModels';
import { parseLDraw } from '../ldraw/LDrawParser';

export interface TransformUpdate {
  id: string;
  position: Vector3;
  rotationMatrix: RotationMatrix;
}

interface AppState {
  model: LDrawModel;
  selectedIds: Set<string>;
  actions: AppActions;
}

interface AppActions {
    loadModel: (ldrawText: string) => void;
    setSelection: (ids: string[]) => void;
    updatePieceTransforms: (updates: TransformUpdate[]) => void;
}

const initialModel: LDrawModel = { pieces: [] };

export const useModelStore = create<AppState>((set) => ({
  model: initialModel,
  selectedIds: new Set(),

  actions: {
    loadModel: (ldrawText) => {
      try {
        const newModel = parseLDraw(ldrawText);
        set({
          model: newModel,
          selectedIds: new Set(), // Clear selection on new load
        });
      } catch (error) {
        console.error("LDraw Parsing Error:", error);
      }
    },

    setSelection: (ids) => {
      set({ selectedIds: new Set(ids) });
    },

    updatePieceTransforms: (updates) => {
      const updatesMap = new Map(updates.map(u => [u.id, u]));

      set(state => {
        // CRITICAL: Immutable update pattern
        const newPieces = state.model.pieces.map(piece => {
          const update = updatesMap.get(piece.id);
          if (update) {
            return {
              ...piece,
              // Ensure we clone complex objects/arrays
              position: update.position.clone(),
              rotationMatrix: [...update.rotationMatrix] as RotationMatrix,
            };
          }
          // Return the original piece if not updated (maintains reference equality)
          return piece;
        });

        return { model: { ...state.model, pieces: newPieces } };
      });
    },
  }
}));

// Helper hooks for optimized consumption in React
export const useModel = () => useModelStore((state) => state.model);
// Granular hook for components that only care about the pieces array
export const usePieces = () => useModelStore((state) => state.model.pieces);
export const useSelection = () => useModelStore((state) => state.selectedIds);
// Accessing actions separately prevents re-renders when the model changes
export const useActions = () => useModelStore((state) => state.actions);
```

### 1.3. Refactor Views as Consumers (The Read Path)

Refactor the UI components to read exclusively from the Zustand store.

#### A. Monaco Editor

`src/components/LDrawEditor.tsx`

```typescript
import React, { useMemo } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useModel } from '../state/useModelStore';
import { serializeModel } from '../ldraw/LDrawSerializer';

export const LDrawEditor: React.FC = () => {
  const model = useModel();

  // Derive the editor content from the SSoT model.
  // useMemo ensures serialization only runs when the model reference changes.
  const content = useMemo(() => serializeModel(model), [model]);

  const handleEditorChange = (value: string | undefined) => {
    // Disabled for Phase 1.
  };

  return (
    <MonacoEditor
      // ... other props
      value={content}
      onChange={handleEditorChange}
      options={{
        // Enforce read-only for Phase 1 to guarantee UDF visualization
        readOnly: true
      }}
    />
  );
};
```

#### B. Three.js Renderer

The renderer subscribes to the `pieces` array for optimized updates.

`src/components/ThreeDViewport.tsx` (Conceptual)

```typescript
import React, { useEffect, useRef } from 'react';
import { usePieces } from '../state/useModelStore';
// Assume SceneManager is your class handling Three.js rendering
import { SceneManager } from '../three/SceneManager';

export const ThreeDViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);

  // Subscribe specifically to the pieces array
  const pieces = usePieces();

  useEffect(() => {
    // ... initialization of SceneManager ...
    if (canvasRef.current && !sceneManagerRef.current) {
        sceneManagerRef.current = new SceneManager(canvasRef.current);
        // CRITICAL: Ensure 3D interactions (dragging/clicking) are disabled for Phase 1
    }
  }, []);

  // The Read Path: Store -> 3D View
  useEffect(() => {
    if (sceneManagerRef.current) {
      // Update the 3D scene when the SSoT changes.
      // For Phase 1, use your existing loading mechanism (brute force).
      // This will be replaced by Smart Reconciliation in Phase 3.
      sceneManagerRef.current.loadPieces(pieces);
    }
  }, [pieces]); // Depend directly on the pieces array

  return <canvas ref={canvasRef} />;
};
```

### Verification and Testing

Unit tests (using Vitest) are essential. To ensure deterministic tests, we must mock the `uuid` library.

#### Test Setup: Mocking UUID

If using Vitest (or Jest), set up a mock for the `uuid` module.

`src/setupTests.ts` (or similar configuration file)

```typescript
import { vi } from 'vitest';

// Mock the uuid library
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));
```

#### Unit Tests

`src/ldraw/ParserSerializer.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseLDraw } from './LDrawParser';
import { serializeModel } from './LDrawSerializer';
import { v4 as mockUuid } from 'uuid';

const sampleLDraw = `0 Name: Test.ldr
1 4 10 20 30 1 0 0 0 1 0 0 0 1 3001.dat
1 16 0.5 0 0 1 0 0 0 1 0 0 0 1 3003.dat`;

describe('LDraw Parser and Serializer', () => {
  beforeEach(() => {
    // Define the sequence of UUIDs the mock will return
    (mockUuid as any).mockClear();
    (mockUuid as any).mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2');
  });

  it('should assign unique, deterministic IDs to each piece', () => {
    const model = parseLDraw(sampleLDraw);
    expect(model.pieces.length).toBe(2);
    expect(model.pieces[0].id).toBe('uuid-1');
    expect(model.pieces[1].id).toBe('uuid-2');
  });

  it('should serialize with clean formatting (integers and floats)', () => {
    const model = parseLDraw(sampleLDraw);
    const serialized = serializeModel(model);
    // Check integer formatting
    expect(serialized).toContain('1 4 10 20 30 1 0 0 0 1 0 0 0 1 3001.dat');
    // Check float formatting (0.5 instead of 0.50000)
    expect(serialized).toContain('1 16 0.5 0 0 1 0 0 0 1 0 0 0 1 3003.dat');
  });
});
```

`src/state/useModelStore.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModelStore, TransformUpdate } from './useModelStore';
import { Vector3 } from 'three';
import { v4 as mockUuid } from 'uuid';

const initialState = useModelStore.getState();
const sampleText = "1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat";

// Helper to access actions for testing
const getActions = () => useModelStore.getState().actions;

describe('Zustand Model Store', () => {
  beforeEach(() => {
    // Reset the store and mock
    useModelStore.setState(initialState, true);
    (mockUuid as any).mockClear();
    (mockUuid as any).mockReturnValue('test-id-1');
  });

  it('should update piece transforms immutably', () => {
    // 1. Setup
    getActions().loadModel(sampleText);
    const state1 = useModelStore.getState();
    const pieceToUpdate = state1.model.pieces[0];
    const newPosition = new Vector3(100, 100, 100);

    // 2. Act
    const update: TransformUpdate = {
      id: pieceToUpdate.id,
      position: newPosition,
      rotationMatrix: pieceToUpdate.rotationMatrix,
    };
    getActions().updatePieceTransforms([update]);

    // 3. Assert
    const state2 = useModelStore.getState();
    const updatedPiece = state2.model.pieces[0];

    expect(updatedPiece.position).toEqual(newPosition);

    // Check Immutability
    expect(state2.model).not.toBe(state1.model); // Model reference must change
    expect(updatedPiece).not.toBe(pieceToUpdate); // Piece reference must change
    expect(pieceToUpdate.position.x).toBe(0); // Original object must not mutate
  });
});
```