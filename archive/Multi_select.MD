This deep dive analysis confirms that the current implementation struggles with multi-select because the scene graph management and state synchronization are designed primarily for single selections. The observed "jumping" behavior when selecting a second piece is a classic symptom of incorrect object reparenting in Three.js.

Here is a comprehensive, KISS-compliant implementation plan to introduce robust multi-select functionality.

### Root Cause Analysis

To move or rotate multiple objects as a unit, they must share a common parent, typically a temporary `SelectionGroup`. The pivot point for this group must be the geometric center of all selected items.

The error occurs because:

1.  **Incorrect Reparenting (The "Jump"):** When an object is moved from the `ModelGroup` to the `SelectionGroup`, if `Group.add()` is used, the object's local coordinates are preserved. If the `SelectionGroup` is positioned away from the origin (e.g., at the center of the first brick), the object's world position changes drastically—it jumps.
2.  **The Fix:** Three.js provides `Group.attach(object)`. This method reparents the object but recalculates its local transform so that its absolute position in the world remains unchanged. This is essential for seamless grouping.
3.  **State Management:** The application state in `Canvas3D.tsx` only tracks a single `selectedPieceId`, which is insufficient for updating multiple pieces after a group transformation.

### Comprehensive Implementation Plan (KISS)

This plan involves updating the selection management to use `attach()`, adapting the input handling for additive selection, and refactoring the state management in the UI.

*(Note: As the source code for `SelectionManager.ts` and `InputEventHandler.ts` was not provided in the prompt, conceptual implementations for the necessary changes are included.)*

#### Phase 1: Refactor `SelectionManager.ts` (The Core Fix)

The `SelectionManager` must manage a set of selected objects and correctly execute the grouping and centering logic.

```typescript
// src/three/SelectionManager.ts (Conceptual Refactor)

import * as THREE from 'three';
// Assume EventEmitter functionality is available

export enum SelectionEvents {
  SELECTION_CHANGED = 'selection_changed',
}

export class SelectionManager {
  private selectedObjects: Set<THREE.Object3D> = new Set();
  private origin: 'editor' | 'viewer' = 'viewer';

  constructor(private modelGroup: THREE.Group, private selectionGroup: THREE.Group) {
    // ... initialization ...
  }

  // Handles selection logic
  public select(object: THREE.Object3D, additive: boolean = false): void {
    if (!additive) {
      if (this.selectedObjects.size === 1 && this.selectedObjects.has(object)) return;
      this.clear(false); // Clear without dispatching yet
    }
    
    if (this.selectedObjects.has(object)) return;

    this.selectedObjects.add(object);
    this.updateGroupAndDispatch();
  }

  // Handles toggling (for Shift+Click)
  public toggle(object: THREE.Object3D): void {
    if (this.selectedObjects.has(object)) {
      this.selectedObjects.delete(object);
    } else {
      this.selectedObjects.add(object);
    }
    this.updateGroupAndDispatch();
  }

  public clear(dispatch = true): void {
    this.ungroupSelection();
    this.selectedObjects.clear();
    if (dispatch) {
        this.dispatchSelectionChanged();
    }
  }

  // CRITICAL: Return objects to the ModelGroup using attach()
  private ungroupSelection(): void {
    // Iterate over a copy as attach() modifies the children array
    [...this.selectionGroup.children].forEach(obj => {
      this.modelGroup.attach(obj);
    });
    // Reset the group transform
    this.selectionGroup.position.set(0, 0, 0);
    this.selectionGroup.quaternion.identity();
  }

  // CRITICAL: Calculate center and group using attach()
  private updateSelectionGroup(): void {
    // 1. Ensure everything is ungrouped before recalculating the center
    this.ungroupSelection();

    if (this.selectedObjects.size === 0) return;

    // 2. Calculate Bounding Box Center (Objects are temporarily in modelGroup)
    const bbox = new THREE.Box3();
    this.selectedObjects.forEach(obj => bbox.expandByObject(obj));
    const center = new THREE.Vector3();
    
    if (isFinite(bbox.max.x)) {
        bbox.getCenter(center);
    }

    // 3. Position SelectionGroup at the center
    this.selectionGroup.position.copy(center);
    this.selectionGroup.updateMatrixWorld(true); // Ensure matrix is updated before attaching

    // 4. Attach objects (KISS Fix: preserves world position)
    this.selectedObjects.forEach(obj => {
      this.selectionGroup.attach(obj);
    });
  }

  private updateGroupAndDispatch(): void {
    this.updateSelectionGroup();
    this.dispatchSelectionChanged();
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedObjects)
        .map(obj => obj.userData.pieceId)
        .filter(id => id);
  }

  private dispatchSelectionChanged(): void {
    // The payload must be updated to support multi-select
    this.dispatchEvent(SelectionEvents.SELECTION_CHANGED, {
      pieceIds: this.getSelectedIds(),
      objects: Array.from(this.selectedObjects),
      origin: this.origin
    });
    // ... (rest of event dispatching logic)
  }
  
  // ... (addEventListener, dispatchEvent, setOrigin methods)
}
```

