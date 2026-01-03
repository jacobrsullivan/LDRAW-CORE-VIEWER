import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Transform control modes
 */
export type TransformMode = 'translate' | 'rotate' | 'scale' | 'annotate';

/**
 * Axis type for 3D coordinate operations (rotations, transformations)
 */
export type Axis = 'x' | 'y' | 'z';

/**
 * @deprecated Use Axis instead - kept for backward compatibility
 */
export type RotationAxis = Axis;

/**
 * Event types for TransformControlsManager
 */
export const TransformControlsEvents = {
  TRANSFORM_CHANGED: 'transform_changed',
  TRANSFORM_STARTED: 'transform_started',
  TRANSFORM_ENDED: 'transform_ended',
  GROUP_TRANSFORM_ENDED: 'group_transform_ended',
  MODE_CHANGED: 'mode_changed',
} as const;

/**
 * Event data for transform controls events
 */
export interface TransformControlsEventMap {
  [TransformControlsEvents.TRANSFORM_CHANGED]: { object: THREE.Object3D | null };
  [TransformControlsEvents.TRANSFORM_STARTED]: { object: THREE.Object3D | null };
  [TransformControlsEvents.TRANSFORM_ENDED]: { object?: THREE.Object3D | null, rotationAxis?: RotationAxis };
  [TransformControlsEvents.GROUP_TRANSFORM_ENDED]: { object: THREE.Object3D | null, pieceCount: number };
  [TransformControlsEvents.MODE_CHANGED]: { mode: TransformMode };
}

/**
 * Manages Three.js TransformControls and provides higher-level API
 * for handling object transformations in the scene with direct pivot group attachment
 */
export class TransformControlsManager extends THREE.EventDispatcher {
  private controls: TransformControls;
  private scene: THREE.Scene;
  private orbitControls: OrbitControls;
  private mode: TransformMode = 'translate';
  
  /**
   * Creates a new TransformControlsManager
   * 
   * @param camera The camera to use for the transform controls
   * @param renderer The renderer DOM element for the transform controls
   * @param scene The scene to add the transform controls to
   * @param orbitControls The orbit controls to disable during transformations
   */
  constructor(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    orbitControls: OrbitControls
  ) {
    super();
    
    this.scene = scene;
    this.orbitControls = orbitControls;
    
    // Create transform controls
    this.controls = new TransformControls(camera, renderer.domElement);
    this.controls.setSize(0.75); // Make it slightly smaller than default
    this.controls.setSpace('world');
    
    // Use our setMode method which handles annotate mode properly
    this.setMode(this.mode);
    
    // Add to scene
    this.scene.add(this.controls.getHelper());
    
    // Add event listeners
    this.controls.addEventListener('dragging-changed', this.handleDraggingChanged);
    this.controls.addEventListener('objectChange', this.handleObjectChange);
    this.controls.addEventListener('mouseUp', this.handleTransformEnd);
  }
  
  /**
   * Sets the transform mode (translate, rotate, scale, annotate)
   * @param mode The transform mode to set
   */
  setMode(mode: TransformMode): void {
    console.log(`TransformControlsManager: Setting mode to ${mode}`);
    this.mode = mode;
    
    // Special handling for annotate mode - no transform controls should be shown
    if (mode === 'annotate') {
      this.controls.detach();
    } else {
      // For transform modes, set the Three.js controls mode
      this.controls.setMode(mode as 'translate' | 'rotate' | 'scale');
      
      // Reattach current object if any to ensure controls update
      if (this.controls.object) {
        const obj = this.controls.object;
        this.controls.detach();
        this.controls.attach(obj);
      }
    }
    
    // Dispatch event for mode change
    this.dispatchEvent({ 
      type: TransformControlsEvents.MODE_CHANGED, 
      mode: this.mode 
    });
  }
  
  /**
   * Gets the current transform mode
   * @returns The current transform mode
   */
  getMode(): TransformMode {
    return this.mode;
  }

  /**
   * Check if currently dragging
   */
  get dragging(): boolean {
    return this.controls.dragging;
  }
  
  /**
   * Attach transform controls to a Pivot Group (no offset calculations needed)
   * @param object The Pivot Group object to attach to
   */
  attach(object: THREE.Object3D): void {
    if (!object) return;
    
    console.log('TransformControlsManager: Attaching to Pivot Group', object);
    
    // Store current object to avoid unnecessary reattach
    if (this.controls.object === object) {
      console.log('Object already attached to transform controls, skipping');
      return;
    }
    
    // Store current visibility state
    const wasVisible = object.visible;
    
    // Detach from any existing object first to clear internal state
    this.controls.detach();
    
    // Direct attachment to Pivot Group - no offset calculations needed!
    // Geometry centering ensures Pivot Group origin = visual center
    this.controls.setSpace('world');
    this.controls.attach(object);
    
    // Ensure visibility is maintained
    if (wasVisible && !object.visible) {
      console.log('Restoring object visibility after control attachment');
      object.visible = true;
    }
    
    // Controls are automatically visible when attached
    
    // Transform controls update automatically when attached
  }



