import * as THREE from 'three';
import { SelectionManager, SelectionEvents } from '../three/SelectionManager';
import { vi, describe, test, expect, beforeEach } from 'vitest';

describe('SelectionManager', () => {
  let selectionManager: SelectionManager;
  let testObject: THREE.Object3D;
  let mockMesh: THREE.Mesh;
  let modelGroup: THREE.Group;
  let selectionGroup: THREE.Group;
  let camera: THREE.Camera;
  
  beforeEach(() => {
    // Create groups for Phase 4 SelectionManager
    modelGroup = new THREE.Group();
    modelGroup.name = 'ModelGroup';
    selectionGroup = new THREE.Group();
    selectionGroup.name = 'SelectionGroup';
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    
    selectionManager = new SelectionManager(modelGroup, selectionGroup, camera);
    testObject = new THREE.Object3D();
    testObject.name = 'Test Object';
    testObject.userData = { pieceId: 'test-piece-1' };
    
    // Add test object to model group
    modelGroup.add(testObject);
    
    // Create a mock mesh with material to test highlight functionality
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    mockMesh = new THREE.Mesh(geometry, material);
    testObject.add(mockMesh);
  });
  
  test('should initialize with no selection', () => {
    expect(selectionManager.getSelectedPieceIds()).toEqual([]);
    expect(selectionManager.getSelectedObjects()).toEqual([]);
  });
  
  test('should select a piece', () => {
    selectionManager.select(testObject);
    
    expect(selectionManager.getSelectedPieceIds()).toEqual(['test-piece-1']);
    expect(selectionManager.getSelectedObjects()).toEqual([testObject]);
  });
  
  test('should clear selection', () => {
    selectionManager.select(testObject);
    selectionManager.clear();
    
    expect(selectionManager.getSelectedPieceIds()).toEqual([]);
    expect(selectionManager.getSelectedObjects()).toEqual([]);
  });
  
  test('should dispatch selection changed event on select', () => {
    const mockListener = vi.fn();
    selectionManager.addEventListener(SelectionEvents.SELECTION_CHANGED, mockListener);
    
    selectionManager.select(testObject);
    
    expect(mockListener).toHaveBeenCalledWith({
      pieceIds: ['test-piece-1'],
      objects: [testObject],
      origin: 'viewer'
    });
  });
  
  test('should dispatch selection changed event on clear', () => {
    const mockListener = vi.fn();
    selectionManager.addEventListener(SelectionEvents.SELECTION_CHANGED, mockListener);
    
    selectionManager.select(testObject);
    mockListener.mockClear(); // Reset the mock
    
    selectionManager.clear();
    
    expect(mockListener).toHaveBeenCalledWith({
      pieceIds: [],
      objects: [],
      origin: 'viewer'
    });
  });
  
  test('should set and clear hover state', () => {
    const mockListener = vi.fn();
    selectionManager.addEventListener(SelectionEvents.HOVER_CHANGED, mockListener);
    
    selectionManager.setHoverPiece('hover-id', testObject);
    
    expect(mockListener).toHaveBeenCalledWith({
      pieceIds: ['hover-id'],
      objects: [testObject],
      origin: 'viewer'
    });
    
    mockListener.mockClear();
    
    // Implicitly clear hover by setting to null
    selectionManager.setHoverPiece(null, null);
    
    expect(mockListener).toHaveBeenCalledWith({
      pieceIds: [],
      objects: [],
      origin: 'viewer'
    });
  });
  
  test('should remove event listener', () => {
    const mockListener = vi.fn();
    selectionManager.addEventListener(SelectionEvents.SELECTION_CHANGED, mockListener);
    
    selectionManager.removeEventListener(SelectionEvents.SELECTION_CHANGED, mockListener);
    
    selectionManager.select(testObject);
    
    expect(mockListener).not.toHaveBeenCalled();
  });
}); 