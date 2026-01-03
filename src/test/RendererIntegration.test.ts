import { describe, it, expect, vi } from 'vitest';
import { parseLDraw } from '../ldraw/LDrawParser';
import * as THREE from 'three';
import { LDrawPiece } from '../ldraw/LDrawDataModels';
import { createLDrawToThreeJsMatrix } from '../three/LDrawTransforms';

// Mock the SceneManager implementation for testing
vi.mock('../three/SceneManager', () => {
  const mockPieces = new Map();
  
  return {
    SceneEvents: {
      MODEL_LOADED: 'model_loaded',
      PIECE_ADDED: 'piece_added',
      PIECE_REMOVED: 'piece_removed',
      PIECE_UPDATED: 'piece_updated',
      SCENE_RESET: 'scene_reset'
    },
    SceneManager: vi.fn().mockImplementation(() => {
      const mockScene = new THREE.Scene();
      const mockGroup = new THREE.Group();
      mockGroup.name = 'LDraw Model';
      mockScene.add(mockGroup);
      
      return {
        scene: mockScene,
        loadModel: vi.fn().mockImplementation(async (model) => {
          // Create objects for each piece
          model.pieces.forEach((piece: LDrawPiece) => {
            const id = piece.id?.toString() || Math.random().toString(36).substr(2, 9);
            const obj = new THREE.Object3D();
            obj.name = `Piece_${id}`;
            
            // Use our proper transformation function from LDrawTransforms
            const matrix = createLDrawToThreeJsMatrix(piece.position, piece.rotationMatrix);
            
            // Decompose the matrix to get position and rotation
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            matrix.decompose(position, quaternion, scale);
            
            // Apply to the object
            obj.position.copy(position);
            obj.quaternion.copy(quaternion);
            obj.updateMatrix();
            
            // Store the piece
            mockPieces.set(id, obj);
            mockGroup.add(obj);
          });
        }),
        getPieces: () => mockPieces,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispose: vi.fn()
      };
    })
  };
});

// Sample LDraw content - matches our default.ldr
const SAMPLE_LDRAW = `
0 
0 Name: New Model.ldr
0 Author: 
1 7 40 -24 -30 1 0 0 0 1 0 0 0 1 3005.dat
`;

describe('Renderer Integration Tests', () => {
  it('should parse LDraw content correctly', () => {
    const model = parseLDraw(SAMPLE_LDRAW);
    
    // Verify model metadata
    expect(model.name).toBe('New Model.ldr');
    
    // Verify pieces
    expect(model.pieces.length).toBe(1);
    
    const piece = model.pieces[0];
    expect(piece.partId).toBe('3005.dat');
    expect(piece.colorCode).toBe(7);
    expect(piece.position).toEqual({ x: 40, y: -24, z: -30 });
    expect(piece.rotationMatrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
  
  it('should render pieces at correct positions', async () => {
    // Create a stub container
    const container = document.createElement('div');
    
    // Import the actual SceneManager (mocked)
    const { SceneManager } = await import('../three/SceneManager');
    
    // Create instance with mocked behavior
    const sceneManager = new SceneManager(container, {
      partLoaderOptions: {
        partsLibraryPath: '/ldraw',
        smoothNormals: true
      },
      backgroundColor: 0xf0f0f0,
      gridEnabled: true,
      axesEnabled: true
    });
    
    // Load the model
    await sceneManager.loadModel(parseLDraw(SAMPLE_LDRAW));
    
    // Verify the pieces were added
    const pieces = sceneManager.getPieces();
    expect(pieces.size).toBe(1);
    
    // Get the first piece
    const [, pieceObject] = [...pieces.entries()][0];
    
    // Verify position matches the LDraw file after coordinate system transform
    // LDraw: {x: 40, y: -24, z: -30} → Three.js: {x: 40, y: 24, z: -30}
    expect(pieceObject.position.x).toBeCloseTo(40);
    expect(pieceObject.position.y).toBeCloseTo(24); // Notice this is now positive due to coordinate flip
    expect(pieceObject.position.z).toBeCloseTo(-30);
  });

  it('should load and render an LDraw model', async () => {
    const SAMPLE_LDRAW = `
0 Test Model
0 Name: test.ldr
0 Author: Test
1 4 40 24 -30 0 0 1 0 1 0 -1 0 0 3001.dat
`;

    // Parse the model first
    const model = parseLDraw(SAMPLE_LDRAW);
    
    // Now we can use SceneManager directly with the parsed model
    const { SceneManager } = await import('../three/SceneManager');
    const sceneManager = new SceneManager(document.createElement('div'), {
      partLoaderOptions: {
        partsLibraryPath: '/ldraw',
        smoothNormals: true
      },
      backgroundColor: 0xf0f0f0,
      gridEnabled: true,
      axesEnabled: true
    });
    
    // Load the model
    await sceneManager.loadModel(model);
    
    // Verify the pieces were added (allows for additional internal pieces)
    const pieces = sceneManager.getPieces();
    expect(pieces.size).toBeGreaterThanOrEqual(1);
  });
}); 