# Phase 5: Multi-Select and Group Transformations

**Objective**: Complete the LDraw 3D Web Visualizer by implementing robust multi-selection with group transformations using the Temporary Transform Group pattern.

**Duration**: 2-3 Days

**Prerequisites**: Phases 1-4 complete with all core systems operational

---

## 🎯 Goal Summary

- **Multi-Selection**: Shift/Ctrl click to select multiple pieces
- **Visual Indicators**: Clear highlighting for all selected pieces
- **Group Transform**: Temporary group at centroid for collective manipulation
- **Seamless Integration**: Leverage existing SSoT, transforms, and sync systems
- **Performance**: Efficient batch updates with minimal overhead

---

## 🏗️ Core Implementation Strategy

### 5.1 Enhanced Multi-Selection State Management

**Target**: `src/state/useModelStore.ts`, `src/three/SelectionManager.ts`

#### A. Store Enhancement

```typescript
// Already have selectedIds: Set<string>
// Add selection mode helpers
interface AppActions {
  // Existing...
  toggleSelection: (id: string) => void;
  addToSelection: (ids: string[]) => void;
  clearSelection: () => void;
}

// Implementation
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
}
```

#### B. Visual Selection Enhancement

Update `SelectionManager.updateVisualSelection()` to handle multiple pieces:

```typescript
// Enhanced highlighting for multi-selection
private highlightObject(object: THREE.Object3D): void {
  const mesh = this.findMeshInObject(object);
  if (mesh) {
    // Store original material if not already stored
    if (!this.originalMaterials.has(mesh)) {
      this.originalMaterials.set(mesh, mesh.material);
    }
    
    // Use different colors for primary vs secondary selection
    const isPrimary = Array.from(this.selectedObjects)[0] === object;
    mesh.material = isPrimary ? this.primaryHighlight : this.secondaryHighlight;
  }
}
```

---

### 5.2 The Temporary Transform Group Pattern

**Target**: New file `src/three/SelectionGroupManager.ts`

```typescript
export class SelectionGroupManager {
  private selectionGroup: THREE.Group | null = null;
  private scene: THREE.Scene;
  private originalParents: Map<string, THREE.Object3D> = new Map();
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }
  
  /**
   * Creates temporary group at centroid of selected pieces
   */
  createSelectionGroup(pieces: Array<{ id: string; object: THREE.Object3D }>): THREE.Group {
    // Clean up any existing group
    this.cleanup();
    
    // Calculate centroid
    const centroid = this.calculateCentroid(pieces.map(p => p.object));
    
    // Create group at centroid
    this.selectionGroup = new THREE.Group();
    this.selectionGroup.position.copy(centroid);
    this.selectionGroup.userData = { type: 'selection-group' };
    this.scene.add(this.selectionGroup);
    
    return this.selectionGroup;
  }
  
  /**
   * Attach pieces to selection group preserving world transform
   */
  attachPieces(pieces: Array<{ id: string; object: THREE.Object3D }>): void {
    if (!this.selectionGroup) return;
    
    pieces.forEach(({ id, object }) => {
      // Store original parent
      this.originalParents.set(id, object.parent!);
      
      // Attach preserving world position
      this.selectionGroup.attach(object);
    });
  }
  
  /**
   * Detach pieces back to original parents preserving world transform
   */
  detachPieces(): void {
    if (!this.selectionGroup) return;
    
    const updates: TransformUpdate[] = [];
    
    // Detach each piece back to original parent
    this.originalParents.forEach((originalParent, pieceId) => {
      const piece = this.selectionGroup!.children.find(
        child => child.userData.pieceId === pieceId
      );
      
      if (piece && originalParent) {
        // Attach back to original parent (preserves world transform)
        originalParent.attach(piece);
        
        // Collect transform for store update
        const transform = extractLDrawTransform(piece);
        updates.push({
          id: pieceId,
          position: transform.position,
          rotationMatrix: transform.rotationMatrix
        });
      }
    });
    
    // Batch update store
    if (updates.length > 0) {
      useModelStore.getState().actions.updatePieceTransforms(updates);
    }
    
    // Cleanup
    this.cleanup();
  }
  
  private calculateCentroid(objects: THREE.Object3D[]): THREE.Vector3 {
    const box = new THREE.Box3();
    objects.forEach(obj => box.expandByObject(obj));
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    return center;
  }
  
  private cleanup(): void {
    if (this.selectionGroup) {
      this.scene.remove(this.selectionGroup);
      this.selectionGroup = null;
    }
    this.originalParents.clear();
  }
}
```

