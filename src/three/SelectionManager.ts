import * as THREE from 'three';
import { useModelStore } from '../state/useModelStore';
import { SelectionGroupManager } from './SelectionGroupManager';

export enum SelectionEvents {
  SELECTION_CHANGED = 'selection_changed',
  HOVER_CHANGED = 'hover_changed'
}

// Updated event listener type to support multi-select
type SelectionEventListener = (data: {
  pieceIds: string[];
  objects: THREE.Object3D[];
  origin?: string | null;
}) => void;

/**
 * Manages the selection state of pieces in the scene with enhanced pivot group detection
 */
export class SelectionManager extends THREE.EventDispatcher {
  private selectedObjects: Set<THREE.Object3D> = new Set();
  private origin: 'editor' | 'viewer' = 'viewer';
  private modelGroup: THREE.Group;
  private selectionGroup: THREE.Group;
  private selectionGroupManager: SelectionGroupManager | null = null;
  private highlightMaterial: THREE.MeshStandardMaterial;
  private originalMaterials: Map<THREE.Object3D, Map<THREE.Object3D, THREE.Material | THREE.Material[]>> = new Map();

  private raycaster: THREE.Raycaster;
  private camera: THREE.Camera;

  private eventListeners: Map<SelectionEvents, SelectionEventListener[]> = new Map();

