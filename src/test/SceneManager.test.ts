import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneManager, SceneManagerOptions, SceneEvents } from '../three/SceneManager';

// Mock THREE.WebGLRenderer
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      domElement: document.createElement('canvas'),
      shadowMap: {
        enabled: false
      }
    })),
    Scene: vi.fn().mockImplementation(() => ({
      add: vi.fn(),
      remove: vi.fn()
    })),
    PerspectiveCamera: vi.fn().mockImplementation(() => ({
      position: new THREE.Vector3(),
      lookAt: vi.fn(),
      updateProjectionMatrix: vi.fn()
    }))
  };
});

// Mock OrbitControls
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn().mockImplementation(() => ({
    enableDamping: false,
    dampingFactor: 0,
    update: vi.fn(),
    target: new THREE.Vector3(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
}));

describe('SceneManager', () => {
  let container: HTMLDivElement;
  let sceneManager: SceneManager;

  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600
    });
    
    Object.defineProperty(container, 'clientWidth', { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    container.appendChild = vi.fn();

    const options: SceneManagerOptions = {
      partLoaderOptions: {
        partsLibraryPath: '/test/ldraw'
      },
      backgroundColor: 0xf0f0f0,
      gridEnabled: true,
      axesEnabled: true
    };

    sceneManager = new SceneManager(container, options);
  });

  // Test initialization
  it('should initialize with a scene, camera and renderer', () => {
    expect(sceneManager).toBeDefined();
    expect(sceneManager.scene).toBeDefined();
    expect(sceneManager.camera).toBeDefined();
    expect(sceneManager.renderer).toBeDefined();
  });

  // Test model loading
  it('should be able to load a model', async () => {
    const mockModel = {
      name: 'Test Model',
      pieces: []
    };
    
    await sceneManager.loadModel(mockModel);
    expect(sceneManager.getLDrawModel()).toBeDefined();
  });

  // Test event listeners
  it('should handle event listeners correctly', async () => {
    const mockCallback = vi.fn();
    sceneManager.addEventListener(SceneEvents.MODEL_LOADED, mockCallback);
    
    // Load a model and wait for it to complete
    await sceneManager.loadModel({ name: 'Test Model', pieces: [] });
    
    // Give the event loop a chance to process the event
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(mockCallback).toHaveBeenCalled();
  });

  // Test orbit controls
  it('should provide access to orbit controls', () => {
    const controls = sceneManager.getOrbitControls();
    expect(controls).toBeDefined();
    expect(controls.target).toBeDefined();
  });
}); 