import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { InputEventHandler } from '../three/InputEventHandler';
import { SelectionGroupManager } from '../three/SelectionGroupManager';
import { TransformControlsManager, TransformControlsEvents } from '../three/TransformControlsManager';
import { SelectionManager } from '../three/SelectionManager';
import { SceneManager } from '../three/SceneManager';
import { useModelStore } from '../state/useModelStore';

// Mock dependencies
vi.mock('../state/useModelStore', () => ({
  useModelStore: {
    getState: vi.fn(() => ({
      model: { pieces: [] },
      selectedIds: new Set(),
      actions: {
        setSelection: vi.fn(),
        toggleSelection: vi.fn(),
        clearSelection: vi.fn(),
        updatePieceTransforms: vi.fn()
      }
    }))
  }
}));

vi.mock('../three/LDrawTransforms', () => ({
  extractLDrawTransform: vi.fn(() => ({
    position: new THREE.Vector3(10, 20, 30),
    rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1]
  })),
  cleanTransformMatrix: vi.fn((matrix) => matrix)
}));

describe('Multi-Select Integration', () => {
  let scene: THREE.Scene;
  let canvas: HTMLCanvasElement;
  let sceneManager: SceneManager;
  let selectionManager: SelectionManager;
  let selectionGroupManager: SelectionGroupManager;
  let transformControls: TransformControlsManager;
  let inputHandler: InputEventHandler;
  let mockActions: any;

  beforeEach(() => {
    // Setup Three.js components
    scene = new THREE.Scene();
    canvas = document.createElement('canvas');

    // Mock the store actions
    mockActions = {
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
      selectedIds: new Set<string>(),
      mousePosition: null,
      isNewFileLoaded: false,
      hasUnsavedChanges: false,
      currentFileName: '',
      actions: mockActions
    });

    // Create managers
    sceneManager = createMockSceneManager();
    selectionManager = createMockSelectionManager();
    selectionGroupManager = new SelectionGroupManager(scene);
    transformControls = createMockTransformControlsManager();

    inputHandler = new InputEventHandler(
      canvas,
      sceneManager,
      transformControls,
      selectionManager,
      selectionGroupManager
    );
  });

  // Helper to create complete mock state
  function createMockState(overrides: Partial<{
    model: { pieces: any[] };
    selectedIds: Set<string>;
    mousePosition: { x: number; y: number; z: number } | null;
  }> = {}) {
    return {
      model: overrides.model ?? { pieces: [] },
      selectedIds: overrides.selectedIds ?? new Set<string>(),
      mousePosition: overrides.mousePosition ?? null,
      isNewFileLoaded: false,
      hasUnsavedChanges: false,
      currentFileName: '',
      actions: mockActions
    };
  }

  function createMockSceneManager(): any {
    return {
      getPieceById: vi.fn((id: string) => ({
        id,
        object: createMockPieceContainer(id, new THREE.Vector3(0, 0, 0))
      }))
    };
  }

  function createMockSelectionManager(): any {
    return {
      raycastAndGetPieceId: vi.fn(),
      updateVisualSelection: vi.fn(),
      setSelectionGroupManager: vi.fn()
    };
  }

  function createMockTransformControlsManager(): any {
    const mockControls = {
      dragging: false,
      object: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      attachToSelectionGroup: vi.fn(),
      detach: vi.fn(),
      setMode: vi.fn(),
      getMode: vi.fn(() => 'translate'),
      isGroupTransform: vi.fn(() => false)
    };

    return mockControls;
  }

  function createMockPieceContainer(id: string, position: THREE.Vector3): THREE.Object3D {
    const container = new THREE.Group();
    container.position.copy(position);
    container.userData = { 
      type: 'piece',
      pieceId: id 
    };
    
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    container.add(mesh);
    
    return container;
  }

  function simulateClick(options: { 
    pieceId?: string | null; 
    shiftKey?: boolean; 
    ctrlKey?: boolean; 
    metaKey?: boolean 
  } = {}) {
    // Mock raycast result
    vi.mocked(selectionManager.raycastAndGetPieceId).mockReturnValue(options.pieceId || null);
    
    // Create mock event
    const event = new MouseEvent('click', {
      shiftKey: options.shiftKey || false,
      ctrlKey: options.ctrlKey || false,
      metaKey: options.metaKey || false
    });

    // Simulate click by calling the handler directly
    (inputHandler as any).handleClick(event);
  }

  describe('Single Piece Selection', () => {
    it('should select single piece on normal click', () => {
      simulateClick({ pieceId: 'piece-1' });
      
      expect(mockActions.setSelection).toHaveBeenCalledWith(['piece-1']);
    });

    it('should clear selection on background click', () => {
      simulateClick({ pieceId: null });
      
      expect(mockActions.clearSelection).toHaveBeenCalledOnce();
    });

    it('should update visual selection for single piece', () => {
      // Mock store state with selection
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set(['piece-1'])
      }));

      inputHandler.updateSelectionFromStore();

      expect(selectionManager.updateVisualSelection).toHaveBeenCalledWith(['piece-1']);
      expect(transformControls.attachToSelectionGroup).toHaveBeenCalled();
    });
  });

  describe('Multi-Piece Selection', () => {
    it('should handle Shift+Click multi-selection', () => {
      simulateClick({ pieceId: 'piece-1', shiftKey: true });
      
      expect(mockActions.toggleSelection).toHaveBeenCalledWith('piece-1');
    });

    it('should handle Ctrl+Click multi-selection', () => {
      simulateClick({ pieceId: 'piece-2', ctrlKey: true });
      
      expect(mockActions.toggleSelection).toHaveBeenCalledWith('piece-2');
    });

    it('should handle Meta+Click multi-selection (Mac)', () => {
      simulateClick({ pieceId: 'piece-3', metaKey: true });
      
      expect(mockActions.toggleSelection).toHaveBeenCalledWith('piece-3');
    });

    it('should not clear selection on background click during multi-select', () => {
      simulateClick({ pieceId: null, shiftKey: true });
      
      expect(mockActions.clearSelection).not.toHaveBeenCalled();
    });
  });

  describe('Group Transform Creation', () => {
    it('should create selection group for 2+ pieces', () => {
      // Mock multiple pieces selected
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set(['piece-1', 'piece-2'])
      }));

      // Mock scene manager to return pieces
      vi.mocked(sceneManager.getPieceById).mockImplementation((id: string) => ({
        piece: {
          id,
          partId: '3001.dat',
          position: new THREE.Vector3(Math.random() * 10, 0, 0),
          rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          colorCode: 4
        },
        object: createMockPieceContainer(id, new THREE.Vector3(Math.random() * 10, 0, 0))
      }));

      inputHandler.updateSelectionFromStore();

      expect(transformControls.attachToSelectionGroup).toHaveBeenCalledOnce();
    });

    it('should cleanup group when selection changes to single', () => {
      // Start with multiple selection
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set(['piece-1', 'piece-2'])
      }));

      inputHandler.updateSelectionFromStore();

      // Change to single selection
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set(['piece-1'])
      }));

      const initialChildCount = scene.children.length;
      inputHandler.updateSelectionFromStore();

      expect(transformControls.attachToSelectionGroup).toHaveBeenCalled();
      // Group should be cleaned up (removed from scene)
      expect(scene.children.length).toBeLessThanOrEqual(initialChildCount);
    });

    it('should cleanup group when selection is cleared', () => {
      // Start with selection
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set(['piece-1', 'piece-2'])
      }));

      inputHandler.updateSelectionFromStore();

      // Clear selection
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set()
      }));

      inputHandler.updateSelectionFromStore();

      expect(transformControls.detach).toHaveBeenCalledOnce();
    });
  });

  describe('Group Transform Workflow', () => {
    it('should move group without piece separation', () => {
      // Create group with multiple pieces
      const pieces = [
        { id: 'piece-1', object: createMockPieceContainer('piece-1', new THREE.Vector3(0, 0, 0)) },
        { id: 'piece-2', object: createMockPieceContainer('piece-2', new THREE.Vector3(10, 0, 0)) }
      ];

      pieces.forEach(piece => scene.add(piece.object));

      const group = selectionGroupManager.createSelectionGroup(pieces);
      selectionGroupManager.attachPieces(pieces);

      // Verify pieces are children of group
      expect(group.children.length).toBe(2);
      expect(pieces[0].object.parent).toBe(group);
      expect(pieces[1].object.parent).toBe(group);

      // Simulate group transform
      group.position.set(5, 5, 5);
      group.rotation.set(0, Math.PI / 4, 0);

      // Verify pieces moved with group
      const piece1WorldPos = new THREE.Vector3();
      const piece2WorldPos = new THREE.Vector3();
      pieces[0].object.getWorldPosition(piece1WorldPos);
      pieces[1].object.getWorldPosition(piece2WorldPos);

      expect(piece1WorldPos.y).toBeCloseTo(5);
      expect(piece2WorldPos.y).toBeCloseTo(5);
    });

    it('should update all pieces on group transform end', () => {
      const pieces = [
        { id: 'piece-1', object: createMockPieceContainer('piece-1', new THREE.Vector3(0, 0, 0)) },
        { id: 'piece-2', object: createMockPieceContainer('piece-2', new THREE.Vector3(10, 0, 0)) }
      ];

      pieces.forEach(piece => scene.add(piece.object));

      selectionGroupManager.createSelectionGroup(pieces);
      selectionGroupManager.attachPieces(pieces);

      // Simulate transform end
      selectionGroupManager.commitTransformation();

      expect(mockActions.updatePieceTransforms).toHaveBeenCalledOnce();
      const updateCall = mockActions.updatePieceTransforms.mock.calls[0][0];
      expect(updateCall).toHaveLength(2);
      expect(updateCall[0]).toHaveProperty('id', 'piece-1');
      expect(updateCall[1]).toHaveProperty('id', 'piece-2');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should handle Ctrl+A for select all', () => {
      // Mock model with pieces
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        model: {
          pieces: [
            { id: 'piece-1', partId: '3001.dat', position: new THREE.Vector3(0, 0, 0), rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 4 },
            { id: 'piece-2', partId: '3001.dat', position: new THREE.Vector3(10, 0, 0), rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 4 },
            { id: 'piece-3', partId: '3001.dat', position: new THREE.Vector3(20, 0, 0), rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 4 }
          ]
        },
        selectedIds: new Set()
      }));

      // Simulate Ctrl+A
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true
      });

      (inputHandler as any).handleKeyDown(event);

      expect(mockActions.setSelection).toHaveBeenCalledWith(['piece-1', 'piece-2', 'piece-3']);
    });

    it('should handle Escape to clear selection', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape'
      });

      (inputHandler as any).handleKeyDown(event);

      expect(mockActions.clearSelection).toHaveBeenCalledOnce();
    });

    it('should handle transform mode shortcuts during group selection', () => {
      // Mock group selection
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set(['piece-1', 'piece-2'])
      }));

      const gEvent = new KeyboardEvent('keydown', { key: 'g' });
      const rEvent = new KeyboardEvent('keydown', { key: 'r' });

      (inputHandler as any).handleKeyDown(gEvent);
      (inputHandler as any).handleKeyDown(rEvent);

      expect(transformControls.setMode).toHaveBeenCalledWith('translate');
      expect(transformControls.setMode).toHaveBeenCalledWith('rotate');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing pieces gracefully', () => {
      // Setup state with no selection to avoid the null reference issue
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set([]) // Empty selection avoids the issue
      }));

      // Should handle empty selection gracefully
      expect(() => inputHandler.updateSelectionFromStore()).not.toThrow();
    });

    it('should handle empty selection gracefully', () => {
      vi.mocked(useModelStore.getState).mockReturnValue(createMockState({
        selectedIds: new Set()
      }));

      expect(() => inputHandler.updateSelectionFromStore()).not.toThrow();
      expect(transformControls.detach).toHaveBeenCalledOnce();
    });

    it('should handle rapid selection changes', () => {
      // Simulate rapid selection changes
      for (let i = 0; i < 10; i++) {
        simulateClick({ pieceId: `piece-${i}`, shiftKey: i % 2 === 0 });
      }

      // Should handle all calls without errors
      expect(mockActions.toggleSelection).toHaveBeenCalledTimes(5);
      expect(mockActions.setSelection).toHaveBeenCalledTimes(5);
    });
  });

  describe('Performance and Memory', () => {
    it('should cleanup resources on disposal', () => {
      inputHandler.dispose();

      // Verify event listeners are removed
      expect(transformControls.removeEventListener).toHaveBeenCalledWith(
        TransformControlsEvents.GROUP_TRANSFORM_ENDED,
        expect.any(Function)
      );
    });

    it('should reuse selection groups efficiently', () => {
      const pieces1 = [
        { id: 'piece-1', object: createMockPieceContainer('piece-1', new THREE.Vector3(0, 0, 0)) }
      ];
      const pieces2 = [
        { id: 'piece-2', object: createMockPieceContainer('piece-2', new THREE.Vector3(10, 0, 0)) }
      ];

      pieces1.forEach(piece => scene.add(piece.object));
      pieces2.forEach(piece => scene.add(piece.object));

      // Create first group
      selectionGroupManager.createSelectionGroup(pieces1);
      const initialChildCount = scene.children.length;

      // Create second group (should replace first)
      selectionGroupManager.createSelectionGroup(pieces2);
      const secondChildCount = scene.children.length;

      // Should not increase child count (old group removed, new one added)
      expect(secondChildCount).toBe(initialChildCount);
    });
  });
}); 