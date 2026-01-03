import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SelectionGroupManager } from '../three/SelectionGroupManager';
import { useModelStore } from '../state/useModelStore';

// Mock the store
vi.mock('../state/useModelStore', () => ({
  useModelStore: {
    getState: vi.fn(() => ({
      actions: {
        updatePieceTransforms: vi.fn()
      }
    }))
  }
}));

// Mock LDrawTransforms
vi.mock('../three/LDrawTransforms', () => ({
  extractLDrawTransform: vi.fn(() => ({
    position: new THREE.Vector3(10, 20, 30),
    rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]
  })),
  cleanTransformMatrix: vi.fn((matrix) => matrix)
}));

describe('SelectionGroupManager', () => {
  let scene: THREE.Scene;
  let manager: SelectionGroupManager;
  let mockPieces: Array<{ id: string; object: THREE.Object3D }>;

  beforeEach(() => {
    scene = new THREE.Scene();
    manager = new SelectionGroupManager(scene);
    
    // Create mock pieces
    mockPieces = [
      {
        id: 'piece-1',
        object: createMockPieceContainer('piece-1', new THREE.Vector3(0, 0, 0))
      },
      {
        id: 'piece-2', 
        object: createMockPieceContainer('piece-2', new THREE.Vector3(10, 0, 0))
      },
      {
        id: 'piece-3',
        object: createMockPieceContainer('piece-3', new THREE.Vector3(0, 10, 0))
      }
    ];

    // Add pieces to scene
    mockPieces.forEach(piece => scene.add(piece.object));
  });

  function createMockPieceContainer(id: string, position: THREE.Vector3): THREE.Object3D {
    const container = new THREE.Group();
    container.position.copy(position);
    container.userData = { 
      type: 'piece',
      pieceId: id 
    };
    
    // Add a mock mesh as child
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    container.add(mesh);
    
    return container;
  }

  describe('Group Creation', () => {
    it('should create group at correct centroid', () => {
      const pieces = [mockPieces[0], mockPieces[1]]; // At (0,0,0) and (10,0,0)
      const group = manager.createSelectionGroup(pieces);
      
      expect(group).toBeDefined();
      expect(group.userData.type).toBe('selection-group');
      expect(group.userData.pieceCount).toBe(2);
      
      // Centroid should be at (5, 0, 0)
      expect(group.position.x).toBeCloseTo(5);
      expect(group.position.y).toBeCloseTo(0);
      expect(group.position.z).toBeCloseTo(0);
    });

    it('should create group with three pieces at correct centroid', () => {
      const group = manager.createSelectionGroup(mockPieces);
      
      // Pieces at (0,0,0), (10,0,0), (0,10,0)
      // Bounding box centroid: min(0,0,0), max(10,10,0) -> center(5,5,0)
      expect(group.position.x).toBeCloseTo(5, 1);
      expect(group.position.y).toBeCloseTo(5, 1);
      expect(group.position.z).toBeCloseTo(0);
    });

    it('should add group to scene', () => {
      const initialChildCount = scene.children.length;
      manager.createSelectionGroup([mockPieces[0]]);
      
      expect(scene.children.length).toBe(initialChildCount + 1);
      expect(scene.children[scene.children.length - 1].userData.type).toBe('selection-group');
    });

    it('should throw error with empty pieces array', () => {
      expect(() => manager.createSelectionGroup([])).toThrow('Cannot create selection group with no pieces');
    });

    it('should cleanup existing group before creating new one', () => {
      // Create first group
      manager.createSelectionGroup([mockPieces[0]]);
      const firstGroupCount = scene.children.length;
      
      // Create second group
      manager.createSelectionGroup([mockPieces[1]]);
      const secondGroupCount = scene.children.length;
      
      // Should have same number of children (old group removed, new one added)
      expect(secondGroupCount).toBe(firstGroupCount);
    });
  });

  describe('Piece Attachment', () => {
    it('should attach pieces to selection group', () => {
      const group = manager.createSelectionGroup([mockPieces[0], mockPieces[1]]);
      manager.attachPieces([mockPieces[0], mockPieces[1]]);
      
      expect(group.children.length).toBe(2);
      expect(group.children[0].userData.pieceId).toBe('piece-1');
      expect(group.children[1].userData.pieceId).toBe('piece-2');
    });

    it('should preserve world position during attach', () => {
      const piece = mockPieces[0];
      const originalWorldPosition = new THREE.Vector3();
      piece.object.getWorldPosition(originalWorldPosition);
      
      manager.createSelectionGroup([piece]);
      manager.attachPieces([piece]);
      
      const newWorldPosition = new THREE.Vector3();
      piece.object.getWorldPosition(newWorldPosition);
      
      expect(newWorldPosition.distanceTo(originalWorldPosition)).toBeLessThan(0.001);
    });

    it('should throw error if no group created', () => {
      expect(() => manager.attachPieces([mockPieces[0]])).toThrow('No selection group created');
    });
  });

  describe('Piece Detachment', () => {
    it('should detach pieces back to original parents', () => {
      // Setup
      const originalParent1 = mockPieces[0].object.parent;
      const originalParent2 = mockPieces[1].object.parent;
      
      manager.createSelectionGroup([mockPieces[0], mockPieces[1]]);
      manager.attachPieces([mockPieces[0], mockPieces[1]]);
      
      // Detach
      const updates = manager.detachPieces();
      
      expect(mockPieces[0].object.parent).toBe(originalParent1);
      expect(mockPieces[1].object.parent).toBe(originalParent2);
      expect(updates.length).toBe(2);
    });

    it('should return transform updates for all pieces', () => {
      manager.createSelectionGroup([mockPieces[0], mockPieces[1]]);
      manager.attachPieces([mockPieces[0], mockPieces[1]]);
      
      const updates = manager.detachPieces();
      
      expect(updates).toHaveLength(2);
      expect(updates[0]).toHaveProperty('id');
      expect(updates[0]).toHaveProperty('position');
      expect(updates[0]).toHaveProperty('rotationMatrix');
    });

    it('should cleanup group after detachment', () => {
      const initialChildCount = scene.children.length;
      
      manager.createSelectionGroup([mockPieces[0]]);
      manager.attachPieces([mockPieces[0]]);
      
      manager.detachPieces();
      
      // Should return to original child count (group removed)
      expect(scene.children.length).toBe(initialChildCount);
      expect(manager.getSelectionGroup()).toBeNull();
    });

    it('should handle empty group gracefully', () => {
      const updates = manager.detachPieces();
      expect(updates).toEqual([]);
    });
  });

  describe('Transform Commitment', () => {
    it('should commit transformation to store', () => {
      const mockActions = {
        loadModel: vi.fn(),
        setSelection: vi.fn(),
        toggleSelection: vi.fn(),
        addToSelection: vi.fn(),
        clearSelection: vi.fn(),
        updatePieceTransforms: vi.fn(),
        setMousePosition: vi.fn(),
        clearNewFileFlag: vi.fn(),
        setHasUnsavedChanges: vi.fn(),
        setCurrentFileName: vi.fn()
      };
      vi.mocked(useModelStore.getState).mockReturnValue({
        model: { pieces: [] },
        selectedIds: new Set(),
        mousePosition: null,
        isNewFileLoaded: false,
        hasUnsavedChanges: false,
        currentFileName: '',
        actions: mockActions
      });
      
      manager.createSelectionGroup([mockPieces[0]]);
      manager.attachPieces([mockPieces[0]]);
      
      manager.commitTransformation();
      
      expect(mockActions.updatePieceTransforms).toHaveBeenCalledOnce();
    });

    it('should handle inactive group gracefully', () => {
      const mockActions = {
        loadModel: vi.fn(),
        setSelection: vi.fn(),
        toggleSelection: vi.fn(),
        addToSelection: vi.fn(),
        clearSelection: vi.fn(),
        updatePieceTransforms: vi.fn(),
        setMousePosition: vi.fn(),
        clearNewFileFlag: vi.fn(),
        setHasUnsavedChanges: vi.fn(),
        setCurrentFileName: vi.fn()
      };
      vi.mocked(useModelStore.getState).mockReturnValue({
        model: { pieces: [] },
        selectedIds: new Set(),
        mousePosition: null,
        isNewFileLoaded: false,
        hasUnsavedChanges: false,
        currentFileName: '',
        actions: mockActions
      });
      
      manager.commitTransformation();
      
      expect(mockActions.updatePieceTransforms).not.toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should track group active state', () => {
      expect(manager.isGroupActive()).toBe(false);
      
      manager.createSelectionGroup([mockPieces[0]]);
      expect(manager.isGroupActive()).toBe(true);
      
      manager.cleanup();
      expect(manager.isGroupActive()).toBe(false);
    });

    it('should track piece count', () => {
      expect(manager.getPieceCount()).toBe(0);
      
      manager.createSelectionGroup([mockPieces[0], mockPieces[1]]);
      expect(manager.getPieceCount()).toBe(2);
    });

    it('should return current selection group', () => {
      expect(manager.getSelectionGroup()).toBeNull();
      
      const group = manager.createSelectionGroup([mockPieces[0]]);
      expect(manager.getSelectionGroup()).toBe(group);
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should cleanup group and state', () => {
      manager.createSelectionGroup([mockPieces[0]]);
      manager.attachPieces([mockPieces[0]]);
      
      const initialChildCount = scene.children.length;
      manager.cleanup();
      
      expect(scene.children.length).toBe(initialChildCount - 1);
      expect(manager.isGroupActive()).toBe(false);
      expect(manager.getSelectionGroup()).toBeNull();
    });

    it('should handle emergency cleanup when group is active', () => {
      // Setup mock before creating group
      const mockActions = {
        loadModel: vi.fn(),
        setSelection: vi.fn(),
        toggleSelection: vi.fn(),
        addToSelection: vi.fn(),
        clearSelection: vi.fn(),
        updatePieceTransforms: vi.fn(),
        setMousePosition: vi.fn(),
        clearNewFileFlag: vi.fn(),
        setHasUnsavedChanges: vi.fn(),
        setCurrentFileName: vi.fn()
      };
      vi.mocked(useModelStore.getState).mockReturnValue({
        model: { pieces: [] },
        selectedIds: new Set(),
        mousePosition: null,
        isNewFileLoaded: false,
        hasUnsavedChanges: false,
        currentFileName: '',
        actions: mockActions
      });
      
      manager.createSelectionGroup([mockPieces[0]]);
      manager.attachPieces([mockPieces[0]]);
      
      manager.emergencyCleanup();
      
      expect(manager.isGroupActive()).toBe(false);
      expect(mockActions.updatePieceTransforms).toHaveBeenCalledOnce();
    });

    it('should dispose properly', () => {
      manager.createSelectionGroup([mockPieces[0]]);
      manager.attachPieces([mockPieces[0]]);
      
      manager.dispose();
      
      expect(manager.isGroupActive()).toBe(false);
      expect(manager.getSelectionGroup()).toBeNull();
    });
  });
}); 