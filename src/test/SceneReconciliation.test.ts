import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconcileScene, createDebouncedReconciler } from '../three/reconcileScene';
import { positionsEqual, transformsEqual } from '../three/LDrawTransforms';
import { LDrawModel, LDrawPiece } from '../ldraw/LDrawDataModels';
import * as THREE from 'three';

// Create mock SceneManager
const createMockSceneManager = () => {
  const mockPieces = new Map<string, THREE.Object3D>();
  const mockPieceData = new Map<string, { piece: LDrawPiece; object: THREE.Object3D }>();

  return {
    getPieces: vi.fn(() => mockPieces),
    getPieceById: vi.fn((id: string) => mockPieceData.get(id) || null),
    addPiece: vi.fn(async (piece: LDrawPiece) => {
      const object = new THREE.Group();
      object.name = piece.id;
      mockPieces.set(piece.id, object);
      mockPieceData.set(piece.id, { piece, object });
      return object;
    }),
    removePiece: vi.fn((id: string) => {
      mockPieces.delete(id);
      mockPieceData.delete(id);
    }),
    updatePiece: vi.fn((id: string, updates: Partial<LDrawPiece>) => {
      const existing = mockPieceData.get(id);
      if (existing) {
        const updatedPiece = { ...existing.piece, ...updates };
        mockPieceData.set(id, { ...existing, piece: updatedPiece });
      }
    }),
    getPieceManager: vi.fn(() => ({
      setLDrawModel: vi.fn()
    })),
    // Mock internal state for testing
    _mockPieces: mockPieces,
    _mockPieceData: mockPieceData
  } as any;
};

const createTestPiece = (id: string, partId: string = '3001.dat'): LDrawPiece => ({
  id,
  partId,
  position: new THREE.Vector3(0, 0, 0),
  rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  colorCode: 16
});

