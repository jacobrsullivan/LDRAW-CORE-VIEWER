
import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { TransformControlsManager, TransformMode, TransformControlsEvents } from './TransformControlsManager';
import { SelectionManager } from './SelectionManager';
import { SelectionGroupManager } from './SelectionGroupManager';
import { useModelStore } from '../state/useModelStore';
import { Axis } from './TransformControlsManager';

/**
 * Unified Input Event Handler
 * Centralizes mouse, keyboard, and transform event coordination
 */
export class InputEventHandler {
  private sceneManager: SceneManager;
  private transformControls: TransformControlsManager;
  private selectionManager: SelectionManager;
  private selectionGroupManager: SelectionGroupManager;
  private canvas: HTMLElement;

  // Store integration
  private getActions = () => useModelStore.getState().actions;
  private getSelection = () => useModelStore.getState().selectedIds;
  
  // Transform cooldown management
  private transformCooldownActive = false;
  private transformCooldownTimer: number | null = null;
  private readonly TRANSFORM_COOLDOWN_MS = 100;

  // Mouse position tracking
  private raycaster = new THREE.Raycaster();
  private lastMouseUpdateTime = 0;
  private readonly MOUSE_UPDATE_THROTTLE_MS = 16; // ~60fps

  constructor(
    canvas: HTMLElement | null,
    sceneManager: SceneManager,
    transformControls: TransformControlsManager,
    selectionManager: SelectionManager,
    selectionGroupManager: SelectionGroupManager
  ) {
    if (!canvas) {
      throw new Error('Canvas element is required for InputEventHandler');
    }
    this.canvas = canvas;
    this.sceneManager = sceneManager;
    this.transformControls = transformControls;
    this.selectionManager = selectionManager;
    this.selectionGroupManager = selectionGroupManager;
    
    // KISS Fix: Give SelectionManager access to SelectionGroupManager for object finding
    this.selectionManager.setSelectionGroupManager(selectionGroupManager);
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Safety check for canvas element
    if (!this.canvas) {
      throw new Error('Canvas element is null - cannot set up event listeners');
    }
    
    if (typeof this.canvas.addEventListener !== 'function') {
      throw new Error(`Canvas element does not support addEventListener - got: ${typeof this.canvas} ${this.canvas.constructor?.name}`);
    }
    
    // Mouse events
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('contextmenu', this.handleRightClick);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    
    // Keyboard shortcuts
    window.addEventListener('keydown', this.handleKeyDown);
    
    // Transform events
    this.transformControls.addEventListener('dragging-changed', this.handleDraggingChanged);
    this.transformControls.addEventListener('objectChange', this.handleObjectChange);
    
    // Group transform events for multi-selection handling
    this.transformControls.addEventListener(TransformControlsEvents.GROUP_TRANSFORM_ENDED, this.handleGroupTransformEnd);
  }

  /**
   * Simplified click handling with multi-selection support
   */
  private handleClick = (event: MouseEvent): void => {
    // Prevent event during active transformation or cooldown
    if (this.isDragging() || this.isInTransformCooldown()) {
      console.log('🚫 Ignoring click during transform or cooldown');
      return;
    }

    const pieceId = this.selectionManager.raycastAndGetPieceId(event, this.canvas);
    const isMultiSelect = event.shiftKey || event.ctrlKey || event.metaKey;
    
    if (pieceId) {
      this.handleClickSelection(pieceId, isMultiSelect);
      return;
    }

    // No piece was clicked - clear selection if not multi-selecting
    if (!isMultiSelect) {
      this.getActions().clearSelection();
    }
  };



  /**
   * Handle piece selection for both single and multi-select modes
   */
  private handleClickSelection(pieceId: string, isMultiSelect: boolean): void {
    const actions = this.getActions();
    
    if (isMultiSelect) {
      // Multi-select mode: toggle selection
      actions.toggleSelection(pieceId);
    } else {
      // Single select mode: select only this piece
      actions.setSelection([pieceId]);
    }
  }

  /**
   * Right-click context menu (future enhancement)
   */
  private handleRightClick = (event: MouseEvent): void => {
    event.preventDefault();
    // TODO: Implement context menu for enhanced user experience
  };