---

### 5.3 Transform Controls Integration

**Target**: `src/three/TransformControlsManager.ts`

Add methods to handle group transforms:

```typescript
/**
 * Attach to selection group for multi-piece transform
 */
public attachToSelectionGroup(group: THREE.Group): void {
  this.attach(group);
  console.log('Transform controls attached to selection group');
}

/**
 * Check if attached to selection group
 */
public isGroupTransform(): boolean {
  return this.controls.object?.userData.type === 'selection-group';
}

/**
 * Enhanced transform end handler for groups
 */
private handleTransformEnd = (): void => {
  if (!this.controls.object) return;
  
  if (this.isGroupTransform()) {
    // Dispatch group transform event
    this.dispatchEvent({
      type: TransformControlsEvents.GROUP_TRANSFORM_ENDED,
      object: this.controls.object
    });
  } else {
    // Existing single piece logic
    // ...
  }
};
```

---

### 5.4 Enhanced Input Event Handler

**Target**: `src/three/InputEventHandler.ts`

```typescript
private selectionGroupManager: SelectionGroupManager;

/**
 * Enhanced click handling for multi-selection
 */
private handleClick = (event: MouseEvent): void => {
  if (this.isDragging()) return;
  
  const pieceId = this.selectionManager.raycastAndGetPieceId(event, this.canvas);
  const actions = this.getActions();
  const isMultiSelect = event.shiftKey || event.ctrlKey || event.metaKey;
  
  if (pieceId) {
    if (isMultiSelect) {
      // Toggle selection
      actions.toggleSelection(pieceId);
    } else {
      // Single selection
      actions.setSelection([pieceId]);
    }
  } else if (!isMultiSelect) {
    // Clear selection on background click (unless multi-selecting)
    actions.clearSelection();
  }
};

/**
 * Handle selection changes for transform controls
 */
public updateSelectionFromStore(): void {
  const selectedIds = Array.from(this.getSelection());
  
  // Update visual selection
  this.selectionManager.updateVisualSelection(selectedIds);
  
  // Handle transform controls
  if (selectedIds.length === 0) {
    // No selection
    this.transformControls.detach();
    this.selectionGroupManager.cleanup();
  } else if (selectedIds.length === 1) {
    // Single selection
    this.selectionGroupManager.cleanup();
    this.transformControls.attachToSelectedPiece(selectedIds[0]);
  } else {
    // Multi-selection
    const pieces = selectedIds.map(id => ({
      id,
      object: this.sceneManager.getPieceById(id)!.object
    }));
    
    // Create selection group
    const group = this.selectionGroupManager.createSelectionGroup(pieces);
    this.selectionGroupManager.attachPieces(pieces);
    
    // Attach controls to group
    this.transformControls.attachToSelectionGroup(group);
  }
}
```

---

### 5.5 Integration with Existing Systems

#### A. Scene Reconciliation Compatibility

Update `reconcileScene.ts` to handle selection groups:

```typescript
// Skip selection groups during reconciliation
const targets = this.modelGroup.children.filter(
  child => child.userData.type === 'piece'
);
```

#### B. Coordinate Conversion for Groups

Enhance `CoordinateConversion.ts`:

```typescript
export function extractLDrawTransformsFromGroup(
  pieces: Array<{ id: string; object: THREE.Object3D }>
): TransformUpdate[] {
  return pieces.map(({ id, object }) => ({
    id,
    ...extractLDrawTransform(object)
  }));
}
```

