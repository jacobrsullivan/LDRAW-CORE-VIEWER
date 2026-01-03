import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Centers the camera on a given group
 * @param group The Three.js group to center the camera on
 * @param camera The camera to position
 * @param controls Optional orbit controls to update
 */
export function centerCameraOnGroup(
  group: THREE.Object3D, 
  camera: THREE.PerspectiveCamera, 
  controls?: OrbitControls
): void {
  // Compute bounding box
  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  
  // DO NOT move the group. Leave it at the origin.
  // group.position.sub(center); // <--- REMOVED THIS LINE
  
  // Reset camera position based on model size
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 2;
  
  // Position the camera to look at the model's center.
  camera.position.set(
    center.x + distance, 
    center.y + distance, 
    center.z + distance
  );
  
  // Point the camera and the orbit controls' target to the model's center.
  camera.lookAt(center);
  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

/**
 * Calculate a lookAt position for a camera to frame an object
 * @param object The object to frame
 * @param offset How far from the object to position the camera
 * @returns The position vector for the camera
 */
export function calculateLookAtPosition(
  object: THREE.Object3D, 
  offset: number = 1.5
): THREE.Vector3 {
  // Get object bounding sphere
  const boundingBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  
  // Calculate camera position
  const distance = maxDim * offset;
  return new THREE.Vector3(
    center.x + distance, 
    center.y + distance, 
    center.z + distance
  );
}

/**
 * Setup standard lighting for a scene
 * @param scene The Three.js scene to add lights to
 */
export function setupLights(scene: THREE.Scene): void {
  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0x404040, 1);
  scene.add(ambientLight);
  
  // Add directional lights
  const light1 = new THREE.DirectionalLight(0xffffff, 1);
  light1.position.set(1, 1, 1);
  scene.add(light1);
  
  const light2 = new THREE.DirectionalLight(0xffffff, 0.6);
  light2.position.set(-1, 0.5, -1);
  scene.add(light2);
}

/**
 * Add a grid helper to the scene
 * @param scene The Three.js scene
 * @param size Size of the grid (default: 200)
 * @param divisions Number of divisions (default: 10)
 * @param colorCenterLine Color of center lines (default: 0x888888)
 * @param colorGrid Color of grid lines (default: 0xcccccc)
 */
export function addGrid(
  scene: THREE.Scene, 
  size: number = 200, 
  divisions: number = 10, 
  colorCenterLine: number = 0x888888, 
  colorGrid: number = 0xcccccc
): void {
  const grid = new THREE.GridHelper(size, divisions, colorCenterLine, colorGrid);
  scene.add(grid);
}

/**
 * Add axes helper to the scene
 * @param scene The Three.js scene
 * @param size Size of the axes (default: 100)
 */
export function addAxes(scene: THREE.Scene, size: number = 100): void {
  const axes = new THREE.AxesHelper(size);
  scene.add(axes);
} 