  /**
   * Handle mouse movement for M_POS tracking (Option 1: pieces only)
   */
  private handleMouseMove = (event: MouseEvent): void => {
    // Throttle updates to avoid performance issues
    const now = Date.now();
    if (now - this.lastMouseUpdateTime < this.MOUSE_UPDATE_THROTTLE_MS) {
      return;
    }
    this.lastMouseUpdateTime = now;

    // Skip during active transformations
    if (this.isDragging()) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.sceneManager.camera);
    
    // Use existing method to get piece containers for consistency
    const targets = this.getPieceContainers();
    const intersects = this.raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      // Mouse is over a piece - get the 3D intersection point
      const point = intersects[0].point;
      this.getActions().setMousePosition({
        x: point.x,
        y: point.y,
        z: point.z
      });
    } else {
      // Mouse is not over any piece - clear M_POS
      this.getActions().setMousePosition(null);
    }
  };

  /**
   * Get all piece containers from the scene for raycasting
   */
  private getPieceContainers(): THREE.Object3D[] {
    const containers: THREE.Object3D[] = [];
    
    // Get selectable objects from model group
    const modelObjects = this.sceneManager.getSelectableObjects();
    modelObjects.forEach(obj => {
      if (obj.userData?.type === 'piece') {
        containers.push(obj);
      }
    });

    // Also check selection group for pieces if active
    if (this.selectionGroupManager.isGroupActive()) {
      const selectionGroup = this.selectionGroupManager.getSelectionGroup();
      if (selectionGroup) {
        selectionGroup.traverse((child) => {
          if (child.userData?.type === 'piece') {
            containers.push(child);
          }
        });
      }
    }

    return containers;
  };

  /**
   * Keyboard shortcuts for transform modes and selection
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    // Only handle shortcuts when not typing in inputs
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Handle Ctrl+A for select all
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'g':
        // Translate mode
        this.transformControls.setMode('translate');
        console.log('🔧 Transform mode: Translate');
        break;
      case 'r':
        // Rotate mode
        this.transformControls.setMode('rotate');
        console.log('🔧 Transform mode: Rotate');
        break;

      case 'escape': {
        // Clear selection
        const actions = this.getActions();
        actions.clearSelection();
        console.log('🔧 Selection cleared');
        break;
      }
      case 'delete':
      case 'backspace':
        // TODO: Delete selected pieces (future enhancement)
        console.log('🔧 Delete selected pieces (not implemented)');
        break;
    }
  };

  /**
   * Select all pieces in the current model
   */
  private selectAll(): void {
    const model = useModelStore.getState().model;
    const allPieceIds = model.pieces.map(piece => piece.id);
    
    if (allPieceIds.length > 0) {
      const actions = this.getActions();
      actions.setSelection(allPieceIds);
      console.log(`🔧 Selected all ${allPieceIds.length} pieces`);
    }
  };

  /**
   * Handle transform dragging state changes
   */
  private handleDraggingChanged = (event: { value: boolean }): void => {
    if (!event.value) {
      // Transform ended - start cooldown
      console.log('🔧 Transform ended');
      this.startTransformCooldown();
    }
  };

  /**
   * Handle object change events during transformation
   */
  private handleObjectChange = (): void => {
    // Real-time feedback during transformation (optional)
    // The actual store update happens in handleDraggingChanged
  };

  /**
   * Handle group transform completion (unified for single and multi-piece)
   */
  private handleGroupTransformEnd = (): void => {
    console.log('🔧 Group transform ended, committing changes');
    
    // Start cooldown
    this.startTransformCooldown();
    
    // Commit transformation (this cleans up the group)
    this.selectionGroupManager.commitTransformation();
    
    // Detach transform controls from the group that will be cleaned up
    this.transformControls.detach();
    console.log('🔧 Transform controls detached after group cleanup');
    
    // Re-attach to new selection (simple and direct)
    setTimeout(() => {
      this.updateSelectionFromStore();
    }, 50); // Minimal delay for scene stabilization
  };



  /**
   * Unified: Update visual selection based on store changes
   * Treats single pieces as groups of 1 - no dual code paths
   */
  public updateSelectionFromStore(): void {
    const selectedIds = Array.from(this.getSelection());
    
    // Update visual selection
    this.selectionManager.updateVisualSelection(selectedIds);
    
    // Handle transform controls - unified approach for any selection size
    if (selectedIds.length === 0) {
      // No selection - properly detach pieces before cleanup
      this.transformControls.detach();
      if (this.selectionGroupManager.isGroupActive()) {
        // Commit transformation to restore pieces to original parents
        this.selectionGroupManager.commitTransformation();
      } else {
        this.selectionGroupManager.cleanup();
      }
    } else {
      // ANY selection (1 or more pieces) - always create group
      const pieces = selectedIds.map(id => ({
        id,
        object: this.sceneManager.getPieceById(id)!.object
      })).filter(piece => piece.object); // Filter out any missing pieces
      
      if (pieces.length > 0) {
        // Always create selection group (optimized internally for single pieces)
        const group = this.selectionGroupManager.createSelectionGroup(pieces);
        this.selectionGroupManager.attachPieces(pieces);
        
        // Always attach controls to group
        this.transformControls.attachToSelectionGroup(group);
        console.log(`🔧 Transform controls attached to selection group (${pieces.length} piece${pieces.length !== 1 ? 's' : ''})`);
      }
    }
  }

  /**
   * Get current transform mode
   */
  public getTransformMode(): TransformMode {
    return this.transformControls.getMode();
  }

  /**
   * Get the selection group manager
   */
  public getSelectionGroupManager(): SelectionGroupManager {
    return this.selectionGroupManager;
  }

  /**
   * Apply 90-degree rotation for current selection (unified for any selection size)
   * @param axis The axis to rotate around
   */
  public rotate90DegreesForSelection(axis: Axis): void {
    const selectedIds = Array.from(this.getSelection());

    if (selectedIds.length === 0) {
      console.warn('No pieces selected for rotation');
      return;
    }

    // Unified approach: controls are always attached to a selection group
    this.transformControls.rotateSelection90(axis);
  }

  /**
   * Apply scale preset for current selection (unified for any selection size)
   * @param scaleFactor The scale factor to apply, or 'reset' to return to scale 1,1,1
   */
  public applyScalePresetForSelection(scaleFactor: number | 'reset'): void {
    const selectedIds = Array.from(this.getSelection());

    if (selectedIds.length === 0) {
      console.warn('No pieces selected for scaling');
      return;
    }

    // Unified approach: controls are always attached to a selection group
    this.transformControls.applyScalePreset(scaleFactor);
  }

  /**
   * Set transform mode programmatically
   */
  public setTransformMode(mode: TransformMode): void {
    this.transformControls.setMode(mode);
  }

  /**
   * Check if currently dragging
   */
  public isDragging(): boolean {
    return this.transformControls.dragging;
  }

  /**
   * Check if in transform cooldown period
   */
  public isInTransformCooldown(): boolean {
    return this.transformCooldownActive;
  }

  /**
   * Start transform cooldown period
   */
  private startTransformCooldown(): void {
    this.transformCooldownActive = true;
    
    // Clear existing timer if any
    if (this.transformCooldownTimer) {
      clearTimeout(this.transformCooldownTimer);
    }
    
    // Set new timer
    this.transformCooldownTimer = window.setTimeout(() => {
      this.transformCooldownActive = false;
      this.transformCooldownTimer = null;
    }, this.TRANSFORM_COOLDOWN_MS);
  }

  /**
   * Reset transform cooldown manually
   */
  public resetTransformCooldown(): void {
    this.transformCooldownActive = false;
    if (this.transformCooldownTimer) {
      clearTimeout(this.transformCooldownTimer);
      this.transformCooldownTimer = null;
    }
  }

  /**
   * Cleanup event listeners and pending operations
   */
  public dispose(): void {
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('contextmenu', this.handleRightClick);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('keydown', this.handleKeyDown);
    
    this.transformControls.removeEventListener('dragging-changed', this.handleDraggingChanged);
    this.transformControls.removeEventListener('objectChange', this.handleObjectChange);
    this.transformControls.removeEventListener(TransformControlsEvents.GROUP_TRANSFORM_ENDED, this.handleGroupTransformEnd);
    
    // Clean up cooldown timer
    if (this.transformCooldownTimer) {
      clearTimeout(this.transformCooldownTimer);
      this.transformCooldownTimer = null;
    }

    // Clear mouse position when disposing
    this.getActions().setMousePosition(null);
  }
} 