---

### 5.6 Testing Strategy

#### Unit Tests: `SelectionGroupManager.test.ts`

```typescript
describe('SelectionGroupManager', () => {
  it('should create group at correct centroid', () => {
    // Test centroid calculation
  });
  
  it('should preserve world transforms during attach', () => {
    // Test attach preserves position/rotation
  });
  
  it('should restore transforms during detach', () => {
    // Test detach preserves accumulated transforms
  });
  
  it('should batch update store on completion', () => {
    // Test store receives all updates
  });
});
```

#### Integration Tests: `MultiSelectIntegration.test.ts`

```typescript
describe('Multi-Select Integration', () => {
  it('should handle Shift+Click multi-selection', () => {
    // Test selection accumulation
  });
  
  it('should create selection group for 2+ pieces', () => {
    // Test group creation
  });
  
  it('should move group without piece separation', () => {
    // Test group cohesion
  });
  
  it('should update all pieces on group transform end', () => {
    // Test batch updates
  });
});
```

---

### 5.7 Performance Optimizations

1. **Batch Store Updates**: Single action for all pieces
2. **Efficient Centroid**: Cache bounding boxes
3. **Minimal Re-renders**: Use selectors for specific state
4. **Group Reuse**: Pool selection groups if needed

---

### 5.8 Visual Enhancements

```typescript
// Different materials for selection states
const materials = {
  primary: new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x004400,
    emissiveIntensity: 0.3
  }),
  secondary: new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x004444,
    emissiveIntensity: 0.2
  }),
  hover: new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0x444400,
    emissiveIntensity: 0.1
  })
};
```

---

## 📋 Implementation Checklist

### Phase 5.1: Multi-Selection Foundation
- [ ] Enhance store with `toggleSelection` action
- [ ] Update SelectionManager visual indicators
- [ ] Implement multi-selection click handling
- [ ] Add keyboard shortcuts (Ctrl+A for select all)

### Phase 5.2: Selection Group System
- [ ] Create `SelectionGroupManager` class
- [ ] Implement centroid calculation
- [ ] Add attach/detach with transform preservation
- [ ] Integrate with scene hierarchy

### Phase 5.3: Transform Integration
- [ ] Update TransformControlsManager for groups
- [ ] Handle group transform events
- [ ] Implement batch transform updates
- [ ] Test transform accuracy

### Phase 5.4: User Experience
- [ ] Visual feedback for multi-selection
- [ ] Smooth group transformations
- [ ] Clear selection indicators
- [ ] Responsive interactions

### Phase 5.5: Testing & Polish
- [ ] Unit tests for all new components
- [ ] Integration tests for workflows
- [ ] Performance profiling
- [ ] Edge case handling

---

## 🎯 Success Criteria

1. **Multi-Selection**: Shift/Ctrl click works intuitively
2. **Group Transform**: Multiple pieces move as one unit
3. **No Jumps**: Smooth transitions during attach/detach
4. **Performance**: <16ms for all operations
5. **Consistency**: Store, 3D, and editor remain synchronized
6. **Code Quality**: KISS principle maintained throughout

---

## ⚠️ Critical Considerations

### Leverage Existing Infrastructure
- Use Phase 1 store actions for all state changes
- Rely on Phase 2 geometry centering for clean transforms
- Let Phase 3 reconciliation handle scene updates
- Build on Phase 4 selection and input systems

### Avoid Common Pitfalls
- Don't create permanent groups (temporary only)
- Don't bypass the store for transform updates
- Don't forget to cleanup selection groups
- Don't break single-selection workflows

### Memory Management
- Dispose of temporary groups after use
- Clear material references properly
- Remove event listeners on cleanup
- Monitor for memory leaks in dev tools

---

This Phase 5 plan completes the refactoring journey by adding sophisticated multi-selection capabilities while maintaining the architectural simplicity established in previous phases. The implementation follows KISS principles by reusing existing systems and adding minimal new complexity.