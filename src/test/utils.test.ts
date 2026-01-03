import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import {
  centerCameraOnGroup,
  calculateLookAtPosition,
  setupLights,
  addGrid,
  addAxes
} from '../three/utils';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Mock OrbitControls as it requires DOM elements
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class MockOrbitControls {
    target = new THREE.Vector3();
    update = vi.fn();
  }
}));

describe('Three.js Utilities', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  
  beforeEach(() => {
    // Create new scene and camera for each test
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    controls = new OrbitControls(camera, document.createElement('div'));
  });

  // Test centerCameraOnGroup
  it('should center camera on a group of objects', () => {
    // Create a group with objects at different positions
    const group = new THREE.Group();
    
    const box1 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    box1.position.set(5, 0, 0);
    
    const box2 = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    box2.position.set(-5, 0, 0);
    
    group.add(box1, box2);
    
    // Initial camera position
    camera.position.set(0, 0, 0);
    
    // Center camera on group
    centerCameraOnGroup(group, camera, controls);
    
    // Check that camera has been repositioned
    expect(camera.position.length()).toBeGreaterThan(0);
    
    // Check that controls have been updated
    expect(controls.update).toHaveBeenCalled();
    
    // Camera should be looking at the center (0, 0, 0) since the group
    // has been repositioned to center its bounding box at origin
    expect(controls.target.x).toBe(0);
    expect(controls.target.y).toBe(0);
    expect(controls.target.z).toBe(0);
  });

  // Test calculateLookAtPosition
  it('should calculate a proper lookAt position based on object size', () => {
    // Create an object with known dimensions
    const geometry = new THREE.BoxGeometry(10, 20, 30);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    
    // Calculate look-at position with default offset
    const position = calculateLookAtPosition(mesh);
    
    // Position should be proportional to object size
    expect(position.length()).toBeGreaterThan(30); // Larger than max dimension
    
    // Test with custom offset
    const customPosition = calculateLookAtPosition(mesh, 3.0);
    expect(customPosition.length()).toBeGreaterThan(position.length());
  });

  // Test setupLights
  it('should add standard lighting to a scene', () => {
    // Scene starts with no lights
    expect(scene.children.length).toBe(0);
    
    // Setup lights
    setupLights(scene);
    
    // Should add at least 3 lights (ambient + 2 directional)
    expect(scene.children.length).toBeGreaterThanOrEqual(3);
    
    // Check that we have the expected light types
    const lights = scene.children.filter(
      child => child instanceof THREE.Light
    );
    
    expect(lights.length).toBeGreaterThanOrEqual(3);
    
    // Should have at least one ambient light
    const ambientLights = lights.filter(
      light => light instanceof THREE.AmbientLight
    );
    expect(ambientLights.length).toBeGreaterThanOrEqual(1);
    
    // Should have at least two directional lights
    const directionalLights = lights.filter(
      light => light instanceof THREE.DirectionalLight
    );
    expect(directionalLights.length).toBeGreaterThanOrEqual(2);
  });

  // Test addGrid
  it('should add a grid helper to the scene', () => {
    // Scene starts with no objects
    expect(scene.children.length).toBe(0);
    
    // Add grid
    addGrid(scene);
    
    // Should add a grid helper
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBeInstanceOf(THREE.GridHelper);
    
    // Test with custom parameters
    scene.clear();
    addGrid(scene, 400, 20, 0xFF0000, 0x00FF00);
    
    // Should add a grid with custom properties
    expect(scene.children.length).toBe(1);
    const grid = scene.children[0] as THREE.GridHelper;
    expect(grid).toBeInstanceOf(THREE.GridHelper);
  });

  // Test addAxes
  it('should add an axes helper to the scene', () => {
    // Scene starts with no objects
    expect(scene.children.length).toBe(0);
    
    // Add axes
    addAxes(scene);
    
    // Should add an axes helper
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBeInstanceOf(THREE.AxesHelper);
    
    // Test with custom size
    scene.clear();
    addAxes(scene, 200);
    
    // Should add axes with custom size
    expect(scene.children.length).toBe(1);
    const axes = scene.children[0] as THREE.AxesHelper;
    expect(axes).toBeInstanceOf(THREE.AxesHelper);
  });
}); 