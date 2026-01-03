import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PartGeometryLoader, PartGeometryLoaderOptions } from './PartGeometryLoader';
import { LDrawModel, LDrawPiece } from '../ldraw/LDrawDataModels';
import { PieceManager, PieceEvents } from './PieceManager';
import { SelectionManager, SelectionEvents } from './SelectionManager';
import { centerCameraOnGroup, setupLights, addGrid, addAxes } from './utils';

// Scene state events enum
export enum SceneEvents {
  MODEL_LOADED = 'model_loaded',
  PIECE_ADDED = 'piece_added',
  PIECE_REMOVED = 'piece_removed',
  PIECE_UPDATED = 'piece_updated',
  SCENE_RESET = 'scene_reset',
  SELECTION_CHANGED = 'selection_changed'
}

// Event data types
type SceneEventData = {
  [SceneEvents.MODEL_LOADED]: LDrawModel;
  [SceneEvents.PIECE_ADDED]: { piece: LDrawPiece; object: THREE.Object3D };
  [SceneEvents.PIECE_REMOVED]: { pieceId: string; object: THREE.Object3D };
  [SceneEvents.PIECE_UPDATED]: { pieceId: string; piece?: LDrawPiece; object: THREE.Object3D };
  [SceneEvents.SCENE_RESET]: null;
  // Updated for multi-select support
  [SceneEvents.SELECTION_CHANGED]: { pieceIds: string[]; objects: THREE.Object3D[]; origin?: string };
}

// Event listener type with proper typing
type SceneEventListener<T extends keyof SceneEventData> = (data: SceneEventData[T]) => void;

/**
 * Options for the scene manager
 */
export interface SceneManagerOptions {
  partLoaderOptions: PartGeometryLoaderOptions;
  backgroundColor?: number;
  gridEnabled?: boolean;
  axesEnabled?: boolean;
}

/**
 * Manages the Three.js scene, camera, renderer, and controls
 */
export class SceneManager {
  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animationId: number = 0;
  private partLoader: PartGeometryLoader;
  private modelGroup: THREE.Group | null = null;
  private selectionGroup: THREE.Group | null = null;
  private pieceManager: PieceManager | null = null;
  private selectionManager: SelectionManager;
  private eventListeners: Map<SceneEvents, Array<SceneEventListener<SceneEvents>>> = new Map();
  
  /**
   * Get the Three.js scene
   */
  public get scene(): THREE.Scene {
    return this._scene;
  }
  
  /**
   * Get the camera
   */
  public get camera(): THREE.PerspectiveCamera {
    return this._camera;
  }
  
  /**
   * Get the renderer
   */
  public get renderer(): THREE.WebGLRenderer {
    return this._renderer;
  }
  
  /**
   * Get the selection group for multi-select operations
   */
  public getSelectionGroup(): THREE.Group {
    if (!this.selectionGroup) {
      throw new Error('Selection group not initialized');
    }
    return this.selectionGroup;
  }
  
