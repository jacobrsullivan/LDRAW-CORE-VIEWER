import * as THREE from 'three';
import { useModelStore, TransformUpdate } from '../state/useModelStore';
import { extractLDrawTransform, cleanTransformMatrix } from './LDrawTransforms';
import { SceneManager } from './SceneManager';

/**
 * SelectionGroupManager handles temporary groups for multi-piece transformations.
 * It creates temporary groups at the centroid of selected pieces, allows for
 * group transformations, and properly restores pieces to their original parents
 * while preserving world transforms.
 */
export class SelectionGroupManager {
  private selectionGroup: THREE.Group | null = null;
  private scene: THREE.Scene;
  private originalParents: Map<string, THREE.Object3D> = new Map();
  private groupActive: boolean = false;
  private lastIds: string[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Ensure we have a group containing exactly these ids
   */
  ensureGroupFor(ids: string[], sceneManager: SceneManager): THREE.Group {
    const same =
      this.selectionGroup &&
      ids.length === this.lastIds.length &&
      ids.every((id, i) => id === this.lastIds[i]);

    if (!same) {
      this.detachPieces(); // put old children back
      
      // Get pieces for the new ids
      const pieces = ids.map(id => ({
        id,
        object: sceneManager.getPieceById(id)?.object
      })).filter((piece): piece is { id: string; object: THREE.Object3D } => !!piece.object);
      
      if (pieces.length > 0) {
        this.createSelectionGroup(pieces);
        this.attachPieces(pieces);
        this.lastIds = [...ids];
      }
    }
    return this.selectionGroup!;
  }

  /**
   * Creates temporary group at centroid of selected pieces
   */
  createSelectionGroup(pieces: Array<{ id: string; object: THREE.Object3D }>): THREE.Group {
    // Clean up any existing group properly
    if (this.groupActive) {
      // If there's an active group, detach pieces first
      this.detachPieces();
    }
    this.cleanup();

    if (pieces.length === 0) {
      throw new Error('Cannot create selection group with no pieces');
    }

    // Calculate centroid
    const centroid = this.calculateCentroid(pieces.map(p => p.object));

    // Create group at centroid
    this.selectionGroup = new THREE.Group();
    this.selectionGroup.position.copy(centroid);
    this.selectionGroup.userData = { 
      type: 'selection-group',
      pieceCount: pieces.length 
    };
    this.scene.add(this.selectionGroup);
    this.groupActive = true;

    console.log(`Created selection group with ${pieces.length} pieces at centroid:`, centroid);
    return this.selectionGroup;
  }

  /**
   * Attach pieces to selection group preserving world transform
   */
  attachPieces(pieces: Array<{ id: string; object: THREE.Object3D }>): void {
    if (!this.selectionGroup) {
      throw new Error('No selection group created - call createSelectionGroup first');
    }

    pieces.forEach(({ id, object }) => {
      // Store original parent for restoration
      if (object.parent) {
        this.originalParents.set(id, object.parent);
      }

      // Ensure userData has pieceId for detachment
      if (!object.userData.pieceId) {
        object.userData.pieceId = id;
      }

      // Attach preserving world position using Three.js attach method
      // This automatically handles the world transform preservation
      this.selectionGroup!.attach(object);
    });

    console.log(`Attached ${pieces.length} pieces to selection group`);
  }

  /**
   * Detach pieces back to original parents preserving world transform
   */
  detachPieces(): TransformUpdate[] {
    if (!this.selectionGroup) {
      console.warn('No selection group to detach from');
      return [];
    }

    const updates: TransformUpdate[] = [];

    // Create array of children to avoid modification during iteration
    const children = [...this.selectionGroup.children];

    // Detach each piece back to original parent
    children.forEach((child) => {
      const pieceId = child.userData.pieceId;
      
      if (pieceId && this.originalParents.has(pieceId)) {
        const originalParent = this.originalParents.get(pieceId)!;
        
        // Attach back to original parent (preserves world transform)
        originalParent.attach(child);

        // Collect transform for store update
        try {
          const transform = extractLDrawTransform(child);
          
          // Matrix Cleaning: Clean rotation matrix to eliminate floating-point noise
          const cleanedMatrix = cleanTransformMatrix(transform.rotationMatrix);
          
          updates.push({
            id: pieceId,
            position: transform.position,
            rotationMatrix: cleanedMatrix
          });
        } catch (error) {
          console.error(`Failed to extract transform for piece ${pieceId}:`, error);
        }
      } else {
        console.warn(`Could not restore piece ${pieceId} - original parent not found`);
      }
    });

    console.log(`Detached ${updates.length} pieces and collected transform updates`);

    // Cleanup
    this.cleanup();

    return updates;
  }

  /**
   * Commit group transformation to store and cleanup
   */
  commitTransformation(): void {
    if (!this.groupActive) {
      return;
    }

    const updates = this.detachPieces();
    
    // Batch update store with all transform changes
    if (updates.length > 0) {
      const actions = useModelStore.getState().actions;
      actions.updatePieceTransforms(updates);
      console.log(`Committed ${updates.length} piece transforms to store`);
    }
  }

  /**
   * Calculate geometric centroid of objects
   */
  private calculateCentroid(objects: THREE.Object3D[]): THREE.Vector3 {
    if (objects.length === 0) {
      return new THREE.Vector3();
    }

    // Use bounding box approach for accurate centroid
    const box = new THREE.Box3();
    
    objects.forEach(obj => {
      const objBox = new THREE.Box3().setFromObject(obj);
      box.union(objBox);
    });

    const center = new THREE.Vector3();
    box.getCenter(center);
    
    return center;
  }

  /**
   * Get the current selection group (if any)
   */
  getSelectionGroup(): THREE.Group | null {
    return this.selectionGroup;
  }

  /**
   * Check if a group transformation is currently active
   */
  isGroupActive(): boolean {
    return this.groupActive && this.selectionGroup !== null;
  }

  /**
   * Get number of pieces in current group
   */
  getPieceCount(): number {
    return this.selectionGroup?.userData.pieceCount || 0;
  }

  /**
   * Cleanup temporary group and restore state
   */
  cleanup(): void {
    if (this.selectionGroup) {
      // Remove from scene
      this.scene.remove(this.selectionGroup);
      this.selectionGroup = null;
    }
    
    // Clear parent tracking
    this.originalParents.clear();
    this.groupActive = false;
    
    console.log('Selection group cleaned up');
  }

  /**
   * Emergency cleanup - detach all pieces before cleanup
   */
  emergencyCleanup(): void {
    if (this.groupActive) {
      console.warn('Emergency cleanup - detaching pieces before cleanup');
      this.commitTransformation();
    } else {
      this.cleanup();
    }
  }

  /**
   * Dispose of the manager and cleanup resources
   */
  dispose(): void {
    this.emergencyCleanup();
  }
}

export default SelectionGroupManager; 