#### Phase 2: Update `SceneManager.ts`

Adapt `SceneManager` to the new event signatures and provide a method to update all selected pieces simultaneously.

```typescript
// src/three/SceneManager.ts

// 1. Update Event data types (around line 44)
type SceneEventData = {
  // ... other events
  [SceneEvents.SCENE_RESET]: null;
  // OLD: [SceneEvents.SELECTION_CHANGED]: { pieceId: string | null; object: THREE.Object3D | null };
  // NEW:
  [SceneEvents.SELECTION_CHANGED]: { pieceIds: string[]; objects: THREE.Object3D[]; origin?: string };
}

// ... inside SceneManager class ...

// 2. NEW METHOD: Update transforms for all pieces in the selection group
public updateSelectedPieceTransforms(): void {
    if (!this.pieceManager || !this.selectionGroup) return;
    
    // Ensure world matrices are updated as the group has moved
    this.selectionGroup.updateMatrixWorld(true);

    // Iterate over children currently in the selection group
    // Their world positions are updated by Three.js; we just need to sync LDraw data.
    this.selectionGroup.children.forEach(object => {
        const pieceId = object.userData.pieceId;
        if (pieceId) {
            this.pieceManager!.updatePieceTransformFromObject(pieceId);
        }
    });
}

// 3. Update selectObjectAtCoordinates (around line 730)
// Rename `doSelect` to `additive` and implement multi-select logic.
public selectObjectAtCoordinates(x: number, y: number, additive: boolean = false): boolean {
    // ... (Raycasting setup remains the same) ...
    
    if (!this.modelGroup) return false;
    
    // CRITICAL: Raycast against both groups because selected items are moved to selectionGroup.
    const targets = [...this.modelGroup.children, ...this.selectionGroup.children];
    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      for (const intersect of intersects) {
        const pieceId = this.findPieceIdForObject(intersect.object);
        if (pieceId) {
          const pieceData = this.getPieceById(pieceId);
          if (pieceData && pieceData.object) {
            if (additive) {
                // Use the new toggle functionality (implemented in SelectionManager)
                this.selectionManager.toggle(pieceData.object);
            } else {
                // Use the standard select functionality
                this.selectionManager.select(pieceData.object, false);
            }
          }
          return true;
        }
      }
    }
    
    // If clicked empty space and NOT additive, clear selection
    if (!additive) {
      this.selectionManager.clear();
    }
    return false;
}

// 4. Remove or update legacy methods like selectPieceById, getSelectedPieceId, getSelectedObject 
// to align with the new multi-select reality managed by SelectionManager.
```

#### Phase 3: Update `InputEventHandler.ts` (Interaction)

The input handler must detect modifier keys (Shift/Ctrl) to signal additive selection.