  /**
   * Get the selection manager for handling piece selection
   */
  public getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }
  
  /**
   * Get the piece manager for direct access to piece operations
   */
  public getPieceManager(): PieceManager | null {
    return this.pieceManager;
  }
  
  constructor(private container: HTMLElement, options: SceneManagerOptions) {
    // Setup renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setClearColor(options.backgroundColor || 0xf0f0f0);
    this._renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this._renderer.domElement);
    
    // Setup scene
    this._scene = new THREE.Scene();
    
    // Setup camera
    this._camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    this._camera.position.set(100, 100, 100);
    this._camera.lookAt(0, 0, 0);
    
    // Setup controls
    this.controls = new OrbitControls(this._camera, this._renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2;
    
    // Setup part geometry loader with a cleaned, normalized path
    // Ensure we use a path starting with / to access from server root
    const ldrawPath = options.partLoaderOptions.partsLibraryPath.startsWith('/') 
      ? options.partLoaderOptions.partsLibraryPath
      : `/${options.partLoaderOptions.partsLibraryPath.replace(/^\.?\/?/, '')}`;
    
    console.log(`Initializing PartGeometryLoader with path: ${ldrawPath}`);
    this.partLoader = new PartGeometryLoader({
      ...options.partLoaderOptions,
      partsLibraryPath: ldrawPath
    });
    
    // Add lights
    setupLights(this._scene);
    
    // Add optional helpers
    if (options.gridEnabled) {
      addGrid(this._scene);
    }
    
    if (options.axesEnabled) {
      addAxes(this._scene);
    }
    
    // Initialize the model group
    this.modelGroup = new THREE.Group();
    this.modelGroup.name = 'LDraw Model';
    this._scene.add(this.modelGroup);
    
    // Initialize the selection group (Phase 2: Multi-select support)
    this.selectionGroup = new THREE.Group();
    this.selectionGroup.name = 'SelectionGroup';
    this.selectionGroup.visible = true;
    this.modelGroup.add(this.selectionGroup);
    
    // Initialize SelectionManager with groups (Phase 2)
    this.selectionManager = new SelectionManager(this.modelGroup, this.selectionGroup, this._camera);
    
    // Initialize PieceManager
    this.pieceManager = new PieceManager(this.partLoader, this.modelGroup);
    
    // Wire up events from PieceManager to SceneManager
    this.pieceManager.addEventListener(PieceEvents.PIECE_ADDED, data => {
      this.dispatchEvent(SceneEvents.PIECE_ADDED, data);
    });
    
    this.pieceManager.addEventListener(PieceEvents.PIECE_REMOVED, data => {
      this.dispatchEvent(SceneEvents.PIECE_REMOVED, data);
    });
    
    this.pieceManager.addEventListener(PieceEvents.PIECE_UPDATED, data => {
      this.dispatchEvent(SceneEvents.PIECE_UPDATED, data);
    });
    
    // Wire up SelectionManager events (Phase 2: Updated for multi-select)
    this.selectionManager.addEventListener(SelectionEvents.SELECTION_CHANGED, data => {
      // Ensure origin is string | undefined (not null)
      const eventData = {
        pieceIds: data.pieceIds,
        objects: data.objects,
        origin: data.origin || undefined
      };
      this.dispatchEvent(SceneEvents.SELECTION_CHANGED, eventData);
    });
    
    // Start animation loop
    this.animate();
    
    // Handle window resize
    window.addEventListener('resize', this.handleResize);
  }
  
  /**
   * Add an event listener
   */
  public addEventListener<T extends SceneEvents>(event: T, listener: SceneEventListener<T>): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener as SceneEventListener<SceneEvents>);
  }
  
  /**
   * Remove an event listener
   */
  public removeEventListener<T extends SceneEvents>(event: T, listener: SceneEventListener<T>): void {
    if (!this.eventListeners.has(event)) return;
    
    const listeners = this.eventListeners.get(event)!;
    const index = listeners.indexOf(listener as SceneEventListener<SceneEvents>);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }
  
  /**
   * Dispatch an event
   */
  private dispatchEvent<T extends SceneEvents>(event: T, data: SceneEventData[T]): void {
    if (!this.eventListeners.has(event)) return;
    
    const listeners = this.eventListeners.get(event)!;
    for (const listener of listeners) {
      (listener as SceneEventListener<T>)(data);
    }
  }
  
  /**
   * Load an LDraw model directly from an LDrawModel object
   * @param model The LDrawModel object to load
   */
  public async loadModel(model: LDrawModel): Promise<void> {
    try {
      console.log('Loading model directly from LDrawModel object...');
      
      // Log the pieces and their positions before loading with special Y-coordinate focus
      if (model.pieces.length > 0) {
        console.log('Pieces to load with positions:');
        model.pieces.forEach((piece, index) => {
          console.log(`Piece ${index} (${piece.partId}): Position X=${piece.position.x}, Y=${piece.position.y} ✅, Z=${piece.position.z}`);
        });
        
        // Special focus on Y coordinate for first piece
        if (model.pieces[0]) {
          console.log(`🔍 Y-AXIS DEBUG - First piece (${model.pieces[0].partId}) Y coordinate: ${model.pieces[0].position.y}`);
        }
      }
      
      // Clear the model first to start fresh
      // We'll re-create the pieces instead of trying to reuse them
      this.clearModel();
      
      // Update the model in the piece manager
      if (this.pieceManager) {
        this.pieceManager.setLDrawModel(model);
        
        // Log Y coordinates of model after setting in pieceManager
        const storedModel = this.pieceManager.getLDrawModel();
        if (storedModel && storedModel.pieces.length > 0) {
          console.log(`🔍 Y-AXIS DEBUG - After setting model in pieceManager, first piece Y=${storedModel.pieces[0].position.y}`);
        }
      }
      
      console.log(`Loading model: ${model.name || 'Unnamed'}, ${model.pieces.length} pieces`);
      
      // Process each piece - create new instances to ensure correct transforms
      try {
        console.log('Creating fresh pieces for all items in the model...');
        const piecePromises = model.pieces.map(piece => {
          // Log the Y coordinate specifically before adding the piece
          console.log(`🔍 Y-AXIS DEBUG - Before addPiece for ${piece.partId}, Y=${piece.position.y}`);
          return this.addPiece(piece);
        });
        
        await Promise.all(piecePromises);
        
        console.log('All pieces processed successfully');
        
        // Log the positions of objects after loading with Y-coordinate focus
        if (this.pieceManager && model.pieces.length > 0) {
          console.log('Pieces after loading with THREE.js positions:');
          model.pieces.forEach((piece) => {
            if (piece.id) {
              const pieceObj = this.pieceManager?.getPieceById(piece.id.toString());
              if (pieceObj) {
                console.log(`Piece ${piece.id} (${piece.partId}): THREE.js Position X=${pieceObj.object.position.x}, Y=${pieceObj.object.position.y} ✅, Z=${pieceObj.object.position.z}`);
                
                // Compare Y coordinate between model and Three.js object
                console.log(`🔍 Y-AXIS DEBUG - Comparison for ${piece.partId}: LDraw Y=${piece.position.y}, THREE.js Y=${pieceObj.object.position.y}, Expected Three.js Y=${-piece.position.y}`);
                
                if (Math.abs(pieceObj.object.position.y - (-piece.position.y)) > 0.01) {
                  console.warn(`⚠️ Y-AXIS MISMATCH for ${piece.partId}: THREE.js Y=${pieceObj.object.position.y} doesn't match expected ${-piece.position.y}`);
                }
              }
            }
          });
        }
      } catch (error) {
        console.error('Failed to load one or more pieces:', error);
        // Continue with any successfully loaded pieces
      }
      
      // Center the camera on the model
      if (this.modelGroup) {
        centerCameraOnGroup(this.modelGroup, this._camera, this.controls);
      }
      
      // Dispatch event
      this.dispatchEvent(SceneEvents.MODEL_LOADED, model);
    } catch (error) {
      console.error('Error loading model directly:', error);
      throw error;
    }
  }
  
  /**
   * Add a piece to the scene
   */
  public async addPiece(piece: LDrawPiece): Promise<THREE.Object3D> {
    if (!this.pieceManager) {
      throw new Error('PieceManager not initialized');
    }
    
    return this.pieceManager.addPiece(piece);
  }
  
  /**
   * Remove a piece from the scene
   */
  public removePiece(pieceId: string): void {
    if (!this.pieceManager) return;
    
    this.pieceManager.removePiece(pieceId);
  }
  
  /**
   * Update a piece (position, rotation, color)
   */
  public updatePiece(pieceId: string, updates: Partial<LDrawPiece>): void {
    if (!this.pieceManager) return;
    
    this.pieceManager.updatePiece(pieceId, updates);
  }
  
  /**
   * Get all pieces in the scene
   */
  public getPieces(): Map<string, THREE.Object3D> {
    return this.pieceManager ? this.pieceManager.getPieces() : new Map();
  }
  
  /**
   * Get the LDraw model data
   */
  public getLDrawModel(): LDrawModel | null {
    return this.pieceManager ? this.pieceManager.getLDrawModel() : null;
  }
  
  /**
   * Remove the current model from the scene
   */
  public clearModel(): void {
    // Clear pieces
    if (this.pieceManager) {
      this.pieceManager.clear();
      this.pieceManager.setLDrawModel(null);
    }
    
    // Re-add SelectionGroup after clear (it gets removed by pieceManager.clear())
    if (this.selectionGroup && !this.selectionGroup.parent && this.modelGroup) {
      this.modelGroup.add(this.selectionGroup);
    }
    
    // Dispatch event
    this.dispatchEvent(SceneEvents.SCENE_RESET, null);
  }
  
  /**
   * Clean up resources when done
   */
  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    if (this._renderer.domElement.parentElement) {
      this._renderer.domElement.parentElement.removeChild(this._renderer.domElement);
    }
    
    this.controls.dispose();
  }
  
  /**
   * Animation loop
   */
  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    
    // Update controls
    if (this.controls) {
      this.controls.update();
    }
    
    // Render scene - add extra null checks
    if (this._scene && this._camera) {
      try {
        this._renderer.render(this._scene, this._camera);
      } catch (error) {
        console.error('Render error:', error);
      }
    }
  };
  
  /**
   * Handle window resize
   */
  private handleResize = (): void => {
    this.handleContainerResize();
  };

  /**
   * Handle container resize (public method for external trigger)
   */
  public handleContainerResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(width, height);
    
    console.log(`SceneManager: Container resized to ${width}x${height}`);
  }
  
  /**
   * Update a piece's transform based on its current THREE.js object state
   */
  public updatePieceTransformFromObject(pieceId: string): void {
    if (!this.pieceManager) return;
    
    this.pieceManager.updatePieceTransformFromObject(pieceId);
  }
  
  /**
   * Get the current LDraw transformation for a piece
   * @param pieceId The ID of the piece
   * @returns The position and rotation matrix in LDraw format, or null if not found
   */
  public getLDrawTransformForPiece(pieceId: string): { position: { x: number, y: number, z: number }, rotationMatrix: [number, number, number, number, number, number, number, number, number] } | null {
    if (!this.pieceManager) return null;
    
    const pieceData = this.pieceManager.getPieceById(pieceId);
    if (!pieceData) return null;
    
    // Get the current LDraw piece information
    const { piece } = pieceData;
    
    return {
      position: piece.position,
      rotationMatrix: piece.rotationMatrix as [number, number, number, number, number, number, number, number, number]
    };
  }
  
  /**
   * Get the OrbitControls instance
   */
  public getOrbitControls(): OrbitControls {
    return this.controls;
  }
  
  /**
   * Get the model group for camera centering operations
   */
  public getModelGroup(): THREE.Group | null {
    return this.modelGroup;
  }
  
  /**
   * Get piece by ID
   */
  public getPieceById(pieceId: string): { piece: LDrawPiece; object: THREE.Object3D } | null {
    if (!this.pieceManager) return null;
    return this.pieceManager.getPieceById(pieceId);
  }
  
  /**
   * Select a piece by ID
   */
  public selectPieceById(pieceId: string): void {
    const pieceData = this.getPieceById(pieceId);
    if (pieceData && pieceData.object) {
      this.selectionManager.select(pieceData.object, false);
    }
  }
  
  /**
   * Clear the current selection
   */
  public clearSelection(): void {
    this.selectionManager.clear();
  }
  
  /**
   * Get the IDs of the currently selected pieces
   */
  public getSelectedPieceIds(): string[] {
    return this.selectionManager.getSelectedPieceIds();
  }
  
  /**
   * Get the objects of the currently selected pieces
   */
  public getSelectedObjects(): THREE.Object3D[] {
    return this.selectionManager.getSelectedObjects();
  }
  
  /**
   * Get the first selected piece ID (for legacy compatibility)
   */
  public getSelectedPieceId(): string | null {
    const ids = this.selectionManager.getSelectedPieceIds();
    return ids.length > 0 ? ids[0] : null;
  }
  
  /**
   * Get the first selected object (for legacy compatibility)
   */
  public getSelectedObject(): THREE.Object3D | null {
    const objects = this.selectionManager.getSelectedObjects();
    return objects.length > 0 ? objects[0] : null;
  }
  
  /**
   * Set hover state for a piece
   */
  public setHoverPiece(pieceId: string | null, object: THREE.Object3D | null): void {
    this.selectionManager.setHoverPiece(pieceId, object);
  }
  
  /**
   * Phase 2: Update transforms for all pieces in the selection group
   */
  public updateSelectedPieceTransforms(): void {
    if (!this.pieceManager || !this.selectionGroup) return;
    
    // Ensure world matrices are updated as the group has moved
    this.selectionGroup.updateMatrixWorld(true);

    // Iterate over children currently in the selection group
    // Their world positions are updated by Three.js; we just need to sync LDraw data.
    this.selectionGroup.children.forEach(object => {
      const pieceId = object.userData.pieceId;
      if (pieceId && this.pieceManager) {
        this.pieceManager.updatePieceTransformFromObject(pieceId);
      }
    });
  }

  /**
   * Phase 2: Updated selectObjectAtCoordinates with additive selection support
   * @param x The x screen coordinate
   * @param y The y screen coordinate  
   * @param additive Whether to add to existing selection or replace it
   * @returns True if a piece was found at the coordinates
   */
  public selectObjectAtCoordinates(x: number, y: number, additive: boolean = false): boolean {
    // Convert screen coordinates to normalized device coordinates (-1 to +1)
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mouseX = ((x - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((y - rect.top) / rect.height) * 2 + 1;
    
    // Create raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(mouseX, mouseY);
    raycaster.setFromCamera(mouse, this._camera);
    
    if (!this.modelGroup || !this.selectionGroup) return false;
    
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
  
  /**
   * Find the piece ID for a given Object3D
   */
  public findPieceIdForObject(object: THREE.Object3D): string | null {
    if (!this.pieceManager) return null;
    
    // Traverse up the parent chain to find the piece root
    let current: THREE.Object3D | null = object;
    while (current && current !== this.modelGroup) {
      // Check if this object is a piece root
      const pieceId = this.pieceManager.getPieceIdForObject(current);
      if (pieceId) {
        return pieceId;
      }
      
      // Move up to parent
      current = current.parent;
    }
    
    return null;
  }
  
  /**
   * Get object information at the given screen coordinates without selecting it
   * @param x The x screen coordinate
   * @param y The y screen coordinate
   * @returns Object information if found, null otherwise
   */
  public getObjectInfoAtCoordinates(x: number, y: number): { pieceId: string; object: THREE.Object3D } | null {
    // Convert screen coordinates to normalized device coordinates (-1 to +1)
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mouseX = ((x - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((y - rect.top) / rect.height) * 2 + 1;
    
    // Create raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(mouseX, mouseY);
    raycaster.setFromCamera(mouse, this._camera);
    
    // Raycast against both groups to detect hover on both selected and unselected pieces
    if (!this.modelGroup || !this.selectionGroup) return null;
    
    const targets = [...this.modelGroup.children, ...this.selectionGroup.children];
    const intersects = raycaster.intersectObjects(targets, true);
    
    if (intersects.length > 0) {
      // Find the first intersected object that belongs to a piece
      for (const intersect of intersects) {
        const pieceId = this.findPieceIdForObject(intersect.object);
        if (pieceId) {
          const pieceData = this.getPieceById(pieceId);
          if (pieceData) {
            return {
              pieceId,
              object: pieceData.object
            };
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Update all piece transforms from their current Three.js object state
   */
  public updateAllPieceTransforms(): void {
    if (!this.pieceManager) return;
    
    const model = this.getLDrawModel();
    if (!model) return;
    
    // For each piece in the model, update its transform
    model.pieces.forEach((piece: LDrawPiece) => {
      if (piece.id) {
        this.updatePieceTransformFromObject(piece.id.toString());
      }
    });
  }

  // Multi-select API methods (Phase 1: extending API while maintaining current behavior)

  /**
   * Get all selectable objects in the scene
   */
  public getSelectableObjects(): THREE.Object3D[] {
    return this.modelGroup ? this.modelGroup.children : [];
  }

  /**
   * Get piece ID for a given object (public wrapper)
   */
  public getPieceIdForObject(object: THREE.Object3D): string | null {
    return this.findPieceIdForObject(object);
  }

  /**
   * Remove multiple pieces from the scene
   */
  public removePieces(pieceIds: string[]): void {
    pieceIds.forEach(id => this.removePiece(id));
  }

  /**
   * Get all piece IDs in the scene
   */
  public getAllPieceIds(): string[] {
    const pieces = this.getPieces();
    return Array.from(pieces.keys());
  }

  /**
   * Select only a specific piece (Phase 4: Multi-select implementation)
   */
  public selectOnlyPiece(pieceId: string): void {
    const pieceData = this.getPieceById(pieceId);
    if (pieceData) {
      this.selectionManager.clear();
      this.selectionManager.select(pieceData.object);
    }
  }

  /**
   * Select all pieces from a list (Phase 4: True multi-select)
   */
  public selectAllPieces(pieceIds: string[]): void {
    this.selectionManager.clear();
    pieceIds.forEach(pieceId => {
      const pieceData = this.getPieceById(pieceId);
      if (pieceData) {
        this.selectionManager.select(pieceData.object);
      }
    });
  }
} 