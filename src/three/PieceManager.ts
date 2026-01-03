import * as THREE from 'three';
import { LDrawModel, LDrawPiece } from '../ldraw/LDrawDataModels';
import { PartGeometryLoader } from './PartGeometryLoader';
import { applyLDrawTransformToObject, getLDrawTransformFromObject } from './LDrawTransforms';

// Piece events enum
export enum PieceEvents {
  PIECE_ADDED = 'piece_added',
  PIECE_REMOVED = 'piece_removed',
  PIECE_UPDATED = 'piece_updated'
}

// Event data types
export type PieceEventData = {
  [PieceEvents.PIECE_ADDED]: { piece: LDrawPiece; object: THREE.Object3D };
  [PieceEvents.PIECE_REMOVED]: { pieceId: string; object: THREE.Object3D };
  [PieceEvents.PIECE_UPDATED]: { pieceId: string; piece?: LDrawPiece; object: THREE.Object3D };
}

// Event listener type with proper typing
export type PieceEventListener<T extends keyof PieceEventData> = (data: PieceEventData[T]) => void;

/**
 * Manages LDraw pieces within a Three.js scene
 */
export class PieceManager {
  private pieces: Map<string, THREE.Object3D> = new Map();
  private ldrawModel: LDrawModel | null = null;
  private eventListeners: Map<PieceEvents, Array<PieceEventListener<PieceEvents>>> = new Map();
  
  constructor(
    private partLoader: PartGeometryLoader,
    private modelGroup: THREE.Group
  ) {}
  