describe('Scene Reconciliation', () => {
  let mockSceneManager: ReturnType<typeof createMockSceneManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSceneManager = createMockSceneManager();
  });

  describe('Helper Functions', () => {
    it('should correctly compare positions with epsilon tolerance', () => {
      const pos1 = { x: 1.0, y: 2.0, z: 3.0 };
      const pos2 = { x: 1.0005, y: 2.0003, z: 3.0001 };
      const pos3 = { x: 1.5, y: 2.0, z: 3.0 };

      expect(positionsEqual(pos1, pos2)).toBe(true); // Within tolerance
      expect(positionsEqual(pos1, pos3)).toBe(false); // Outside tolerance
      expect(positionsEqual(pos1, pos1)).toBe(true); // Exact match
    });

    it('should correctly compare rotation matrices with epsilon tolerance', () => {
      const rot1 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const rot2 = [1.00001, 0.00002, 0, 0, 1.00001, 0, 0, 0, 1]; // Smaller differences
      const rot3 = [0, 0, 1, 0, 1, 0, -1, 0, 0]; // 90° Y rotation

      expect(transformsEqual(rot1, rot2)).toBe(true); // Within tolerance
      expect(transformsEqual(rot1, rot3)).toBe(false); // Different rotation
      expect(transformsEqual(rot1, rot1)).toBe(true); // Exact match
    });

    it('should handle invalid rotation matrices', () => {
      const validRot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const invalidRot = [1, 0, 0]; // Too short

      expect(transformsEqual(validRot, invalidRot)).toBe(false);
      expect(transformsEqual(invalidRot, validRot)).toBe(false);
    });
  });

  describe('reconcileScene Function', () => {
    it('should add new pieces to empty scene', async () => {
      const newModel: LDrawModel = {
        pieces: [
          createTestPiece('piece1', '3001.dat'),
          createTestPiece('piece2', '3002.dat')
        ]
      };

      const stats = await reconcileScene(mockSceneManager, newModel);

      expect(stats.piecesAdded).toBe(2);
      expect(stats.piecesRemoved).toBe(0);
      expect(stats.piecesUpdated).toBe(0);
      expect(stats.totalPieces).toBe(2);
      expect(mockSceneManager.addPiece).toHaveBeenCalledTimes(2);
    });

    it('should remove deleted pieces from scene', async () => {
      // Setup existing pieces
      const existingPiece1 = createTestPiece('piece1');
      const existingPiece2 = createTestPiece('piece2');
      await mockSceneManager.addPiece(existingPiece1);
      await mockSceneManager.addPiece(existingPiece2);

      // New model with only one piece
      const newModel: LDrawModel = {
        pieces: [existingPiece1]
      };

      const stats = await reconcileScene(mockSceneManager, newModel);

      expect(stats.piecesAdded).toBe(0);
      expect(stats.piecesRemoved).toBe(1);
      expect(stats.piecesUpdated).toBe(0);
      expect(mockSceneManager.removePiece).toHaveBeenCalledWith('piece2');
    });

    it('should update modified pieces', async () => {
      // Setup existing piece
      const existingPiece = createTestPiece('piece1');
      await mockSceneManager.addPiece(existingPiece);

      // Create modified version
      const modifiedPiece: LDrawPiece = {
        ...existingPiece,
        position: new THREE.Vector3(10, 20, 30),
        colorCode: 4
      };

      const newModel: LDrawModel = {
        pieces: [modifiedPiece]
      };

      const stats = await reconcileScene(mockSceneManager, newModel);

      expect(stats.piecesAdded).toBe(0);
      expect(stats.piecesRemoved).toBe(0);
      expect(stats.piecesUpdated).toBe(1);
      expect(mockSceneManager.updatePiece).toHaveBeenCalledWith('piece1', {
        position: { x: 10, y: 20, z: 30 },
        rotationMatrix: modifiedPiece.rotationMatrix,
        colorCode: 4,
        partId: '3001.dat'
      });
    });

    it('should not update unchanged pieces', async () => {
      // Setup existing piece
      const existingPiece = createTestPiece('piece1');
      await mockSceneManager.addPiece(existingPiece);

      // Same piece (no changes)
      const newModel: LDrawModel = {
        pieces: [existingPiece]
      };

      const stats = await reconcileScene(mockSceneManager, newModel);

      expect(stats.piecesAdded).toBe(0);
      expect(stats.piecesRemoved).toBe(0);
      expect(stats.piecesUpdated).toBe(0);
      expect(mockSceneManager.updatePiece).not.toHaveBeenCalled();
    });

    it('should handle complex reconciliation with add, remove, and update', async () => {
      // Setup existing pieces
      const piece1 = createTestPiece('piece1');
      const piece2 = createTestPiece('piece2');
      const piece3 = createTestPiece('piece3');
      await mockSceneManager.addPiece(piece1);
      await mockSceneManager.addPiece(piece2);
      await mockSceneManager.addPiece(piece3);

      // New model:
      // - Keep piece1 unchanged
      // - Remove piece2
      // - Update piece3
      // - Add piece4
      const updatedPiece3 = { ...piece3, position: new THREE.Vector3(5, 5, 5) };
      const newPiece4 = createTestPiece('piece4');

      const newModel: LDrawModel = {
        pieces: [piece1, updatedPiece3, newPiece4]
      };

      const stats = await reconcileScene(mockSceneManager, newModel);

      expect(stats.piecesAdded).toBe(1);
      expect(stats.piecesRemoved).toBe(1);
      expect(stats.piecesUpdated).toBe(1);
      expect(stats.totalPieces).toBe(3);

      expect(mockSceneManager.removePiece).toHaveBeenCalledWith('piece2');
      expect(mockSceneManager.addPiece).toHaveBeenCalledWith(newPiece4);
      expect(mockSceneManager.updatePiece).toHaveBeenCalledWith('piece3', expect.objectContaining({
        position: { x: 5, y: 5, z: 5 }
      }));
    });

    it('should handle errors gracefully during piece addition', async () => {
      // Make addPiece throw an error
      mockSceneManager.addPiece.mockRejectedValueOnce(new Error('Failed to add piece'));

      const newModel: LDrawModel = {
        pieces: [createTestPiece('piece1')]
      };

      const stats = await reconcileScene(mockSceneManager, newModel);

      // Should complete without throwing, but piece won't be added
      expect(stats.totalPieces).toBe(1);
      expect(stats.reconciliationTime).toBeGreaterThan(0);
    });
  });

  describe('Debounced Reconciler', () => {
    it('should debounce multiple rapid updates', async () => {
      const debouncedReconciler = createDebouncedReconciler(mockSceneManager, 10); // Shorter delay for testing

      const model1: LDrawModel = { pieces: [createTestPiece('piece1')] };
      const model2: LDrawModel = { pieces: [createTestPiece('piece1'), createTestPiece('piece2')] };
      const model3: LDrawModel = { pieces: [createTestPiece('piece1'), createTestPiece('piece2'), createTestPiece('piece3')] };

      // Fire multiple updates rapidly - only the last one should be processed
      debouncedReconciler(model1);
      debouncedReconciler(model2);
      const finalResult = await debouncedReconciler(model3);

      // Should have processed the final model
      expect(finalResult.totalPieces).toBe(3);
      expect(finalResult.piecesAdded).toBe(3);
    }, 500); // Reduced timeout

    it('should handle errors in debounced reconciliation', async () => {
      const reconcileSpy = vi.spyOn(await import('../three/reconcileScene'), 'reconcileScene');
      reconcileSpy.mockRejectedValueOnce(new Error('Reconciliation failed'));

      const debouncedReconciler = createDebouncedReconciler(mockSceneManager, 10);
      const model: LDrawModel = { pieces: [createTestPiece('piece1')] };

      const stats = await debouncedReconciler(model);

      // Should return error stats instead of throwing
      // Note: pieces are counted synchronously, then async operations fail
      expect(stats.piecesAdded).toBe(1); // Counted before failure
      expect(stats.piecesRemoved).toBe(0);
      expect(stats.piecesUpdated).toBe(0);
      expect(stats.totalPieces).toBe(1); // Should be the model piece count
      expect(stats.reconciliationTime).toBeGreaterThanOrEqual(0);

      reconcileSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    it('should complete reconciliation in reasonable time', async () => {
      // Clear all mocks and restore any spies before performance test
      vi.clearAllMocks();
      vi.restoreAllMocks();
      
      // Reset mockSceneManager for this test to avoid interfering mocks
      const cleanMockSceneManager = createMockSceneManager();

      // Create a larger model for performance testing
      const pieces: LDrawPiece[] = [];
      for (let i = 0; i < 100; i++) {
        pieces.push(createTestPiece(`piece${i}`, '3001.dat'));
      }

      const newModel: LDrawModel = { pieces };
      const startTime = performance.now();
      
      const stats = await reconcileScene(cleanMockSceneManager, newModel);
      
      const endTime = performance.now();
      const actualTime = endTime - startTime;

      expect(stats.piecesAdded).toBe(100);
      expect(stats.reconciliationTime).toBeGreaterThan(0);
      expect(actualTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
}); 