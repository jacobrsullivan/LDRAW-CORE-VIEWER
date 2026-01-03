import { create } from 'zustand';
import { Vector3 } from 'three';
import { LDrawModel, RotationMatrix } from '../ldraw/LDrawDataModels';
import { parseLDraw } from '../ldraw/LDrawParser';

export interface TransformUpdate {
  id: string;
  position: Vector3;
  rotationMatrix: RotationMatrix;
}

interface ModelStoreState {
  model: LDrawModel;
  selectedIds: Set<string>;
  mousePosition: { x: number, y: number, z: number } | null;
  isNewFileLoaded: boolean;

  // Editor state
  hasUnsavedChanges: boolean;
  currentFileName: string;

  actions: AppActions;
}

interface AppActions {
    loadModel: (ldrawText: string, isNewFile?: boolean) => void;
    setSelection: (ids: string[]) => void;
    toggleSelection: (id: string) => void;
    addToSelection: (ids: string[]) => void;
    clearSelection: () => void;
    updatePieceTransforms: (updates: TransformUpdate[]) => void;
    setMousePosition: (pos: { x: number, y: number, z: number } | null) => void;
    clearNewFileFlag: () => void;

    // Editor actions
    setHasUnsavedChanges: (hasChanges: boolean) => void;
    setCurrentFileName: (fileName: string) => void;
}

const initialModel: LDrawModel = { pieces: [] };

export const useModelStore = create<ModelStoreState>((set) => ({
  model: initialModel,
  selectedIds: new Set(),
  mousePosition: null,
  isNewFileLoaded: false,

  // Editor state initial values
  hasUnsavedChanges: false,
  currentFileName: '',

  actions: {
    loadModel: (ldrawText, isNewFile = false) => {
      try {
        const newModel = parseLDraw(ldrawText);
        set({
          model: newModel,
          selectedIds: new Set(), // Clear selection on new load
          isNewFileLoaded: isNewFile, // Set flag for camera repositioning
        });
      } catch (error) {
        console.error("LDraw Parsing Error:", error);
      }
    },

    setSelection: (ids) => {
      set({ selectedIds: new Set(ids) });
    },

    toggleSelection: (id) => {
      set((state) => {
        const newSelection = new Set(state.selectedIds);
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        return { selectedIds: newSelection };
      });
    },

    addToSelection: (ids) => {
      set((state) => {
        const newSelection = new Set(state.selectedIds);
        ids.forEach(id => newSelection.add(id));
        return { selectedIds: newSelection };
      });
    },

    clearSelection: () => {
      set({ selectedIds: new Set() });
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

    setMousePosition: (pos) => {
      set({ mousePosition: pos });
    },

    clearNewFileFlag: () => {
      set({ isNewFileLoaded: false });
    },

    // Editor actions
    setHasUnsavedChanges: (hasChanges) => {
      set({ hasUnsavedChanges: hasChanges });
    },

    setCurrentFileName: (fileName) => {
      set({ currentFileName: fileName });
    },
  }
}));

// Helper hooks for optimized consumption in React
export const useModel = () => useModelStore((state) => state.model);
// Granular hook for components that only care about the pieces array
export const usePieces = () => useModelStore((state) => state.model.pieces);
export const useSelection = () => useModelStore((state) => state.selectedIds);
export const useMousePosition = () => useModelStore((state) => state.mousePosition);
export const useIsNewFileLoaded = () => useModelStore((state) => state.isNewFileLoaded);
// Editor state hooks
export const useHasUnsavedChanges = () => useModelStore((state) => state.hasUnsavedChanges);
export const useCurrentFileName = () => useModelStore((state) => state.currentFileName);
// Accessing actions separately prevents re-renders when the model changes
export const useActions = () => useModelStore((state) => state.actions);
