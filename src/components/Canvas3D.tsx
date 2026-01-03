import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager, SceneEvents } from '../three/SceneManager';
import { SelectionManager } from '../three/SelectionManager';
import { useModel, useSelection, useMousePosition, useActions, TransformUpdate } from '../state/useModelStore';
import { LDrawModel } from '../ldraw/LDrawDataModels';

import { createDebouncedReconciler, ReconciliationStats } from '../three/reconcileScene';
import {
  TransformControlsManager,
  TransformMode,
  TransformControlsEvents,
  Axis
} from '../three/TransformControlsManager';
import { InputEventHandler } from '../three/InputEventHandler';
import { SelectionGroupManager } from '../three/SelectionGroupManager';
import * as THREE from 'three';
import { transformMatrixToEuler, threeToLDrawPosition } from '../three/LDrawTransforms';
import { centerCameraOnGroup } from '../three/utils';

/**
 * The main 3D canvas component
 */
export const Canvas3D: React.FC = () => {
  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const transformControlsManagerRef = useRef<TransformControlsManager | null>(null);
  const inputHandlerRef = useRef<InputEventHandler | null>(null);
  const debouncedReconcilerRef = useRef<((model: LDrawModel) => Promise<ReconciliationStats>) | null>(null);

  // State
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModelSignature, setLastModelSignature] = useState<string>('');

  // Managers
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const selectionManagerRef = useRef<SelectionManager | null>(null);
  const selectionGroupManagerRef = useRef<SelectionGroupManager | null>(null);

  // Zustand store hooks for model, selection, and actions
  const model = useModel();
  const selection = useSelection();
  const mousePosition = useMousePosition();
  const actions = useActions();

  // Handle Select All functionality
  const handleSelectAll = useCallback(() => {
    const allPieceIds = model.pieces.map(piece => piece.id);
    if (allPieceIds.length > 0) {
      actions.setSelection(allPieceIds);
      console.log(`Selected all ${allPieceIds.length} pieces via Select All button`);
    } else {
      console.log('No pieces to select');
    }
  }, [model.pieces, actions]);

  // Helper function to reset camera after reconciliation
  const resetCameraToModel = useCallback(() => {
    const sceneManager = sceneManagerRef.current;
    if (!sceneManager) return;

    const modelGroup = sceneManager.getModelGroup();
    if (modelGroup && modelGroup.children.length > 0) {
      console.log('Auto-centering camera after reconciliation complete');

      centerCameraOnGroup(
        modelGroup,
        sceneManager.camera,
        sceneManager.getOrbitControls()
      );
    } else {
      // Fallback to default position if no model rendered
      console.log('Resetting camera to default (no rendered model)');
      const camera = sceneManager.camera;
      const controls = sceneManager.getOrbitControls();
      camera.position.set(100, 100, 100);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, []);

  // Smart scene reconciliation on model changes
  useEffect(() => {
    if (!sceneManagerRef.current) return;

    // Handle empty models - clear the scene
    if (model.pieces.length === 0) {
      console.log('Clearing scene for empty model');
      // Clear the scene but don't return - let camera reset logic run
      if (sceneManagerRef.current.scene) {
        // Remove all existing pieces from scene
        const objectsToRemove: THREE.Object3D[] = [];
        sceneManagerRef.current.scene.traverse((child) => {
          if (child.userData.isLDrawPiece) {
            objectsToRemove.push(child);
          }
        });
        objectsToRemove.forEach(obj => sceneManagerRef.current!.scene.remove(obj));
      }
      return;
    }

    // Use debounced reconciler to efficiently update the scene for non-empty models
    if (debouncedReconcilerRef.current) {
      console.log('Model changed, triggering scene reconciliation');
      debouncedReconcilerRef.current(model)
        .then((stats) => {
          console.log('Scene reconciliation complete:', stats);
        })
        .catch((error) => {
          console.error('Scene reconciliation failed:', error);
        });
    }
  }, [model]);

  // Camera reset on new model load (not on selection/transform changes)
  useEffect(() => {
    if (!sceneManagerRef.current) return;

    // Create signature based on piece count and model name to detect actual model changes
    const currentSignature = `${model.pieces.length}-${model.name || 'unnamed'}`;

    if (currentSignature !== lastModelSignature) {
      console.log('Model signature changed:', {
        from: lastModelSignature,
        to: currentSignature,
        pieceCount: model.pieces.length
      });

      // This is a new/different model - handle appropriately
      if (model.pieces.length === 0) {
        // Empty model - reset camera to default position
        console.log('Resetting camera to default for empty model');
        const camera = sceneManagerRef.current.camera;
        const controls = sceneManagerRef.current.getOrbitControls();
        camera.position.set(100, 100, 100);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
      } else {
        // Non-empty model - trigger reconciliation and camera reset
        if (debouncedReconcilerRef.current) {
          debouncedReconcilerRef.current(model)
            .then((stats) => {
              console.log('New model reconciliation complete:', stats);

              // Reset camera now that all pieces are actually loaded and positioned
              if (stats.totalPieces > 0) {
                resetCameraToModel();
              }
            })
            .catch((error) => {
              console.error('New model reconciliation failed:', error);
            });
        }
      }

      setLastModelSignature(currentSignature);
    }
  }, [model, lastModelSignature, resetCameraToModel]);

  // Camera control functions
  const resetCamera = useCallback(() => {
    const sceneManager = sceneManagerRef.current;
    if (!sceneManager) return;

    const camera = sceneManager.camera;
    const controls = sceneManager.getOrbitControls();

    // Reset to default position and target
    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }, []);

  const topViewCamera = useCallback(() => {
    const sceneManager = sceneManagerRef.current;
    if (!sceneManager) return;

    const selectedObjects = sceneManager.getSelectedObjects();
    if (selectedObjects.length === 0) {
      // No selection - show brief feedback or just return
      console.log('No pieces selected for top view');
      return;
    }

    const camera = sceneManager.camera;
    const controls = sceneManager.getOrbitControls();

    // Calculate bounding box of selected objects
    const box = new THREE.Box3();
    selectedObjects.forEach(object => {
      box.expandByObject(object);
    });

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Calculate appropriate distance for top view
    const maxDim = Math.max(size.x, size.z); // Use X and Z for top view
    const distance = Math.max(maxDim * 2, 50); // Minimum distance of 50

    // Position camera directly above the selection
    camera.position.set(center.x, center.y + distance, center.z);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }, []);

  // Update visual selection and transform controls when store selection changes
  useEffect(() => {
    if (inputHandlerRef.current) {
      inputHandlerRef.current.updateSelectionFromStore();
    }
  }, [selection]);

  // State to force UI updates during transforms
  const [, setTransformUpdateCounter] = useState(0);

  // Handle transform changes for selected pieces
  const handleTransformChange = useCallback((): void => {
    if (!sceneManagerRef.current || selection.size === 0) return;

    // Update LDraw data for ALL selected pieces as the group moves
    sceneManagerRef.current.updateSelectedPieceTransforms();

    // Force UI update by incrementing counter
    setTransformUpdateCounter(prev => prev + 1);
  }, [selection]);

  // Handle transform end to update the model in the store
  const handleTransformEnd = useCallback((): void => {
    if (!sceneManagerRef.current) return;

    // Get the updated model with all current transforms
    const updatedModel = sceneManagerRef.current.getLDrawModel();
    if (updatedModel) {
      // Log the piece positions for debugging
      Array.from(selection).forEach(selectedId => {
        const pieceData = sceneManagerRef.current!.getPieceById(selectedId);
        if (pieceData && pieceData.piece && pieceData.piece.position) {
          const pos = pieceData.piece.position;
          console.log(`Piece ${selectedId} position: X=${pos.x.toFixed(2)}, Y=${pos.y.toFixed(2)}, Z=${pos.z.toFixed(2)}`);
        }
      });

      console.log('Transform complete - updating model in store');
      // Update the transforms in the store (this will trigger reconciliation, but should be minimal since the scene is already updated)
      const transformUpdates = Array.from(selection).map(selectedId => {
        const pieceData = sceneManagerRef.current!.getPieceById(selectedId);
        if (pieceData && pieceData.piece) {
          return {
            id: selectedId,
            position: new THREE.Vector3(
              pieceData.piece.position.x,
              pieceData.piece.position.y,
              pieceData.piece.position.z
            ),
            rotationMatrix: pieceData.piece.rotationMatrix as [number, number, number, number, number, number, number, number, number]
          };
        }
        return null;
      }).filter(Boolean) as TransformUpdate[];

      if (transformUpdates.length > 0) {
        actions.updatePieceTransforms(transformUpdates);
      }
    }
  }, [actions, selection]);

  // Handle selection changes
  const handleSelectionChange = useCallback((data: { pieceIds: string[]; objects: THREE.Object3D[]; origin?: string }) => {
    console.log(`Selection changed: count = ${data.pieceIds.length}, origin = ${data.origin}`);

    // Update selection in the store
    actions.setSelection(data.pieceIds);

    // Note: Transform controls and selection group management is handled by InputEventHandler.updateSelectionFromStore()
    // This handler only needs to update UI state and store
  }, [actions]);

  // Function to change transform mode
  const changeTransformMode = useCallback((mode: TransformMode) => {
    setTransformMode(mode);

    if (inputHandlerRef.current) {
      inputHandlerRef.current.setTransformMode(mode);
    }
  }, []);

  // Function to handle 90 degree rotations
  const handleRotate90 = useCallback((axis: Axis) => {
    inputHandlerRef.current?.rotate90DegreesForSelection(axis);
  }, []);

  // Function to handle preset scaling
  const handleScalePreset = useCallback((scaleFactor: number | 'reset') => {
    inputHandlerRef.current?.applyScalePresetForSelection(scaleFactor);
  }, []);

  // Function to get position and rotation info for selected pieces
  const getSelectionTransformInfo = useCallback(() => {
    if (!sceneManagerRef.current || selection.size === 0) {
      return null;
    }

    const selectedIds = Array.from(selection);

    if (selectedIds.length === 1) {
      // Single piece selection
      const pieceData = sceneManagerRef.current.getPieceById(selectedIds[0]);
      if (pieceData?.piece) {
        const position = pieceData.piece.position;
        const rotation = transformMatrixToEuler(pieceData.piece.rotationMatrix);
        return {
          type: 'single',
          position: { x: position.x, y: position.y, z: position.z },
          rotation,
          partId: pieceData.piece.partId
        };
      }
    } else if (selectedIds.length > 1) {
      // Multi-piece selection - get position from group, rotation from first piece
      const selectionGroup = inputHandlerRef.current?.getSelectionGroupManager()?.getSelectionGroup();

      if (selectionGroup) {
        // Get position from the group centroid and convert from Three.js to LDraw coordinates
        const threePosition = new THREE.Vector3(
          selectionGroup.position.x,
          selectionGroup.position.y,
          selectionGroup.position.z
        );
        const ldrawPosition = threeToLDrawPosition(threePosition);
        const position = {
          x: ldrawPosition.x,
          y: ldrawPosition.y,  // Now correctly converted from Three.js (+Y up) to LDraw (-Y up)
          z: ldrawPosition.z
        };

        // Get rotation from the first piece's data (since group rotation isn't preserved)
        const firstPieceData = sceneManagerRef.current!.getPieceById(selectedIds[0]);
        const rotation = firstPieceData?.piece
          ? transformMatrixToEuler(firstPieceData.piece.rotationMatrix)
          : { x: 0, y: 0, z: 0 };

        // Collect unique part IDs for the group
        const partIds = new Set<string>();
        selectedIds.forEach(id => {
          const pieceData = sceneManagerRef.current!.getPieceById(id);
          if (pieceData?.piece) {
            partIds.add(pieceData.piece.partId);
          }
        });

        return {
          type: 'group',
          position,
          rotation,
          count: selectedIds.length,
          partIds: Array.from(partIds)
        };
      } else {
        // Fallback: calculate centroid position if no group available
        let totalX = 0, totalY = 0, totalZ = 0;
        let validPieces = 0;
        const partIds = new Set<string>();

        selectedIds.forEach(id => {
          const pieceData = sceneManagerRef.current!.getPieceById(id);
          if (pieceData?.piece) {
            totalX += pieceData.piece.position.x;
            totalY += pieceData.piece.position.y;
            totalZ += pieceData.piece.position.z;
            validPieces++;
            partIds.add(pieceData.piece.partId);
          }
        });

        if (validPieces > 0) {
          const position = {
            x: totalX / validPieces,
            y: totalY / validPieces,
            z: totalZ / validPieces
          };

          // Get rotation from the first piece's data even in fallback
          const firstPieceData = sceneManagerRef.current!.getPieceById(selectedIds[0]);
          const rotation = firstPieceData?.piece
            ? transformMatrixToEuler(firstPieceData.piece.rotationMatrix)
            : { x: 0, y: 0, z: 0 };

          return {
            type: 'group',
            position,
            rotation,
            count: validPieces,
            partIds: Array.from(partIds)
          };
        }
      }
    }

    return null;
  }, [selection]);

  // Initialize the 3D scene
  useEffect(() => {
    // Capture the canvas reference immediately to avoid race conditions
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsLoading(true);
    setError(null);
    let resizeObserver: ResizeObserver | null = null;

    try {
      // Create scene manager using the captured canvas reference
      const sceneManager = new SceneManager(canvas, {
        partLoaderOptions: { partsLibraryPath: '/ldraw/' },
        backgroundColor: 0xf0f0f0,
        gridEnabled: true,
        axesEnabled: true
      });

      sceneManagerRef.current = sceneManager;
      selectionManagerRef.current = sceneManager.getSelectionManager();

      // Set up ResizeObserver to handle container size changes
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            sceneManager.handleContainerResize();
          }
        }
      });

      resizeObserver.observe(canvas);

      // Create debounced reconciler
      debouncedReconcilerRef.current = createDebouncedReconciler(sceneManager, 100);

      // Create SelectionGroupManager for multi-select functionality
      selectionGroupManagerRef.current = new SelectionGroupManager(sceneManager.scene);

      // Set up transform controls
      transformControlsManagerRef.current = new TransformControlsManager(
        sceneManager.camera,
        sceneManager.renderer,
        sceneManager.scene,
        sceneManager.getOrbitControls()
      );

      // Set up input handler with all required managers for coordinated user interaction
      // Use the captured canvas reference to avoid race conditions
      if (!canvas.isConnected) {
        console.warn('Canvas element not connected to DOM, skipping InputEventHandler setup');
        setIsLoading(false);
        return;
      }

      inputHandlerRef.current = new InputEventHandler(
        canvas,
        sceneManager,
        transformControlsManagerRef.current,
        selectionManagerRef.current,
        selectionGroupManagerRef.current
      );

      // Add event listeners
      sceneManager.addEventListener(SceneEvents.SELECTION_CHANGED, handleSelectionChange);
      transformControlsManagerRef.current.addEventListener(TransformControlsEvents.TRANSFORM_CHANGED, handleTransformChange);
      transformControlsManagerRef.current.addEventListener(TransformControlsEvents.TRANSFORM_ENDED, handleTransformEnd);

      // Load initial model if present
      if (model.pieces.length > 0) {
        console.log('Loading initial model into scene');
        debouncedReconcilerRef.current(model)
          .then((stats) => {
            console.log('Initial model loaded:', stats);
          });
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to initialize 3D scene:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }

    // Cleanup function
    return () => {
      // Disconnect ResizeObserver
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (sceneManagerRef.current) {
        sceneManagerRef.current.removeEventListener(SceneEvents.SELECTION_CHANGED, handleSelectionChange);
        sceneManagerRef.current.dispose();
      }
      if (transformControlsManagerRef.current) {
        transformControlsManagerRef.current.removeEventListener(TransformControlsEvents.TRANSFORM_CHANGED, handleTransformChange);
        transformControlsManagerRef.current.removeEventListener(TransformControlsEvents.TRANSFORM_ENDED, handleTransformEnd);
        transformControlsManagerRef.current.dispose();
      }
      if (inputHandlerRef.current) {
        inputHandlerRef.current.dispose();
      }
      if (selectionGroupManagerRef.current) {
        selectionGroupManagerRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initialize once - handlers use refs internally so no dependency issues

  if (isLoading) {
    return (
      <div className="canvas3d-loading" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        flexDirection: 'column'
      }}>
        <div>Loading 3D environment...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="canvas3d-error" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        flexDirection: 'column',
        color: 'red'
      }}>
        <div>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="canvas3d-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 3D Canvas */}
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />

      {/* Transform Controls UI */}
      <div className="transform-controls" style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '8px',
        borderRadius: '4px',
        display: 'flex',
        gap: '4px'
      }}>
        <button
          onClick={() => changeTransformMode('translate')}
          style={{
            background: transformMode === 'translate' ? '#007bff' : '#f0f0f0',
            color: transformMode === 'translate' ? 'white' : 'black',
            border: '1px solid #ccc',
            padding: '4px 8px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Move
        </button>
        <button
          onClick={() => changeTransformMode('rotate')}
          style={{
            background: transformMode === 'rotate' ? '#007bff' : '#f0f0f0',
            color: transformMode === 'rotate' ? 'white' : 'black',
            border: '1px solid #ccc',
            padding: '4px 8px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Rotate
        </button>
        <button
          onClick={() => changeTransformMode('scale')}
          style={{
            background: transformMode === 'scale' ? '#007bff' : '#f0f0f0',
            color: transformMode === 'scale' ? 'white' : 'black',
            border: '1px solid #ccc',
            padding: '4px 8px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Scale
        </button>
      </div>

      {/* Camera Controls UI */}
      <div className="camera-controls" style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '8px',
        borderRadius: '4px',
        display: 'flex',
        gap: '4px'
      }}>
        <button
          onClick={resetCamera}
          style={{
            background: '#f0f0f0',
            color: 'black',
            border: '1px solid #ccc',
            padding: '4px 8px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Reset
        </button>
        <button
          onClick={topViewCamera}
          disabled={selection.size === 0}
          style={{
            background: selection.size === 0 ? '#e0e0e0' : '#f0f0f0',
            color: selection.size === 0 ? '#888' : 'black',
            border: '1px solid #ccc',
            padding: '4px 8px',
            borderRadius: '3px',
            cursor: selection.size === 0 ? 'not-allowed' : 'pointer',
            opacity: selection.size === 0 ? 0.6 : 1
          }}
        >
          Top
        </button>
      </div>

      {/* Rotation Controls */}
      {transformMode === 'rotate' && (
        <div className="rotation-controls" style={{
          position: 'absolute',
          top: '50px',
          left: '10px',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>90° Rotations:</div>
          <button onClick={() => handleRotate90('x')} style={{ padding: '2px 6px', fontSize: '12px' }}>X+90°</button>
          <button onClick={() => handleRotate90('y')} style={{ padding: '2px 6px', fontSize: '12px' }}>Y+90°</button>
          <button onClick={() => handleRotate90('z')} style={{ padding: '2px 6px', fontSize: '12px' }}>Z+90°</button>
        </div>
      )}

      {/* Scale Controls */}
      {transformMode === 'scale' && (
        <div className="scale-controls" style={{
          position: 'absolute',
          top: '50px',
          left: '10px',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>Preset Scales:</div>
          <button onClick={() => handleScalePreset(2)} style={{ padding: '2px 6px', fontSize: '12px' }}>2x</button>
          <button onClick={() => handleScalePreset(0.5)} style={{ padding: '2px 6px', fontSize: '12px' }}>0.5x</button>
        </div>
      )}

      {/* Status Display */}
      <div className="status-display" style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <div>Pieces: {model.pieces.length}</div>
        <div>Selected: {selection.size}</div>
        {mousePosition && (
          <div>M_POS: X:{mousePosition.x.toFixed(2)} Y:{mousePosition.y.toFixed(2)} Z:{mousePosition.z.toFixed(2)}</div>
        )}
        {(() => {
          const transformInfo = getSelectionTransformInfo();
          if (transformInfo) {
            return (
              <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '4px' }}>
                {transformInfo.type === 'single' ? (
                  <>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Transform:</div>
                    <div>X: {transformInfo.position.x.toFixed(2)} Y: {transformInfo.position.y.toFixed(2)} Z: {transformInfo.position.z.toFixed(2)}</div>
                    <div>RX: {transformInfo.rotation.x.toFixed(1)}° RY: {transformInfo.rotation.y.toFixed(1)}° RZ: {transformInfo.rotation.z.toFixed(1)}°</div>
                    <div>Part: {transformInfo.partId}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>Group ({transformInfo.count} pieces):</div>
                    <div>X: {transformInfo.position.x.toFixed(2)} Y: {transformInfo.position.y.toFixed(2)} Z: {transformInfo.position.z.toFixed(2)}</div>
                    <div>RX: {transformInfo.rotation.x.toFixed(1)}° RY: {transformInfo.rotation.y.toFixed(1)}° RZ: {transformInfo.rotation.z.toFixed(1)}°</div>
                    <div>Parts: {transformInfo.partIds?.join(', ') || 'N/A'}</div>
                  </>
                )}
              </div>
            );
          }
          return null;
        })()}
      </div>

      {/* Select All Button - Bottom Right */}
      <div className="select-all-controls" style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '8px',
        borderRadius: '4px'
      }}>
        <button
          onClick={handleSelectAll}
          disabled={model.pieces.length === 0}
          style={{
            background: model.pieces.length === 0 ? '#6c757d' : '#007bff',
            color: 'white',
            border: '1px solid #ccc',
            padding: '6px 12px',
            borderRadius: '3px',
            cursor: model.pieces.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: '500'
          }}
          title={model.pieces.length === 0 ? 'No pieces to select' : `Select all ${model.pieces.length} pieces`}
        >
          Select All ({model.pieces.length})
        </button>
      </div>
    </div>
  );
};