  constructor(modelGroup: THREE.Group, selectionGroup: THREE.Group, camera: THREE.Camera) {
    super();
    this.modelGroup = modelGroup;
    this.selectionGroup = selectionGroup;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();

    // Create highlight material (green for selection)
    this.highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x004400,
      transparent: true,
      opacity: 0.8,
      roughness: 0.3,
      metalness: 0.8
    });
  }

  /**
   * Set the SelectionGroupManager reference for enhanced object finding
   */
  public setSelectionGroupManager(selectionGroupManager: SelectionGroupManager): void {
    this.selectionGroupManager = selectionGroupManager;
  }

  /**
   * Enhanced raycasting with Pivot Group traversal
   * Finds the piece ID from a raycaster intersection by traversing up to find the Pivot Group
   */
  private findPieceFromIntersection(intersect: THREE.Intersection): string | null {
    let object: THREE.Object3D | null = intersect.object;

    // Traverse up the hierarchy to find the Pivot Group (PieceContainer)
    while (object) {
      if (object.userData?.type === 'piece' && object.userData?.pieceId) {
        return object.userData.pieceId;
      }
      object = object.parent;
    }

    return null;
  }

  /**
   * Handle mouse click with enhanced Pivot Group detection
   */
  public handleClick(event: MouseEvent, canvas: HTMLElement): void {
    const pieceId = this.raycastAndGetPieceId(event, canvas);

    if (pieceId) {
      // Dispatch to model store
      const actions = useModelStore.getState().actions;
      actions.setSelection([pieceId]);
    } else {
      // Clear selection on background click
      const actions = useModelStore.getState().actions;
      actions.setSelection([]);
    }
  }

  /**
   * Enhanced raycasting method for precise piece selection
   */
  public raycastAndGetPieceId(event: MouseEvent, canvas: HTMLElement): string | null {
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);

    // Only raycast against piece containers for better performance
    const targets = this.getPieceContainers();
    const intersects = this.raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      return this.findPieceFromIntersection(intersects[0]);
    }

    return null;
  }

  /**
   * Get all piece containers from the model group
   */
  private getPieceContainers(): THREE.Object3D[] {
    const containers: THREE.Object3D[] = [];
    this.modelGroup.traverse((child) => {
      if (child.userData?.type === 'piece') {
        containers.push(child);
      }
    });
    return containers;
  }

  /**
   * Update visual selection based on store state
   */
  public updateVisualSelection(selectedIds: string[]): void {
    console.log(`Updating visual selection: [${selectedIds.join(', ')}]`);

    // Clear current visual selection
    this.clearVisualSelection();

    // Apply visual selection to new IDs
    selectedIds.forEach(pieceId => {
      const object = this.findObjectByPieceId(pieceId);
      if (object) {
        this.selectedObjects.add(object);
        console.log(`Applying selection highlighting to: ${pieceId}`);
        this.highlightObject(object);
      } else {
        console.warn(`Could not find object for piece ID: ${pieceId}`);
      }
    });
  }

  /**
   * Find Three.js object by piece ID
   * Search both modelGroup and active selection group
   */
  private findObjectByPieceId(pieceId: string): THREE.Object3D | null {
    // Try modelGroup first (normal location)
    let foundObject = this.searchInGroup(this.modelGroup, pieceId);

    // If not found, try selection group (selected pieces location)
    if (!foundObject && this.selectionGroupManager?.isGroupActive()) {
      const activeSelectionGroup = this.selectionGroupManager.getSelectionGroup();
      if (activeSelectionGroup) {
        foundObject = this.searchInGroup(activeSelectionGroup, pieceId);
      }
    }

    return foundObject;
  }

  /**
   * Helper method to search for a piece in a given group
   */
  private searchInGroup(group: THREE.Object3D, pieceId: string): THREE.Object3D | null {
    let foundObject: THREE.Object3D | null = null;

    group.traverse((child) => {
      if (child.userData?.type === 'piece' && child.userData?.pieceId === pieceId) {
        foundObject = child;
      }
    });

    return foundObject;
  }

  /**
   * Clear visual selection without affecting store
   */
  private clearVisualSelection(): void {
    this.selectedObjects.forEach(object => {
      this.restoreOriginalMaterial(object);
    });
    this.selectedObjects.clear();
  }

  // Origin tracking for preventing circular updates
  public setOrigin(origin: 'viewer' | 'editor'): void {
    this.origin = origin;
  }

  // Handles selection logic
  public select(object: THREE.Object3D, additive: boolean = false): void {
    if (!additive) {
      if (this.selectedObjects.size === 1 && this.selectedObjects.has(object)) return;
      this.clear(false); // Clear without dispatching yet
    }

    if (this.selectedObjects.has(object)) return;

    this.selectedObjects.add(object);
    this.highlightObject(object);
    this.updateGroupAndDispatch();
  }

  // Handles toggling (for Shift+Click)
  public toggle(object: THREE.Object3D): void {
    if (this.selectedObjects.has(object)) {
      this.selectedObjects.delete(object);
      this.restoreOriginalMaterial(object);
    } else {
      this.selectedObjects.add(object);
      this.highlightObject(object);
    }
    this.updateGroupAndDispatch();
  }

  // Clear selection
  public clear(dispatch: boolean = true): void {
    this.selectedObjects.forEach(object => {
      this.restoreOriginalMaterial(object);
    });
    this.selectedObjects.clear();

    if (dispatch) this.updateGroupAndDispatch();
  }

  // Gets the selected objects
  public getSelectedObjects(): THREE.Object3D[] {
    return Array.from(this.selectedObjects);
  }

  // Gets selected piece IDs
  public getSelectedPieceIds(): string[] {
    return Array.from(this.selectedObjects)
      .map(obj => obj.userData?.pieceId)
      .filter(id => id !== undefined);
  }

  // Check if object is selected
  public isSelected(object: THREE.Object3D): boolean {
    return this.selectedObjects.has(object);
  }

  // Update selection highlight
  private highlightObject(object: THREE.Object3D): void {
    // Store original materials if not already stored
    if (!this.originalMaterials.has(object)) {
      const originalMaterials: Map<THREE.Object3D, THREE.Material | THREE.Material[]> = new Map();

      // Traverse the object to find all meshes with materials
      object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          if (child.material) {
            originalMaterials.set(child, child.material);
          }
        }
      });

      // Store the map of original materials for this object
      if (originalMaterials.size > 0) {
        this.originalMaterials.set(object, originalMaterials);
      }
    }

    // Apply green selection highlighting
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map(() => this.highlightMaterial);
          } else {
            child.material = this.highlightMaterial;
          }
        }
      }
    });
  }

  // Restore original material
  private restoreOriginalMaterial(object: THREE.Object3D): void {
    const storedMaterials = this.originalMaterials.get(object);
    if (!storedMaterials) return;

    // Restore original materials
    for (const [child, material] of storedMaterials) {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        (child as THREE.Mesh | THREE.LineSegments).material = material;
      }
    }

    // Clean up stored materials
    this.originalMaterials.delete(object);
  }

  // Update selection group and dispatch events
  private updateGroupAndDispatch(): void {
    // Clear selection group
    while (this.selectionGroup.children.length > 0) {
      this.selectionGroup.remove(this.selectionGroup.children[0]);
    }

    // Move selected objects to selection group
    const selectedArray = Array.from(this.selectedObjects);
    selectedArray.forEach(object => {
      this.selectionGroup.attach(object);
    });

    // Dispatch selection changed event
    const pieceIds = selectedArray
      .map(obj => obj.userData?.pieceId)
      .filter(id => id !== undefined);

    this.dispatchSelectionChanged(pieceIds, selectedArray);
  }

  // Dispatch selection changed events
  private dispatchSelectionChanged(pieceIds: string[], objects: THREE.Object3D[]): void {
    const eventData = { pieceIds, objects, origin: this.origin };

    // Multi-select event listeners
    const listeners = this.eventListeners.get(SelectionEvents.SELECTION_CHANGED) || [];
    listeners.forEach(listener => listener(eventData));

    // Dispatch Three.js event
    this.dispatchEvent({
      type: SelectionEvents.SELECTION_CHANGED,
      ...eventData
    });
  }

  // Set hovered piece (for highlighting)
  public setHoverPiece(pieceId: string | null, object: THREE.Object3D | null): void {
    const eventData = { pieceIds: pieceId ? [pieceId] : [], objects: object ? [object] : [], origin: this.origin };

    // Dispatch hover changed event
    const listeners = this.eventListeners.get(SelectionEvents.HOVER_CHANGED) || [];
    listeners.forEach(listener => listener(eventData));

    this.dispatchEvent({
      type: SelectionEvents.HOVER_CHANGED,
      ...eventData
    });
  }

  // Event listener management
  public addEventListener(type: SelectionEvents, listener: SelectionEventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(listener);
  }

  public removeEventListener(type: SelectionEvents, listener: SelectionEventListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // Cleanup
  public dispose(): void {
    this.clear();
    this.eventListeners.clear();
    this.highlightMaterial.dispose();
    this.originalMaterials.clear();
  }
}
