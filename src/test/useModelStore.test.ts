import { describe, it, expect, beforeEach } from 'vitest';
import { useModelStore, TransformUpdate } from '../state/useModelStore';
import { Vector3 } from 'three';
import { v4 as mockUuid } from 'uuid';

const initialState = useModelStore.getState();
const sampleText = "1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat";

// Helper to access actions for testing
const getActions = () => useModelStore.getState().actions;

describe('Zustand Model Store', () => {
  beforeEach(() => {
    // Reset the store and mock
    useModelStore.setState(initialState, true);
    (mockUuid as any).mockClear();
    (mockUuid as any).mockReturnValue('test-id-1');
  });

  it('should initialize with empty model and selection', () => {
    const state = useModelStore.getState();
    expect(state.model.pieces.length).toBe(0);
    expect(state.selectedIds.size).toBe(0);
    expect(state.actions).toBeDefined();
  });

  it('should load a model and clear selection', () => {
    // First set some selection
    getActions().setSelection(['some-id']);
    expect(useModelStore.getState().selectedIds.size).toBe(1);

    // Then load a model
    getActions().loadModel(sampleText);
    
    const state = useModelStore.getState();
    expect(state.model.pieces.length).toBe(1);
    expect(state.model.pieces[0].id).toBe('test-id-1');
    expect(state.selectedIds.size).toBe(0); // Should be cleared
  });

  it('should handle selection updates', () => {
    getActions().setSelection(['id1', 'id2', 'id3']);
    
    const state = useModelStore.getState();
    expect(state.selectedIds.size).toBe(3);
    expect(state.selectedIds.has('id1')).toBe(true);
    expect(state.selectedIds.has('id2')).toBe(true);
    expect(state.selectedIds.has('id3')).toBe(true);
  });

  it('should update piece transforms immutably', () => {
    // 1. Setup
    getActions().loadModel(sampleText);
    const state1 = useModelStore.getState();
    const pieceToUpdate = state1.model.pieces[0];
    const newPosition = new Vector3(100, 100, 100);

    // 2. Act
    const update: TransformUpdate = {
      id: pieceToUpdate.id,
      position: newPosition,
      rotationMatrix: pieceToUpdate.rotationMatrix,
    };
    getActions().updatePieceTransforms([update]);

    // 3. Assert
    const state2 = useModelStore.getState();
    const updatedPiece = state2.model.pieces[0];

    expect(updatedPiece.position).toEqual(newPosition);

    // Check Immutability
    expect(state2.model).not.toBe(state1.model); // Model reference must change
    expect(updatedPiece).not.toBe(pieceToUpdate); // Piece reference must change
    expect(pieceToUpdate.position.x).toBe(0); // Original object must not mutate
  });

  it('should update only specified pieces in transforms', () => {
    // Setup model with multiple pieces
    const multiPieceText = `1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 10 10 10 1 0 0 0 1 0 0 0 1 3002.dat`;
    
    (mockUuid as any).mockReturnValueOnce('piece-1').mockReturnValueOnce('piece-2');
    getActions().loadModel(multiPieceText);
    
    const state1 = useModelStore.getState();
    const piece1 = state1.model.pieces[0];
    const piece2 = state1.model.pieces[1];

    // Update only piece-1
    const update: TransformUpdate = {
      id: 'piece-1',
      position: new Vector3(999, 999, 999),
      rotationMatrix: piece1.rotationMatrix,
    };
    getActions().updatePieceTransforms([update]);

    const state2 = useModelStore.getState();
    const updatedPiece1 = state2.model.pieces[0];
    const unchangedPiece2 = state2.model.pieces[1];

    // Piece 1 should be updated
    expect(updatedPiece1.position.x).toBe(999);
    expect(updatedPiece1).not.toBe(piece1);

    // Piece 2 should remain unchanged (same reference for optimization)
    expect(unchangedPiece2).toBe(piece2);
    expect(unchangedPiece2.position.x).toBe(10);
  });

  it('should handle multiple transform updates in one call', () => {
    // Setup model with multiple pieces
    const multiPieceText = `1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
1 4 10 10 10 1 0 0 0 1 0 0 0 1 3002.dat`;
    
    (mockUuid as any).mockReturnValueOnce('piece-1').mockReturnValueOnce('piece-2');
    getActions().loadModel(multiPieceText);
    
    const state1 = useModelStore.getState();

    // Update both pieces
    const updates: TransformUpdate[] = [
      {
        id: 'piece-1',
        position: new Vector3(100, 100, 100),
        rotationMatrix: state1.model.pieces[0].rotationMatrix,
      },
      {
        id: 'piece-2',
        position: new Vector3(200, 200, 200),
        rotationMatrix: state1.model.pieces[1].rotationMatrix,
      }
    ];
    getActions().updatePieceTransforms(updates);

    const state2 = useModelStore.getState();
    
    expect(state2.model.pieces[0].position.x).toBe(100);
    expect(state2.model.pieces[1].position.x).toBe(200);
  });

  it('should handle transform updates for non-existent pieces gracefully', () => {
    getActions().loadModel(sampleText);
    // Try to update a piece that doesn't exist
    const update: TransformUpdate = {
      id: 'non-existent-id',
      position: new Vector3(999, 999, 999),
      rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    };
    getActions().updatePieceTransforms([update]);

    const state2 = useModelStore.getState();
    
    // Model should remain unchanged
    expect(state2.model.pieces.length).toBe(1);
    expect(state2.model.pieces[0].position.x).toBe(0); // Original position
  });

  it('should handle parsing errors gracefully', () => {
    const invalidLDraw = "invalid ldraw content that will cause parsing to fail";
    
    getActions().loadModel(invalidLDraw);
    
    const state = useModelStore.getState();
    // Should not crash and should keep previous state or have empty model
    expect(state.model).toBeDefined();
  });
}); 