  /**
   * Attach to selection group (unified for single and multi-piece selections)
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
   * Programmatically rotates the attached object by 90 degrees and triggers the standard cleanup.
   * @param axis The axis ('x', 'y', or 'z') to rotate around.
   */
  public rotateSelection90(axis: 'x' | 'y' | 'z'): void {
    if (!this.controls.object) {
      console.warn('Attempted to rotate with no object attached.');
      return;
    }

    console.log(`Programmatically rotating group 90° around ${axis.toUpperCase()} axis.`);

    // Y-Axis Correction: LDraw uses -Y up, so Y+90° requires -90° rotation in Three.js
    const rotationAngle = axis === 'y' ? -Math.PI / 2 : Math.PI / 2;
    const rotationAxis = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0
    );

    // Apply the rotation to the attached object (the selection group)
    this.controls.object.rotateOnWorldAxis(rotationAxis, rotationAngle);

    // IMPORTANT: Manually trigger the same events that a drag-and-drop action would.
    // This hooks into the existing, correct cleanup and data-saving logic.
    this.controls.dispatchEvent({ type: 'objectChange' });
    this.controls.dispatchEvent({ type: 'mouseUp' }); // This triggers handleTransformEnd
  }

  /**
   * Programmatically applies a scale preset to the attached object and triggers the standard cleanup.
   * @param scaleFactor The scale factor to apply, or 'reset' to return to scale 1,1,1
   */
  public applyScalePreset(scaleFactor: number | 'reset'): void {
    if (!this.controls.object) {
      console.warn('Attempted to scale with no object attached.');
      return;
    }

    console.log(`Programmatically applying scale: ${scaleFactor}`);

    if (scaleFactor === 'reset') {
      console.log('Resetting scale to 1,1,1');
      this.controls.object.scale.set(1, 1, 1);
    } else {
      console.log(`Applying scale factor: ${scaleFactor}`);
      this.controls.object.scale.multiplyScalar(scaleFactor);
    }

    // IMPORTANT: Manually trigger the same events that a drag-and-drop action would.
    // This hooks into the existing, correct cleanup and data-saving logic.
    this.controls.dispatchEvent({ type: 'objectChange' });
    this.controls.dispatchEvent({ type: 'mouseUp' }); // This triggers handleTransformEnd
  }
  
  /**
   * Detaches transform controls from the current object
   */
  detach(): void {
    this.controls.detach();
  }
  
  /**
   * Disposes of the transform controls and cleans up event listeners
   */
  dispose(): void {
    this.controls.removeEventListener('dragging-changed', this.handleDraggingChanged);
    this.controls.removeEventListener('objectChange', this.handleObjectChange);
    this.controls.removeEventListener('mouseUp', this.handleTransformEnd);
    
    this.scene.remove(this.controls.getHelper());
    this.controls.dispose();
  }
  
  /**
   * Handles dragging state changes for the transform controls
   */
  private handleDraggingChanged = (event: { value: boolean }): void => {
    // Disable orbit controls when transforming to prevent conflicts
    this.orbitControls.enabled = !event.value;
    
    // If dragging started, dispatch transform started event
    if (event.value) {
      this.dispatchEvent({ 
        type: TransformControlsEvents.TRANSFORM_STARTED,
        object: this.controls.object
      });
    }
  };
  
  /**
   * Handles object change events from transform controls
   */
  private handleObjectChange = (): void => {
    // Dispatch event when the transform changes
    this.dispatchEvent({ 
      type: TransformControlsEvents.TRANSFORM_CHANGED,
      object: this.controls.object
    });
  };
  
  /**
   * Handle transform completion with store integration
   */
  private handleTransformEnd = (): void => {
    if (!this.controls.object) return;

    // Unified: Always handle as group transform (single pieces are groups of 1)
    this.handleGroupTransformEnd();
  };



  /**
   * Handle transform completion (unified for single and multi-piece selections)
   */
  private handleGroupTransformEnd(): void {
    const pieceCount = this.controls.object?.userData.pieceCount || 0;
    console.log(`Transform completed for ${pieceCount} piece${pieceCount !== 1 ? 's' : ''}`);
    
    // Dispatch group transform event - SelectionGroupManager will handle the store updates
    this.dispatchEvent({ 
      type: TransformControlsEvents.GROUP_TRANSFORM_ENDED,
      object: this.controls.object,
      pieceCount: pieceCount
    });
    
    console.log('✅ Transform completed, event dispatched');
  };
  





} 