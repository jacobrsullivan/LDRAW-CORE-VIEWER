import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from '../three/SelectionManager';
import { useModelStore } from '../state/useModelStore';

// Mock the store
vi.mock('../state/useModelStore', () => ({
  useModelStore: {
    getState: vi.fn(() => ({
      selectedIds: new Set(),
      actions: {
        setSelection: vi.fn()
      }
    }))
  }
}));

describe('Phase 4 Selection System', () => {
  let selectionManager: SelectionManager;
  let modelGroup: THREE.Group;
  let selectionGroup: THREE.Group;
  let camera: THREE.Camera;
  let mockActions: any;

  beforeEach(() => {
    // Create test scene
    modelGroup = new THREE.Group();
    selectionGroup = new THREE.Group();
    camera = new THREE.PerspectiveCamera();
    
    // Mock store actions
    mockActions = {
      setSelection: vi.fn()
    };
    
    vi.mocked(useModelStore.getState).mockReturnValue({
      selectedIds: new Set(),
      actions: mockActions,
      model: { pieces: [] }
    } as any);

    selectionManager = new SelectionManager(modelGroup, selectionGroup, camera);
  });

  it('should select piece on click and dispatch to store', () => {
    // Create a mock piece container
    const pieceContainer = new THREE.Group();
    pieceContainer.userData = { type: 'piece', pieceId: 'test-piece-1' };
    
    // Add a mesh child to make it raycastable
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    pieceContainer.add(mesh);
    modelGroup.add(pieceContainer);

    // Create a mock mouse event
    const mockEvent = new MouseEvent('click', {
      clientX: 100,
      clientY: 100
    });

    // Create a mock canvas element
    const mockCanvas = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200
      })
    } as HTMLElement;

    // Mock the raycasting to return our piece
    const raycastSpy = vi.spyOn(selectionManager, 'raycastAndGetPieceId');
    raycastSpy.mockReturnValue('test-piece-1');

    // Handle the click
    selectionManager.handleClick(mockEvent, mockCanvas);

    // Verify store was updated
    expect(mockActions.setSelection).toHaveBeenCalledWith(['test-piece-1']);
  });

  it('should clear selection on background click', () => {
    // Mock raycasting to return null (background click)
    const raycastSpy = vi.spyOn(selectionManager, 'raycastAndGetPieceId');
    raycastSpy.mockReturnValue(null);

    const mockEvent = new MouseEvent('click');
    const mockCanvas = {} as HTMLElement;

    selectionManager.handleClick(mockEvent, mockCanvas);

    expect(mockActions.setSelection).toHaveBeenCalledWith([]);
  });

  it('should handle nested geometry traversal', () => {
    // Create a complex hierarchy: PieceContainer -> Group -> Mesh
    const pieceContainer = new THREE.Group();
    pieceContainer.userData = { type: 'piece', pieceId: 'nested-piece' };
    
    const intermediateGroup = new THREE.Group();
    pieceContainer.add(intermediateGroup);
    
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial()
    );
    intermediateGroup.add(mesh);
    modelGroup.add(pieceContainer);

    // Create a mock intersection that hits the deeply nested mesh
    const mockIntersection = {
      object: mesh,
      distance: 1,
      point: new THREE.Vector3()
    } as THREE.Intersection;

    // Test the traversal method directly
    const pieceId = (selectionManager as any).findPieceFromIntersection(mockIntersection);
    
    expect(pieceId).toBe('nested-piece');
  });

  it('should synchronize visual selection with store state', () => {
    // Create multiple piece containers
    const piece1 = new THREE.Group();
    piece1.userData = { type: 'piece', pieceId: 'piece-1' };
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    piece1.add(mesh1);
    modelGroup.add(piece1);

    const piece2 = new THREE.Group();
    piece2.userData = { type: 'piece', pieceId: 'piece-2' };
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    piece2.add(mesh2);
    modelGroup.add(piece2);

    // Update visual selection
    selectionManager.updateVisualSelection(['piece-1', 'piece-2']);

    // Verify both pieces are visually selected
    const selectedIds = selectionManager.getSelectedPieceIds();
    expect(selectedIds).toContain('piece-1');
    expect(selectedIds).toContain('piece-2');
  });

  it('should find objects by piece ID correctly', () => {
    // Create a piece container
    const pieceContainer = new THREE.Group();
    pieceContainer.userData = { type: 'piece', pieceId: 'findable-piece' };
    modelGroup.add(pieceContainer);

    // Test the private method using bracket notation
    const foundObject = (selectionManager as any).findObjectByPieceId('findable-piece');
    
    expect(foundObject).toBe(pieceContainer);
  });

  it('should return null for non-existent piece IDs', () => {
    const foundObject = (selectionManager as any).findObjectByPieceId('non-existent');
    expect(foundObject).toBeNull();
  });

  it('should handle pieces without proper userData', () => {
    // Create an object without piece userData
    const invalidObject = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    invalidObject.add(mesh);
    modelGroup.add(invalidObject);

    const mockIntersection = {
      object: mesh,
      distance: 1,
      point: new THREE.Vector3()
    } as THREE.Intersection;

    const pieceId = (selectionManager as any).findPieceFromIntersection(mockIntersection);
    expect(pieceId).toBeNull();
  });

  it('should get piece containers for optimized raycasting', () => {
    // Create multiple objects, only some are pieces
    const piece1 = new THREE.Group();
    piece1.userData = { type: 'piece', pieceId: 'piece-1' };
    modelGroup.add(piece1);

    const nonPiece = new THREE.Group();
    nonPiece.userData = { type: 'helper' };
    modelGroup.add(nonPiece);

    const piece2 = new THREE.Group();
    piece2.userData = { type: 'piece', pieceId: 'piece-2' };
    modelGroup.add(piece2);

    const containers = (selectionManager as any).getPieceContainers();
    
    expect(containers).toHaveLength(2);
    expect(containers).toContain(piece1);
    expect(containers).toContain(piece2);
    expect(containers).not.toContain(nonPiece);
  });
}); 