```typescript
// src/three/InputEventHandler.ts (Conceptual Update)

// ... inside the relevant mouse click handler (e.g., onClick or onPointerUp)

private onClick(event: MouseEvent): void {
    event.preventDefault();
    
    // Determine if this is an additive selection
    const additive = event.shiftKey || event.ctrlKey;

    // ... (Calculate screen X and Y) ...

    // Call the updated SceneManager method
    this.sceneManager.selectObjectAtCoordinates(x, y, additive);
}
```

#### Phase 4: Update `Canvas3D.tsx` (State and UI)

The React component state must track multiple IDs and handle the transformation updates correctly.

```typescript
// src/components/Canvas3D.tsx

// 1. Update Selection State (Lines 44-49)
/* OLD
const [selectedPiece, setSelectedPiece] = useState<...>;
*/

// NEW: Track multiple IDs and info for the primary selection (for the footer UI)
const [selectionState, setSelectionState] = useState<{
    selectedIds: string[];
    primaryInfo: {
        pieceId: string;
        partId?: string;
        position?: { x: number; y: number; z: number };
    } | null;
}>({ selectedIds: [], primaryInfo: null });

// 2. Update handleTransformChange (Line 93)
const handleTransformChange = useCallback((): void => {
    if (!sceneManagerRef.current || selectionState.selectedIds.length === 0) return;

    // CRITICAL: Update LDraw data for ALL selected pieces as the group moves
    sceneManagerRef.current.updateSelectedPieceTransforms();

    // Update React state for the primary piece (to update the footer UI live)
    const primaryId = selectionState.selectedIds[0];
    const updatedPieceData = sceneManagerRef.current.getPieceById(primaryId);
    
    if (updatedPieceData && updatedPieceData.piece) {
      setSelectionState(prevState => ({
        ...prevState,
        primaryInfo: {
          pieceId: primaryId,
          partId: updatedPieceData.piece.partId,
          position: updatedPieceData.piece.position
        }
      }));
    }
}, [selectionState.selectedIds]);

// 3. handleTransformEnd (Line 117) remains largely the same. 
// Since updates happen live in handleTransformChange, this just syncs the final state.

// 4. Update handleSelectionChange (Line 145)
// Update the signature to match the new event payload from SceneManager/SelectionManager
const handleSelectionChange = useCallback((data: { pieceIds: string[]; objects: THREE.Object3D[]; origin?: string }) => {
    console.log(`Selection changed: count = ${data.pieceIds.length}, origin = ${data.origin}`);

    const { origin } = useModelStore.getState();
    // ... (origin check logic remains the same) ...

    // Determine Primary Info for UI
    let primaryInfo = null;
    if (data.pieceIds.length > 0 && sceneManagerRef.current) {
        const primaryId = data.pieceIds[0];
        const pieceData = sceneManagerRef.current.getPieceById(primaryId);
        if (pieceData && pieceData.piece) {
            primaryInfo = { /* ... populate info ... */ };
        }
    }

    setSelectionState({ selectedIds: data.pieceIds, primaryInfo });

    // Attach/Detach Transform Controls
    if (data.pieceIds.length > 0) {
        if (transformControlsManagerRef.current && origin !== 'editor') {
            console.log('Attaching transform controls to selectionGroup');
            setTimeout(() => {
                if (transformControlsManagerRef.current && sceneManagerRef.current) {
                    // Attach to the group which SelectionManager has already centered and populated.
                    const selectionGroup = sceneManagerRef.current.getSelectionGroup();
                    transformControlsManagerRef.current.attach(selectionGroup);
                }
            }, 50);
        }
    } else {
        console.log('Clearing selection');
        transformControlsManagerRef.current?.detach();
    }
}, []);

// 5. Update UI rendering conditions (JSX)
// Replace checks for `selectedPiece.pieceId` with `selectionState.selectedIds.length > 0`.
// Update the Footer (around line 743) to display the count and primary selection info.
```