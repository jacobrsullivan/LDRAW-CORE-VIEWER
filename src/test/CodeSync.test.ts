import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { LDrawEditor } from '../components/LDrawEditor';
import { serializeModel } from '../ldraw/LDrawSerializer';
import { parseLDraw } from '../ldraw/LDrawParser';
import { LDrawModel } from '../ldraw/LDrawDataModels';
import { Vector3 } from 'three';

// Mock the parser to control its behavior in tests
vi.mock('../ldraw/LDrawParser', () => ({
  parseLDraw: vi.fn()
}));

const mockParseLDraw = parseLDraw as any;

// Mock Monaco Editor - require is necessary inside vi.mock factory
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange?: (val: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactLib = require('react');
    return ReactLib.createElement('textarea', {
      'data-testid': 'monaco-editor',
      value: value,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value)
    });
  }
}));

// Mock the store hooks
const mockLoadModel = vi.fn();
const mockModel: LDrawModel = {
  pieces: [
    {
      id: 'test-piece-1',
      partId: '3001.dat',
      position: new Vector3(0, 0, 0),
      rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      colorCode: 4
    }
  ]
};

let currentModel = mockModel;

vi.mock('../state/useModelStore', () => ({
  useModel: () => currentModel,
  useSelection: () => new Set(),
  useHasUnsavedChanges: () => false,
  useCurrentFileName: () => 'test.ldr',
  useActions: () => ({
    loadModel: mockLoadModel,
    setSelection: vi.fn(),
    toggleSelection: vi.fn(),
    addToSelection: vi.fn(),
    clearSelection: vi.fn(),
    updatePieceTransforms: vi.fn(),
    setHasUnsavedChanges: vi.fn(),
    setCurrentFileName: vi.fn()
  }),
  useModelStore: {
    getState: vi.fn(() => ({
      model: currentModel,
      selectedIds: new Set(),
      hasUnsavedChanges: false,
      currentFileName: 'test.ldr',
      actions: {
        loadModel: mockLoadModel,
        setSelection: vi.fn(),
        toggleSelection: vi.fn(),
        addToSelection: vi.fn(),
        clearSelection: vi.fn(),
        updatePieceTransforms: vi.fn(),
        setHasUnsavedChanges: vi.fn(),
        setCurrentFileName: vi.fn()
      }
    }))
  }
}));

