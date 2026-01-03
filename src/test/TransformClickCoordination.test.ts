import { describe, test, expect, vi, beforeEach } from 'vitest';
import { InputEventHandler } from '../three/InputEventHandler';
import { SelectionManager } from '../three/SelectionManager';
import { TransformControlsManager } from '../three/TransformControlsManager';
import { SelectionGroupManager } from '../three/SelectionGroupManager';
import { SceneManager } from '../three/SceneManager';
import * as THREE from 'three';

// Mock the store
vi.mock('../state/useModelStore', () => ({
  useModelStore: {
    getState: () => ({
      selectedIds: new Set(['piece1', 'piece2']),
      actions: {
        setSelection: vi.fn(),
        toggleSelection: vi.fn(),
        clearSelection: vi.fn()
      }
    })
  }
}));

describe('Transform Click Coordination', () => {
  let inputHandler: InputEventHandler;
  let mockCanvas: HTMLElement;
  let mockCamera: THREE.Camera;
  let mockSceneManager: SceneManager;
  let mockTransformControls: TransformControlsManager;
  let mockSelectionManager: SelectionManager;
  let mockSelectionGroupManager: SelectionGroupManager;

  beforeEach(() => {
    // Create mock canvas
    mockCanvas = document.createElement('div');
    mockCanvas.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0, top: 0, width: 800, height: 600
    });

    // Create mock camera
    mockCamera = new THREE.PerspectiveCamera();

    // Mock SceneManager
    mockSceneManager = {
      scene: new THREE.Scene(),
      camera: mockCamera,
      renderer: { domElement: mockCanvas }
    } as any;

    // Mock TransformControlsManager
    mockTransformControls = {
      dragging: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setMode: vi.fn(),
      getMode: vi.fn().mockReturnValue('translate'),
      detach: vi.fn()
    } as any;

    // Mock SelectionManager
    mockSelectionManager = {
      raycastAndGetPieceId: vi.fn().mockReturnValue('piece1'),
      setSelectionGroupManager: vi.fn()
    } as any;

    // Mock SelectionGroupManager
    mockSelectionGroupManager = {
      commitTransformation: vi.fn()
    } as any;

    inputHandler = new InputEventHandler(
      mockCanvas,
      mockSceneManager,
      mockTransformControls,
      mockSelectionManager,
      mockSelectionGroupManager
    );
  });

  describe('Cooldown Period Management', () => {
    test('should not be in cooldown initially', () => {
      expect(inputHandler.isInTransformCooldown()).toBe(false);
    });

    test('should enter cooldown after transform ends', () => {
      // Simulate transform end via dragging-changed event
      const draggingEvent = { value: false };
      (inputHandler as any).handleDraggingChanged(draggingEvent);
      
      expect(inputHandler.isInTransformCooldown()).toBe(true);
    });

    test('should exit cooldown after timeout period', async () => {
      // Simulate transform end
      (inputHandler as any).handleDraggingChanged({ value: false });
      expect(inputHandler.isInTransformCooldown()).toBe(true);
      
      // Wait for cooldown period to expire
      await new Promise(resolve => setTimeout(resolve, 150)); // > 100ms cooldown
      
      expect(inputHandler.isInTransformCooldown()).toBe(false);
    });

    test('should reset cooldown manually', () => {
      // Simulate transform end
      (inputHandler as any).handleDraggingChanged({ value: false });
      expect(inputHandler.isInTransformCooldown()).toBe(true);
      
      // Reset cooldown
      inputHandler.resetTransformCooldown();
      expect(inputHandler.isInTransformCooldown()).toBe(false);
    });
  });

  describe('Click Suppression During Cooldown', () => {
    test('should ignore clicks during cooldown period', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Simulate transform end
      (inputHandler as any).handleDraggingChanged({ value: false });
      
      // Simulate click during cooldown
      const clickEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      // Call handleClick directly
      (inputHandler as any).handleClick(clickEvent);
      
      // Should see cooldown log message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚫 Ignoring click')
      );
      
      // SelectionManager should not be called during cooldown
      expect(mockSelectionManager.raycastAndGetPieceId).not.toHaveBeenCalled();
      
      consoleLogSpy.mockRestore();
    });

    test('should process clicks after cooldown expires', async () => {
      // Simulate transform end
      (inputHandler as any).handleDraggingChanged({ value: false });
      
      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Simulate click after cooldown
      const clickEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      (inputHandler as any).handleClick(clickEvent);
      
      // SelectionManager should be called after cooldown expires
      expect(mockSelectionManager.raycastAndGetPieceId).toHaveBeenCalledWith(
        clickEvent,
        mockCanvas
      );
    });
  });

  describe('Group Transform Coordination', () => {
    test('should enter cooldown after group transform ends', () => {
      // Simulate group transform end
      (inputHandler as any).handleGroupTransformEnd();
      
      expect(inputHandler.isInTransformCooldown()).toBe(true);
      expect(mockSelectionGroupManager.commitTransformation).toHaveBeenCalled();
    });

    test('should ignore clicks after group transform', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Simulate group transform end
      (inputHandler as any).handleGroupTransformEnd();
      
      // Simulate immediate click
      const clickEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      (inputHandler as any).handleClick(clickEvent);
      
      // Should ignore click during cooldown
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚫 Ignoring click')
      );
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('Dragging State Integration', () => {
    test('should ignore clicks while dragging regardless of cooldown', () => {
      // Set dragging state
      Object.defineProperty(mockTransformControls, 'dragging', { value: true, configurable: true });
      
      // Simulate click while dragging
      const clickEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      (inputHandler as any).handleClick(clickEvent);
      
      // Should not process click due to dragging state
      expect(mockSelectionManager.raycastAndGetPieceId).not.toHaveBeenCalled();
    });

    test('should respect cooldown when not dragging', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Ensure not dragging
      Object.defineProperty(mockTransformControls, 'dragging', { value: false, configurable: true });
      
      // Set cooldown
      (inputHandler as any).handleDraggingChanged({ value: false });
      
      // Simulate click
      const clickEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      (inputHandler as any).handleClick(clickEvent);
      
      // Should respect cooldown
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚫 Ignoring click')
      );
      
      consoleLogSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple rapid transform ends', () => {
      // Simulate multiple rapid transform ends
      (inputHandler as any).handleDraggingChanged({ value: false });
      (inputHandler as any).handleDraggingChanged({ value: false });
      (inputHandler as any).handleGroupTransformEnd();
      
      // Should still be in cooldown
      expect(inputHandler.isInTransformCooldown()).toBe(true);
    });

    test('should handle cooldown reset during active cooldown', () => {
      // Start cooldown
      (inputHandler as any).handleDraggingChanged({ value: false });
      expect(inputHandler.isInTransformCooldown()).toBe(true);
      
      // Reset during cooldown
      inputHandler.resetTransformCooldown();
      expect(inputHandler.isInTransformCooldown()).toBe(false);
      
      // Click should now be processed
      const clickEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      
      (inputHandler as any).handleClick(clickEvent);
      expect(mockSelectionManager.raycastAndGetPieceId).toHaveBeenCalled();
    });
  });
}); 