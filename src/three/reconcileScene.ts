import { LDrawModel } from '../ldraw/LDrawDataModels';
import { SceneManager } from './SceneManager';
import { positionsEqual, transformsEqual } from './LDrawTransforms';

// Helper functions now imported from LDrawTransforms

/**
 * Interface for reconciliation statistics
 */
export interface ReconciliationStats {
  piecesAdded: number;
  piecesRemoved: number;
  piecesUpdated: number;
  totalPieces: number;
  reconciliationTime: number;
}

/**
 * Smart scene reconciliation function that efficiently updates only changed objects
 * 
 * @param sceneManager The SceneManager instance to update
 * @param newModel The new LDraw model to reconcile against
 * @returns Statistics about the reconciliation process
 */
export async function reconcileScene(
  sceneManager: SceneManager,
  newModel: LDrawModel
): Promise<ReconciliationStats> {
  const startTime = performance.now();
  const stats: ReconciliationStats = {
    piecesAdded: 0,
    piecesRemoved: 0,
    piecesUpdated: 0,
    totalPieces: newModel.pieces.length,
    reconciliationTime: 0
  };

  // Get existing pieces in the scene
  const existingPieces = sceneManager.getPieces();
  const existingPieceIds = new Set(existingPieces.keys());

  // Create a map of new pieces for efficient lookup
  const newPieceMap = new Map(newModel.pieces.map(p => [p.id, p]));

  console.log(`🔄 Starting scene reconciliation: ${existingPieceIds.size} existing, ${newModel.pieces.length} new`);

  // Step 0: Ensure the PieceManager has the model loaded
  // This is required for addPiece() to work properly
  const pieceManager = sceneManager.getPieceManager();
  if (pieceManager) {
    pieceManager.setLDrawModel(newModel);
  }

  // Step 1: Remove deleted pieces
  for (const existingId of existingPieceIds) {
    if (!newPieceMap.has(existingId)) {
      console.log(`➖ Removing piece: ${existingId}`);
      sceneManager.removePiece(existingId);
      stats.piecesRemoved++;
    }
  }

  // Step 2: Add new pieces and update existing ones
  const updatePromises: Promise<void>[] = [];

  for (const piece of newModel.pieces) {
    const existingPiece = sceneManager.getPieceById(piece.id);
    
    if (!existingPiece) {
      // New piece - add it
      console.log(`➕ Adding new piece: ${piece.id} (${piece.partId})`);
      stats.piecesAdded++; // Increment synchronously
      updatePromises.push(
        sceneManager.addPiece(piece)
          .then(() => {}) // Normalize to void return type
          .catch(error => {
            console.error(`Failed to add piece ${piece.id}:`, error);
            stats.piecesAdded--; // Decrement on failure
          })
      );
    } else {
      // Existing piece - check if it needs updates
      const current = existingPiece.piece;
      const needsUpdate = 
        !positionsEqual(current.position, piece.position) ||
        !transformsEqual(current.rotationMatrix, piece.rotationMatrix) ||
        current.colorCode !== piece.colorCode ||
        current.partId !== piece.partId;

      if (needsUpdate) {
        console.log(`🔄 Updating piece: ${piece.id}`, {
          positionChanged: !positionsEqual(current.position, piece.position),
          rotationChanged: !transformsEqual(current.rotationMatrix, piece.rotationMatrix),
          colorChanged: current.colorCode !== piece.colorCode,
          partChanged: current.partId !== piece.partId
        });
        
        sceneManager.updatePiece(piece.id, {
          position: piece.position,
          rotationMatrix: piece.rotationMatrix,
          colorCode: piece.colorCode,
          partId: piece.partId
        });

        stats.piecesUpdated++;
      }
    }
  }

  // Wait for all async operations to complete
  await Promise.all(updatePromises);

  stats.reconciliationTime = performance.now() - startTime;

  console.log(`✅ Scene reconciliation complete:`, {
    added: stats.piecesAdded,
    removed: stats.piecesRemoved,
    updated: stats.piecesUpdated,
    total: stats.totalPieces,
    time: `${stats.reconciliationTime.toFixed(2)}ms`
  });

  return stats;
}

/**
 * Debounced reconciliation wrapper to prevent excessive updates
 */
export function createDebouncedReconciler(
  sceneManager: SceneManager,
  debounceMs: number = 100
): (newModel: LDrawModel) => Promise<ReconciliationStats> {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingModel: LDrawModel | null = null;
  let resolvePromise: ((stats: ReconciliationStats) => void) | null = null;

  return (newModel: LDrawModel): Promise<ReconciliationStats> => {
    pendingModel = newModel;

    return new Promise((resolve) => {
      resolvePromise = resolve;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        if (pendingModel && resolvePromise) {
          try {
            const stats = await reconcileScene(sceneManager, pendingModel);
            resolvePromise(stats);
          } catch (error) {
            console.error('Reconciliation error:', error);
            // Return error stats
            resolvePromise({
              piecesAdded: 0,
              piecesRemoved: 0,
              piecesUpdated: 0,
              totalPieces: pendingModel?.pieces.length || 0,
              reconciliationTime: 0
            });
          }
          
          timeoutId = null;
          pendingModel = null;
          resolvePromise = null;
        }
      }, debounceMs);
    });
  };
} 