  /**
   * Add an event listener
   */
  public addEventListener<T extends PieceEvents>(event: T, listener: PieceEventListener<T>): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener as PieceEventListener<PieceEvents>);
  }
  
  /**
   * Remove an event listener
   */
  public removeEventListener<T extends PieceEvents>(event: T, listener: PieceEventListener<T>): void {
    if (!this.eventListeners.has(event)) return;
    
    const listeners = this.eventListeners.get(event)!;
    const index = listeners.indexOf(listener as PieceEventListener<PieceEvents>);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }
  
  /**
   * Dispatch an event
   */
  private dispatchEvent<T extends PieceEvents>(event: T, data: PieceEventData[T]): void {
    if (!this.eventListeners.has(event)) return;
    
    const listeners = this.eventListeners.get(event)!;
    for (const listener of listeners) {
      (listener as PieceEventListener<T>)(data);
    }
  }
  
  /**
   * Set the current LDraw model
   */
  public setLDrawModel(model: LDrawModel | null): void {
    this.ldrawModel = model;
  }
  
  /**
   * Get the current LDraw model
   */
  public getLDrawModel(): LDrawModel | null {
    return this.ldrawModel;
  }
  
  /**
   * Add a piece to the scene
   */
  public async addPiece(piece: LDrawPiece): Promise<THREE.Object3D> {
    if (!this.ldrawModel) {
      throw new Error('No model loaded');
    }
    
    try {
      // Create container that will hold the part mesh
      const pieceContainer = new THREE.Group();
      
      // Generate a piece ID if one doesn't exist
      const pieceId = piece.id?.toString() || `piece_${this.pieces.size}`;
      pieceContainer.name = pieceId;
      
      // Set up user data
      pieceContainer.userData = {
        type: 'piece',
        pieceId
      };
      
      // REMOVED: Initial transform and stale state storage for stateless approach
      
      // Load the part geometry
      // Renamed from geometry to geometryData for clarity
      const geometryData = await this.partLoader.loadPartGeometry(piece.partId);
      
      // NEW: Store the full GeometryData in userData for later access (e.g., stud finding)
      pieceContainer.userData.geometryData = geometryData;

      // Create a colored instance if a color code is specified
      let partGroup: THREE.Group;
      if (piece.colorCode !== undefined) {
        // Use the color code to create a colored instance
        partGroup = this.partLoader.createColoredPartInstance(geometryData, piece.colorCode);
      } else {
        // Default - just use the original geometry
        partGroup = geometryData.group.clone();
      }

      // Since the loader provides geometry in LDraw coordinates (-Y up), we apply a negative Y scale
      // to the inner partGroup to correct the orientation.
      partGroup.scale.set(1, -1, 1);
      // We must update the matrix immediately so the following bounding box calculation is correct.
      partGroup.updateMatrix();
      // NOTE: This reflection reverses the winding order. Ensure materials use THREE.DoubleSide.
      // ------------------------------------------------


      // PHASE 2: Geometry Centering - Center the mesh within the PieceContainer
      if (partGroup) {
        // 1. Load geometry → compute local center (before adding to container)
        const bbox = new THREE.Box3().setFromObject(partGroup);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        
        // 2. Inverse-translate child mesh to center it at origin
        //partGroup.position.set(-center.x, -center.y, -center.z);
        
        // 3. Add centered mesh to piece container
        pieceContainer.add(partGroup);
        
        // 4. Persist metrics for transform calculations
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const geometryInfo = {
          center: { x: center.x, y: center.y, z: center.z },
          size: { x: size.x, y: size.y, z: size.z },
          // Legacy compatibility for existing transform code
          topToCenter: bbox.max.y - center.y,
          height: size.y,
          min: { x: bbox.min.x, y: bbox.min.y, z: bbox.min.z },
          max: { x: bbox.max.x, y: bbox.max.y, z: bbox.max.z }
        };
        
        pieceContainer.userData.geometryInfo = geometryInfo;
        
        console.log(`Geometry centered for piece ${pieceId}:`, {
          originalCenter: { x: center.x, y: center.y, z: center.z },
          offsetApplied: { x: -center.x, y: -center.y, z: -center.z },
          resultingBounds: geometryInfo
        });
      } else {
        console.warn(`No geometry loaded for part ${piece.partId}`);
        
        // Create a simple placeholder (already centered)
        const placeholder = new THREE.Mesh(
          new THREE.BoxGeometry(10, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
        );
        pieceContainer.add(placeholder);
        
        // Set default geometryInfo for placeholder
        pieceContainer.userData.geometryInfo = {
          center: { x: 0, y: 0, z: 0 },
          size: { x: 10, y: 10, z: 10 },
          topToCenter: 5,
          height: 10,
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 }
        };
      }
      
      // Apply the transform ONCE using the correct geometry info
      applyLDrawTransformToObject(pieceContainer, piece.position, piece.rotationMatrix);
      
      // Add to the model group
      this.modelGroup.add(pieceContainer);
      
      // Store the object reference
      this.pieces.set(pieceId, pieceContainer);
      
      // Add this piece to the model if it doesn't already exist
      if (!piece.id) {
        piece.id = pieceId;
        this.ldrawModel.pieces.push(piece);
      } else {
        // Find the piece in the model and potentially update it
        const existingPieceIndex = this.ldrawModel.pieces.findIndex(p => 
          p.id?.toString() === piece.id?.toString()
        );
        
        if (existingPieceIndex === -1) {
          this.ldrawModel.pieces.push(piece);
        }
      }
      
      // Dispatch event
      this.dispatchEvent(PieceEvents.PIECE_ADDED, { piece, object: pieceContainer });
      
      return pieceContainer;
    } catch (error) {
      console.error(`Failed to add piece ${piece.partId}:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a piece from the scene
   */
  public removePiece(pieceId: string): void {
    if (!this.pieces.has(pieceId)) return;
    
    const pieceObject = this.pieces.get(pieceId)!;
    
    // Remove from model group
    this.modelGroup.remove(pieceObject);
    
    // Remove reference
    this.pieces.delete(pieceId);
    
    // Dispatch event
    this.dispatchEvent(PieceEvents.PIECE_REMOVED, { pieceId, object: pieceObject });
  }
  
  /**
   * Update a piece (position, rotation, color)
   */
  public updatePiece(pieceId: string, updates: Partial<LDrawPiece>): void {
    if (!this.pieces.has(pieceId)) return;
    
    const pieceObject = this.pieces.get(pieceId)!;
    
    // Get current transform
    const currentTransform = getLDrawTransformFromObject(pieceObject);
    
    // Merge updates with current transform
    const newPosition = updates.position || currentTransform.position;
    const newRotation = updates.rotationMatrix || currentTransform.rotationMatrix;
    
    // Create a safe copy of the position
    const safePosition = new THREE.Vector3(newPosition.x, newPosition.y, newPosition.z);

    
    // Get geometry info if available
    const geometryInfo = pieceObject.userData?.geometryInfo;
    
    console.log(`🔍 Y-AXIS DEBUG - Updating piece ${pieceId} to position:`, {
      oldY: currentTransform.position.y,
      newY: safePosition.y,
      updatesProvided: !!updates.position,
      geometryInfo: geometryInfo
    });
    
    // Apply the updated transformation using the common method
    applyLDrawTransformToObject(pieceObject, safePosition, newRotation);
    
    // Update the piece in the model to ensure consistency
    if (this.ldrawModel) {
      const pieceIndex = this.ldrawModel.pieces.findIndex(p => p.id?.toString() === pieceId);
      if (pieceIndex !== -1) {
        // Update the position in the model
        this.ldrawModel.pieces[pieceIndex].position = safePosition;
        if (updates.rotationMatrix) {
          this.ldrawModel.pieces[pieceIndex].rotationMatrix = newRotation;
        }
      }
    }
    
    // Update color if provided
    if (updates.colorCode !== undefined) {
      // Find the matching LDraw piece to update its colorCode
      if (this.ldrawModel) {
        const pieceIndex = this.ldrawModel.pieces.findIndex(p => p.id?.toString() === pieceId);
        if (pieceIndex !== -1) {
          // Update the color code in the model
          this.ldrawModel.pieces[pieceIndex].colorCode = updates.colorCode;
          
          // Get the part ID from the existing piece
          const partId = this.ldrawModel.pieces[pieceIndex].partId;
          
          // Load the part geometry and create a new colored instance
          this.partLoader.loadPartGeometry(partId)
            .then(geometryData => {
              // Create a new instance with the updated color
              const newPieceObject = this.partLoader.createColoredPartInstance(geometryData, updates.colorCode!);
              newPieceObject.name = pieceObject.name;
              
              // Store the GeometryData in the new object's userData
              newPieceObject.userData.geometryData = geometryData;
              
              // Apply the same transformation
              applyLDrawTransformToObject(newPieceObject, safePosition, newRotation);
              
              // Replace the old object with the new one
              this.modelGroup.remove(pieceObject);
              this.modelGroup.add(newPieceObject);
              
              // Update the reference in the pieces map
              this.pieces.set(pieceId, newPieceObject);
              
              // Dispatch event with the updated object
              this.dispatchEvent(PieceEvents.PIECE_UPDATED, { 
                pieceId, 
                object: newPieceObject,
                piece: this.ldrawModel?.pieces[pieceIndex]
              });
            })
            .catch(error => {
              console.error(`Failed to update color for piece ${pieceId}:`, error);
            });
          
          return; // Return early as we'll dispatch the event after the async color update
        }
      }
    }
    
    // Dispatch event (only for non-color updates or if model/piece not found)
    this.dispatchEvent(PieceEvents.PIECE_UPDATED, { 
      pieceId, 
      object: pieceObject,
      piece: this.ldrawModel?.pieces.find(p => p.id?.toString() === pieceId)
    });
  }
  
  /**
   * Get all pieces in the scene
   */
  public getPieces(): Map<string, THREE.Object3D> {
    return new Map(this.pieces);
  }
  
  /**
   * Get a piece and its object by ID
   */
  public getPieceById(pieceId: string): { piece: LDrawPiece; object: THREE.Object3D } | null {
    if (!this.pieces.has(pieceId) || !this.ldrawModel) return null;
    
    const object = this.pieces.get(pieceId)!;
    const piece = this.ldrawModel.pieces.find(p => p.id?.toString() === pieceId);
    
    if (!piece) return null;
    
    return { piece, object };
  }
  
  /**
   * Find the piece ID for a given THREE.Object3D
   */
  public getPieceIdForObject(object: THREE.Object3D): string | null {
    // Look through pieces map to find the object
    for (const [pieceId, pieceObject] of this.pieces.entries()) {
      if (pieceObject === object) {
        return pieceId;
      }
    }
    return null;
  }
  
  /**
   * Update an LDrawPiece's transform based on the current THREE.js object state
   */
  public updatePieceTransformFromObject(pieceId: string): void {
    if (!this.pieces.has(pieceId) || !this.ldrawModel) return;
    
    const pieceObject = this.pieces.get(pieceId)!;
    const transform = getLDrawTransformFromObject(pieceObject);
    
    console.log(`Updating LDraw piece ${pieceId} transform from PieceContainer:`, {
      threePosition: pieceObject.position,
      ldrawPosition: transform.position
    });
    
    // Find the corresponding LDrawPiece in the model
    const pieceIndex = this.ldrawModel.pieces.findIndex(p => p.id?.toString() === pieceId);
    if (pieceIndex === -1) return;
    
    // Update the LDrawPiece in the model
    this.ldrawModel.pieces[pieceIndex].position = transform.position;
    this.ldrawModel.pieces[pieceIndex].rotationMatrix = transform.rotationMatrix;
    
    // PHASE 2: Legacy userData management removed - no longer needed with centered geometry
    
    // Dispatch event
    this.dispatchEvent(PieceEvents.PIECE_UPDATED, { 
      pieceId, 
      object: pieceObject,
      piece: this.ldrawModel.pieces[pieceIndex]
    });
  }
  
  /**
   * Clear all pieces
   */
  public clear(): void {
    // Clear the pieces map
    this.pieces.clear();
    
    // Clear the model group
    while (this.modelGroup.children.length > 0) {
      this.modelGroup.remove(this.modelGroup.children[0]);
    }
  }
} 