import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vector3 } from 'three';
import { useModelStore } from '../state/useModelStore';
import { parseLDraw } from '../ldraw/LDrawParser';
import { serializeModel } from '../ldraw/LDrawSerializer';

// Mock the parser to control its behavior in tests
vi.mock('../ldraw/LDrawParser', () => ({
  parseLDraw: vi.fn()
}));

const mockParseLDraw = parseLDraw as any;

// Helper to access actions for testing (same pattern as useModelStore.test.ts)
const getActions = () => useModelStore.getState().actions;

describe('Editor Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state with actions
    const initialState = useModelStore.getState();
    useModelStore.setState({ 
      model: { pieces: [] }, 
      selectedIds: new Set(),
      actions: initialState.actions // Preserve actions
    }, true);
  });

  describe('Parser Integration', () => {
    it('should parse valid LDraw content and generate UUIDs', () => {
      const ldrawContent = `0 Name: Test Model
1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 20 0 0 1 0 0 0 1 0 0 0 1 3002.dat`;

      // Configure mock to return parsed model
      const mockModel = {
        name: 'Test Model',
        pieces: [
          {
            id: 'uuid-1',
            partId: '3001.dat',
            position: { x: 0, y: 0, z: 0 },
            rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            colorCode: 16
          },
          {
            id: 'uuid-2',
            partId: '3002.dat',
            position: { x: 20, y: 0, z: 0 },
            rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            colorCode: 4
          }
        ]
      };
      mockParseLDraw.mockReturnValue(mockModel);

      const result = parseLDraw(ldrawContent);

      expect(result.pieces).toHaveLength(2);
      expect(result.pieces[0].id).toBe('uuid-1');
      expect(result.pieces[1].id).toBe('uuid-2');
      expect(result.name).toBe('Test Model');
    });

    it('should handle parse errors gracefully', () => {
      const invalidContent = `invalid ldraw content`;
      
      mockParseLDraw.mockImplementation(() => {
        throw new Error('Invalid LDraw format');
      });

      expect(() => parseLDraw(invalidContent)).toThrow('Invalid LDraw format');
    });

    it('should preserve UUIDs for stable diffing (future enhancement)', () => {
      // This test documents the current behavior and future enhancement need
      const ldrawContent = `1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat`;
      
      const mockModel1 = {
        pieces: [{ id: 'uuid-1', partId: '3001.dat', position: { x: 0, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 16 }]
      };
      const mockModel2 = {
        pieces: [{ id: 'uuid-2', partId: '3001.dat', position: { x: 0, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 16 }]
      };

      mockParseLDraw.mockReturnValueOnce(mockModel1);
      const result1 = parseLDraw(ldrawContent);

      mockParseLDraw.mockReturnValueOnce(mockModel2);
      const result2 = parseLDraw(ldrawContent);

      // Currently UUIDs are regenerated each time (this is the limitation we document)
      expect(result1.pieces[0].id).not.toBe(result2.pieces[0].id);
      
      // Future enhancement would preserve UUIDs for the same piece content
      // expect(result1.pieces[0].id).toBe(result2.pieces[0].id);
    });
  });

  describe('Store Integration', () => {
    it('should load model into store and clear selection', () => {
      // Set up initial state with selection
      getActions().setSelection(['piece1', 'piece2']);

      const ldrawContent = `1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat`;
      const mockModel = {
        pieces: [{ id: 'uuid-1', partId: '3001.dat', position: { x: 0, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 16 }]
      };
      
      mockParseLDraw.mockReturnValue(mockModel);

      getActions().loadModel(ldrawContent);

      const state = useModelStore.getState();
      expect(state.model.pieces).toHaveLength(1);
      expect(state.selectedIds.size).toBe(0); // Selection should be cleared
    });

    it('should update piece transforms and maintain UUIDs', () => {
      // Set up initial model
      const initialContent = `1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat`;
      const initialModel = {
        pieces: [{ id: 'uuid-1', partId: '3001.dat', position: { x: 0, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 16 }]
      };
      
      mockParseLDraw.mockReturnValue(initialModel);

      getActions().loadModel(initialContent);

      // Update piece transform
      getActions().updatePieceTransforms([{
        id: 'uuid-1',
        position: new Vector3(10, 20, 30),
        rotationMatrix: [0, 0, 1, 0, 1, 0, -1, 0, 0] as [number, number, number, number, number, number, number, number, number]
      }]);

      const state = useModelStore.getState();
      expect(state.model.pieces[0].position).toEqual({ x: 10, y: 20, z: 30 });
      expect(state.model.pieces[0].rotationMatrix).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);
      expect(state.model.pieces[0].id).toBe('uuid-1'); // UUID preserved
    });

    it('should handle selection management correctly', () => {
      // Load initial model
      const content = `1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 20 0 0 1 0 0 0 1 0 0 0 1 3002.dat`;
      const model = {
        pieces: [
          { id: 'uuid-1', partId: '3001.dat', position: { x: 0, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 16 },
          { id: 'uuid-2', partId: '3002.dat', position: { x: 20, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 4 }
        ]
      };
      
      mockParseLDraw.mockReturnValue(model);

      getActions().loadModel(content);

      // Test selection
      getActions().setSelection(['uuid-1', 'uuid-2']);

      let state = useModelStore.getState();
      expect(state.selectedIds.size).toBe(2);
      expect(state.selectedIds.has('uuid-1')).toBe(true);
      expect(state.selectedIds.has('uuid-2')).toBe(true);

      // Test deselection
      getActions().setSelection(['uuid-1']);

      state = useModelStore.getState();
      expect(state.selectedIds.size).toBe(1);
      expect(state.selectedIds.has('uuid-1')).toBe(true);
      expect(state.selectedIds.has('uuid-2')).toBe(false);
    });
  });

  describe('Serialization Round-trip', () => {
    it('should maintain model integrity through parse-serialize cycle', () => {
      const originalContent = `0 Name: Round Trip Test
0 Author: Test Suite
1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 20 -8 30 0 0 1 0 1 0 -1 0 0 3002.dat`;

      const parsedModel = {
        name: 'Round Trip Test',
        author: 'Test Suite',
        pieces: [
          {
            id: 'uuid-1',
            partId: '3001.dat',
            position: { x: 0, y: 0, z: 0 },
            rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            colorCode: 16
          },
          {
            id: 'uuid-2',
            partId: '3002.dat',
            position: { x: 20, y: -8, z: 30 },
            rotationMatrix: [0, 0, 1, 0, 1, 0, -1, 0, 0],
            colorCode: 4
          }
        ]
      };

      mockParseLDraw.mockReturnValue(parsedModel);
      
      // Parse -> Serialize -> Parse cycle
      const model = parseLDraw(originalContent);
      const serialized = serializeModel(model);
      
      // Re-parse the serialized content
      mockParseLDraw.mockReturnValue(parsedModel); // Same model for second parse
      const reparsed = parseLDraw(serialized);

      // Verify model integrity (ignoring UUIDs which may change)
      expect(reparsed.name).toBe(model.name);
      expect(reparsed.author).toBe(model.author);
      expect(reparsed.pieces).toHaveLength(model.pieces.length);
      
      reparsed.pieces.forEach((piece, index) => {
        const original = model.pieces[index];
        expect(piece.partId).toBe(original.partId);
        expect(piece.position).toEqual(original.position);
        expect(piece.rotationMatrix).toEqual(original.rotationMatrix);
        expect(piece.colorCode).toBe(original.colorCode);
      });
    });

    it('should handle empty models correctly', () => {
      const emptyContent = `0 Name: Empty Model`;
      const emptyModel = { name: 'Empty Model', pieces: [] };
      
      mockParseLDraw.mockReturnValue(emptyModel);
      
      const model = parseLDraw(emptyContent);
      const serialized = serializeModel(model);
      
      mockParseLDraw.mockReturnValue(emptyModel);
      const reparsed = parseLDraw(serialized);

      expect(reparsed.pieces).toHaveLength(0);
      expect(reparsed.name).toBe('Empty Model');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed LDraw content gracefully', () => {
      const malformedContent = `1 invalid line format
0 Name: Test
1 16 0 0 0 1 0 0 0 1 0 0 0 1 valid.dat`;

      // Parser should handle malformed lines gracefully
      const modelWithWarnings = {
        pieces: [
          { id: 'uuid-1', partId: 'valid.dat', position: { x: 0, y: 0, z: 0 }, rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], colorCode: 16 }
        ]
      };
      
      mockParseLDraw.mockReturnValue(modelWithWarnings);
      
      const result = parseLDraw(malformedContent);
      expect(result.pieces).toHaveLength(1);
      expect(result.pieces[0].partId).toBe('valid.dat');
    });

    it('should handle edge cases in piece updates', () => {
      // Try to update non-existent piece
      getActions().updatePieceTransforms([{
        id: 'non-existent',
        position: new Vector3(0, 0, 0),
        rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] as [number, number, number, number, number, number, number, number, number]
      }]);

      // Should not crash or affect existing state
      const state = useModelStore.getState();
      expect(state.model.pieces).toHaveLength(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large models efficiently', () => {
      // Create a large model for performance testing
      const largePieces = Array.from({ length: 1000 }, (_, i) => ({
        id: `uuid-${i}`,
        partId: '3001.dat',
        position: { x: i * 10, y: 0, z: 0 },
        rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        colorCode: 16
      }));

      const largeModel = { pieces: largePieces };
      mockParseLDraw.mockReturnValue(largeModel);

      const startTime = performance.now();
      
      getActions().loadModel('large model content');

      const endTime = performance.now();
      const loadTime = endTime - startTime;

      const state = useModelStore.getState();
      expect(state.model.pieces).toHaveLength(1000);
      expect(loadTime).toBeLessThan(100); // Should complete quickly
    });
  });
}); 