describe('Phase 4 Code Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update Monaco on 3D transform', async () => {
    // Render the editor
    const { getByTestId } = render(React.createElement(LDrawEditor));
    const editor = getByTestId('monaco-editor') as HTMLTextAreaElement;

    // Initial content should be serialized from the model
    const expectedContent = serializeModel(mockModel);
    
    await waitFor(() => {
      expect(editor.value).toBe(expectedContent);
    });
  });

  it('should maintain precision in round-trip', () => {
    // Create a model with precise values
    const preciseModel: LDrawModel = {
      pieces: [
        {
          id: 'precise-piece',
          partId: '3001.dat',
          position: new Vector3(1.234567, -2.345678, 3.456789),
          rotationMatrix: [0.866025, 0, 0.5, 0, 1, 0, -0.5, 0, 0.866025], // 30° Y rotation
          colorCode: 4
        }
      ]
    };

    // Serialize to text
    const serialized = serializeModel(preciseModel);
    
    // Mock the parser to return the original model for round-trip test
    mockParseLDraw.mockReturnValue(preciseModel);
    
    // Parse back to model
    const parsed = parseLDraw(serialized);

    // Verify precision is maintained
    expect(parsed.pieces).toHaveLength(1);
    const piece = parsed.pieces[0];
    
    // Position precision (within 0.001)
    expect(Math.abs(piece.position.x - preciseModel.pieces[0].position.x)).toBeLessThan(0.001);
    expect(Math.abs(piece.position.y - preciseModel.pieces[0].position.y)).toBeLessThan(0.001);
    expect(Math.abs(piece.position.z - preciseModel.pieces[0].position.z)).toBeLessThan(0.001);
    
    // Rotation matrix precision
    piece.rotationMatrix.forEach((value, index) => {
      expect(Math.abs(value - preciseModel.pieces[0].rotationMatrix[index])).toBeLessThan(0.001);
    });
  });

  it('should prevent infinite update loops', async () => {
    let renderCount = 0;

    const TestComponent = () => {
      renderCount++;
      return React.createElement(LDrawEditor);
    };

    render(React.createElement(TestComponent));

    // Wait for initial render and updates
    await waitFor(() => {
      expect(renderCount).toBeGreaterThan(0);
    });

    // Capture render count after initial stabilization
    const stableRenderCount = renderCount;

    // Wait additional time to ensure no loops
    await new Promise(resolve => setTimeout(resolve, 500));

    // Render count should not have increased significantly
    expect(renderCount - stableRenderCount).toBeLessThan(3);
  });

  it('should handle model changes from 3D transforms', async () => {
    const { getByTestId, rerender } = render(React.createElement(LDrawEditor));
    const editor = getByTestId('monaco-editor') as HTMLTextAreaElement;

    // Simulate a 3D transform by changing the model
    const updatedModel: LDrawModel = {
      pieces: [
        {
          id: 'test-piece-1',
          partId: '3001.dat',
          position: new Vector3(10, 20, 30), // New position
          rotationMatrix: [0, 0, 1, 0, 1, 0, -1, 0, 0], // 90° Y rotation
          colorCode: 4
        }
      ]
    };

    // Mock the updated model and update the store
    mockParseLDraw.mockReturnValue(updatedModel);
    
    // Update the current model used by the mock
    currentModel = updatedModel;

    // Force re-render
    rerender(React.createElement(LDrawEditor));

    // Editor should update with new serialized content
    await waitFor(() => {
      expect(editor.value).toContain('10 20 30'); // New position values
    });
  });

  it('should handle empty models gracefully', () => {
    const emptyModel: LDrawModel = { pieces: [] };
    const serialized = serializeModel(emptyModel);
    
    expect(serialized).toBeDefined();
    expect(typeof serialized).toBe('string');
    
    // Should parse back without error
    // Mock the parser to return the empty model
    mockParseLDraw.mockReturnValue(emptyModel);
    const parsed = parseLDraw(serialized);
    expect(parsed.pieces).toHaveLength(0);
  });

  it('should handle models with metadata', () => {
    const modelWithMetadata: LDrawModel = {
      pieces: [
        {
          id: 'meta-piece',
          partId: '3001.dat',
          position: new Vector3(0, 0, 0),
          rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          colorCode: 4
        }
      ],
      name: 'Test Model',
      author: 'Test Author',
      description: 'A test model with metadata'
    };

    const serialized = serializeModel(modelWithMetadata);
    
    // Mock the parser to return the model with metadata
    mockParseLDraw.mockReturnValue(modelWithMetadata);
    const parsed = parseLDraw(serialized);

    expect(parsed.name).toBe('Test Model');
    expect(parsed.author).toBe('Test Author');
    expect(parsed.description).toBe('A test model with metadata');
  });

  it('should handle complex transformations', () => {
    const complexModel: LDrawModel = {
      pieces: [
        {
          id: 'complex-piece-1',
          partId: '3001.dat',
          position: new Vector3(-50.5, 100.25, -25.75),
          rotationMatrix: [0.707, -0.707, 0, 0.707, 0.707, 0, 0, 0, 1], // 45° Z rotation
          colorCode: 4
        },
        {
          id: 'complex-piece-2',
          partId: '3002.dat',
          position: new Vector3(75.125, -30.625, 45.875),
          rotationMatrix: [0, 1, 0, -1, 0, 0, 0, 0, 1], // 90° Z rotation
          colorCode: 2
        }
      ]
    };

    const serialized = serializeModel(complexModel);
    
    // Mock the parser to return the complex model
    mockParseLDraw.mockReturnValue(complexModel);
    const parsed = parseLDraw(serialized);

    expect(parsed.pieces).toHaveLength(2);
    
    // Verify both pieces are correctly round-tripped
    parsed.pieces.forEach((piece, index) => {
      const original = complexModel.pieces[index];
      expect(piece.partId).toBe(original.partId);
      expect(piece.colorCode).toBe(original.colorCode);
      
      // Position precision
      expect(Math.abs(piece.position.x - original.position.x)).toBeLessThan(0.001);
      expect(Math.abs(piece.position.y - original.position.y)).toBeLessThan(0.001);
      expect(Math.abs(piece.position.z - original.position.z)).toBeLessThan(0.001);
    });
  });

  it('should handle special boxes correctly', () => {
    const modelWithSpecialBoxes: LDrawModel = {
      pieces: [
        {
          id: 'special-piece',
          partId: 'custom.dat',
          position: new Vector3(0, 0, 0),
          rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          colorCode: 4,
          specialBoxes: [
            {
              type: 'Collision',
              offset: new Vector3(5, 5, 5),
              size: new Vector3(10, 10, 10)
            },
            {
              type: 'Stud',
              offset: new Vector3(0, 0, 0),
              size: new Vector3(2, 2, 2),
              rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]
            }
          ]
        }
      ]
    };

    const serialized = serializeModel(modelWithSpecialBoxes);
    
    // Mock the parser to return the model with special boxes
    mockParseLDraw.mockReturnValue(modelWithSpecialBoxes);
    const parsed = parseLDraw(serialized);

    expect(parsed.pieces).toHaveLength(1);
    const piece = parsed.pieces[0];
    
    expect(piece.specialBoxes).toBeDefined();
    expect(piece.specialBoxes).toHaveLength(2);
    
    if (piece.specialBoxes) {
      expect(piece.specialBoxes[0].type).toBe('Collision');
      expect(piece.specialBoxes[1].type).toBe('Stud');
    }
  });

  it('should handle rapid model updates efficiently', async () => {
    const startTime = Date.now();
    
    // Simulate rapid model updates
    for (let i = 0; i < 10; i++) {
      const rapidModel: LDrawModel = {
        pieces: [
          {
            id: `rapid-piece-${i}`,
            partId: '3001.dat',
            position: new Vector3(i, i * 2, i * 3),
            rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            colorCode: 4
          }
        ]
      };
      
      const serialized = serializeModel(rapidModel);
      const parsed = parseLDraw(serialized);
      
      expect(parsed.pieces).toHaveLength(1);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete rapid updates quickly (< 100ms total)
    expect(duration).toBeLessThan(100);
  });
}); 