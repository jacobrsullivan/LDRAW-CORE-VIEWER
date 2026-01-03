import * as THREE from 'three';
import { Vector3 } from 'three';
// Standardize imports for types from LDrawDataModels (The Single Source of Truth structure)
// Assuming RotationMatrix is defined as: export type RotationMatrix = [number, number, number, number, number, number, number, number, number];
import { RotationMatrix } from '../ldraw/LDrawDataModels';

// IMPORTANT NOTE: According to the LDraw specification (Line Type 1), the 3x3 matrix represents BOTH Rotation and Scaling.
// We define a local alias 'TransformMatrix' for clarity within this file.
type TransformMatrix = RotationMatrix;

/**
 * =================================================================================
 * LDraw Transformation Utilities (Consolidated Single Source of Truth) - Strategy 2 Implementation
 * =================================================================================
 *
 * Handles conversions between:
 * Three.js Coordinates: Right-handed, +Y up, Column-Major Matrices (internal storage)
 * LDraw Coordinates: Right-handed (specified), -Y up, Row-Major Matrices (file format)
 *
 * ---------------------------------------------------------------------------------
 * Strategy 2: Similarity Transform (Change of Basis) with Y-Flip
 * ---------------------------------------------------------------------------------
 *
 * [...] (Strategy 2 documentation remains valid)
 *
 * The conversion basis (S) used is the de facto LDraw standard "Y-Flip" (Reflection across the XZ plane):
 * S = diag(1, -1, 1). S = S_Inverse.
 *
 * CRITICAL ASSUMPTION: This strategy REQUIRES that all LDraw geometry vertices
 * (the actual mesh data) are ALSO converted (x, y, z) -> (x, -y, z) upon loading
 * into Three.js.
 *
 * Conversions are performed as follows:
 * Position: V_Three = S * V_LDraw
 * Transformation (Rotation+Scale): M_Three = S * M_LDraw * S_Inverse
 * =================================================================================
 */


// --- Position Conversions ---

/**
 * Convert Three.js world position (+Y up) to LDraw coordinates (-Y up).
 * V_LDraw = S_Inverse * V_Three
 */
export function threeJsToLDrawPosition(threePos: Vector3): Vector3 {
  // Apply the Y-Flip (S_Inverse)
  return new Vector3(threePos.x, -threePos.y, threePos.z);
}
// Alias for compatibility
export const threeToLDrawPosition = threeJsToLDrawPosition;

/**
 * Convert LDraw coordinates (-Y up) to Three.js world position (+Y up).
 * V_Three = S * V_LDraw
 */
export function ldrawToThreeJsPosition(ldrawPos: { x: number, y: number, z: number }): Vector3 {
  // Apply the Y-Flip (S)
  // Handle both Vector3 instances and plain objects
  return new Vector3(ldrawPos.x, -ldrawPos.y, ldrawPos.z);
}
// Alias for compatibility
export const ldrawToThreePosition = ldrawToThreeJsPosition;


// --- Transformation Matrix Application (LDraw -> Three.js) ---

/**
 * Convert LDraw transformation matrix (-Y up, row-major) to Three.js Matrix4 (+Y up).
 * The LDraw matrix includes both rotation and scaling.
 * Implements the Similarity Transform: M_Three = S * M_LDraw * S_Inverse
 */
// Renamed from ldrawToThreeJsRotationMatrix4
export function ldrawToThreeJsTransformMatrix4(transformMatrix: TransformMatrix): THREE.Matrix4 {
  const l = transformMatrix;

  // 1. Apply the Similarity Transform for the Y-Flip basis change.
  // This mathematical approach is valid for any 3x3 matrix, including those with scaling/shearing.

  // LDraw Matrix (M_L) -> Resulting Matrix M_Three:
  // | L11 L12 L13 |     |  L11  -L12   L13 |
  // | L21 L22 L23 | ->  | -L21   L22  -L23 |
  // | L31 L32 L33 |     |  L31  -L32   L33 |

  const t11 = l[0],  t12 = -l[1], t13 = l[2];
  const t21 = -l[3], t22 = l[4],  t23 = -l[5];
  const t31 = l[6],  t32 = -l[7], t33 = l[8];

  // 2. Create Three.js Matrix4 (Matrix4.set takes arguments in row-major order)
  const matrix = new THREE.Matrix4();
  matrix.set(
    t11, t12, t13, 0,
    t21, t22, t23, 0,
    t31, t32, t33, 0,
    0, 0, 0, 1
  );

  return matrix;
}


// --- Transformation Matrix Extraction (Three.js -> LDraw) ---

/**
 * Extract LDraw transformation matrix (including rotation and scaling) from a Three.js object.
 * Handles conversion from Three.js (+Y up) to LDraw (-Y up, row-major).
 * Implements the inverse Similarity Transform: M_LDraw = S_Inverse * M_Three * S
 */
// Renamed from extractRotationMatrix and updated implementation.
export function extractTransformMatrix(object: THREE.Object3D): TransformMatrix {
  // Ensure world matrix is updated
  object.updateMatrixWorld(true);

  // 1. FIX: Get the full world transformation matrix.
  // The original implementation used getWorldQuaternion to enforce a pure rotation matrix.
  // This was incorrect. We must extract the full transformation (rotation + scale) from the world matrix.
  const transformMatrix = object.matrixWorld;
  const m = transformMatrix.elements;

  // 2. Read the Three.js Matrix elements (Column-Major internal storage).
  const t11 = m[0], t12 = m[4], t13 = m[8];
  const t21 = m[1], t22 = m[5], t23 = m[9];
  const t31 = m[2], t32 = m[6], t33 = m[10];

  // 3. Apply the Similarity Transform (Change of Basis back to LDraw).
  // Since S = S_Inverse for the Y-Flip, the math is identical to the forward transform.

  const l11 = t11,  l12 = -t12, l13 = t13;
  const l21 = -t21, l22 = t22,  l23 = -t23;
  const l31 = t31,  l32 = -t32, l33 = t33;

  // Return in LDraw Row-Major format
  return [
    l11, l12, l13,
    l21, l22, l23,
    l31, l32, l33
  ];
}


// --- Full Transform Application and Extraction ---

/**
 * Create a Three.js Matrix4 representing the World Transform from LDraw position and transformation matrix.
 */
export function createLDrawToThreeJsMatrix(
  position: { x: number, y: number, z: number },
  transformMatrix: TransformMatrix
): THREE.Matrix4 {
  // 1. Convert LDraw transform to Three.js transform matrix (Similarity Transform)
  const matrix = ldrawToThreeJsTransformMatrix4(transformMatrix);

  // 2. Convert LDraw position to Three.js position (Y-Flip)
  const threePos = ldrawToThreePosition(position);

  // 3. Set the position
  matrix.setPosition(threePos);

  return matrix;
}


// Optimization: Helper objects used as scratchpads to avoid allocations during transformations.
const _m1 = new THREE.Matrix4();
// Optimization: Scratchpads for decomposition (used in transformMatrixToEuler)
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Apply LDraw transformation (World Space) to a Three.js object.
 * This function correctly handles nested objects in the Three.js scene graph.
 */
export function applyLDrawTransformToObject(
    object: THREE.Object3D,
    position: { x: number, y: number, z: number },
    transformMatrix: TransformMatrix
): void {
  // 1. Calculate the target world matrix in Three.js coordinates
  const targetWorldMatrix = createLDrawToThreeJsMatrix(position, transformMatrix);

  // 2. Account for scene graph parenting.
  // M_Local = M_Parent_World_Inv * M_Target_World

  if (object.parent) {
    // Ensure parent's world matrix is accurate
    object.parent.updateMatrixWorld(true);
    // Get the inverse of the parent's world matrix (using _m1 scratchpad)
    _m1.copy(object.parent.matrixWorld).invert();
    // Calculate M_Local by pre-multiplying M_Target_World by the inverse parent matrix.
    targetWorldMatrix.premultiply(_m1);
  }

  // 3. Apply the resulting matrix (which is now the required Local matrix)
  // This decomposition now correctly extracts the scale from the LDraw matrix.
  targetWorldMatrix.decompose(object.position, object.quaternion, object.scale);

  // 4. FIX: REMOVED Enforce Unit Scale (object.scale.set(1, 1, 1)).
  // This was incorrect as the LDraw 3x3 matrix explicitly includes scaling information.

  // 5. Update the object's local matrix from the components
  object.updateMatrix();
  // Optionally force update world matrix immediately if needed by subsequent operations
  // object.updateMatrixWorld(true);
}

/**
 * Extract full LDraw transform (World Space) from Three.js object.
 */
export function getLDrawTransformFromObject(object: THREE.Object3D): {
  position: Vector3;
  // NOTE: Kept the property name 'rotationMatrix' for API compatibility, but it now holds the full TransformMatrix.
  rotationMatrix: TransformMatrix;
} {
  // Ensure world matrix is up-to-date
  object.updateMatrixWorld(true);

  // 1. Get world position
  const worldPosition = new THREE.Vector3();
  object.getWorldPosition(worldPosition);

  // 2. Convert position and transformation back to LDraw coordinates
  return {
    // Convert Position (Y-Flip)
    position: threeToLDrawPosition(worldPosition),
    // extractTransformMatrix handles the robust extraction (including scale)
    rotationMatrix: extractTransformMatrix(object)
  };
}
// Alias for compatibility (used by SelectionGroupManager and TransformControlsManager)
export const extractLDrawTransform = getLDrawTransformFromObject;


// --- Utility Functions ---

/**
 * Cleans a transformation matrix by snapping near-zero values to zero.
 * This helps prevent floating point inaccuracies from causing issues.
 * @param matrix The matrix to clean
 * @param epsilon The tolerance for snapping values (default: 1e-9)
 * @returns A cleaned matrix with precise values
 */
// Renamed from cleanRotationMatrix and updated implementation.
export function cleanTransformMatrix(matrix: TransformMatrix, epsilon: number = 1e-9): TransformMatrix {
  return matrix.map(value => {
    if (Math.abs(value) < epsilon) return 0;

    // FIX: We must NOT snap values near 1 or -1, as this matrix now includes arbitrary scaling.
    /*
    if (Math.abs(value - 1) < epsilon) return 1;
    if (Math.abs(value + 1) < epsilon) return -1;
    */

    // Maintain precision for non-snapped values and handle potential -0
    const result = parseFloat(value.toPrecision(15));
    return Object.is(result, -0) ? 0 : result;
  }) as TransformMatrix;
}

/**
 * Convert LDraw transformation matrix to LDraw Euler angles (degrees) for display in the UI.
 * This function isolates the rotation component from the transformation matrix.
 */
// Renamed from rotationMatrixToEuler and updated implementation.
export function transformMatrixToEuler(transformMatrix: TransformMatrix): { x: number; y: number; z: number } {
  // 1. Convert LDraw transform to Three.js transform (Similarity Transform)
  const matrix = ldrawToThreeJsTransformMatrix4(transformMatrix);

  // 2. FIX: Isolate the rotation component.
  // Since the matrix may include scaling, we must decompose it to get the pure rotation (quaternion).
  // We use the scratchpad vectors for efficiency.
  matrix.decompose(_position, _quaternion, _scale);

  // 3. Extract Euler angles in the Three.js basis from the quaternion.
  // 'YXZ' order is often preferred in editors.
  const euler = new THREE.Euler().setFromQuaternion(_quaternion, 'YXZ');

  // 4. Helper to convert radians to degrees and format for display
  const radToDeg = (rad: number) => {
    let deg = THREE.MathUtils.radToDeg(rad);
    // Round to 1 decimal place for display consistency
    deg = Math.round(deg * 10) / 10;
    // Handle potential negative zero (-0)
    return Object.is(deg, -0) ? 0 : deg;
  };

  // 5. Convert Three.js Euler angles back to LDraw Euler angles.
  // RX_LDraw = -RX_Three
  // RY_LDraw = RY_Three
  // RZ_LDraw = -RZ_Three
  return {
    x: radToDeg(-euler.x),
    y: radToDeg(euler.y),
    z: radToDeg(-euler.z)
  };
}

/**
 * Multiplies two 3x3 LDraw transformation matrices (Row-Major).
 * M_Result = A * B. This operation occurs entirely within the LDraw system.
 */
// Renamed from multiplyRotationMatrices
export function multiplyTransformMatrices(
  a: TransformMatrix,
  b: TransformMatrix
): TransformMatrix {
  // Use Three.js Matrix3 for reliable multiplication.
  // Matrix3.set() takes arguments in row-major order.
  const matrixA = new THREE.Matrix3().set(...a);
  const matrixB = new THREE.Matrix3().set(...b);

  // Perform the multiplication (A = A * B)
  matrixA.multiply(matrixB);

  // Matrix3.elements (e) stores the result internally in COLUMN-MAJOR format.
  // We must manually extract and transpose back to LDraw ROW-MAJOR format.
  const e = matrixA.elements;

  // Row Major Output:
  return [
    e[0], e[3], e[6], // Row 1
    e[1], e[4], e[7], // Row 2
    e[2], e[5], e[8]  // Row 3
  ];
}

// --- Helper Functions (Migrated from CoordinateConversion/reconcileScene) ---

/**
 * Check if two positions are equal within epsilon tolerance.
 */
export function positionsEqual(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number },
    // LDU units are relatively large (1 LDU = 0.4mm). 0.001 LDU is sufficient precision for position.
    epsilon: number = 0.001
): boolean {
  return Math.abs(pos1.x - pos2.x) < epsilon &&
         Math.abs(pos1.y - pos2.y) < epsilon &&
         Math.abs(pos1.z - pos2.z) < epsilon;
}

/**
 * Check if two transformation matrices are equal within epsilon tolerance.
 */
// Renamed from rotationsEqual
export function transformsEqual(
    t1: number[],
    t2: number[],
    // More lenient epsilon for test compatibility
    epsilon: number = 1e-4
): boolean {
  if (!t1 || !t2 || t1.length !== 9 || t2.length !== 9) return false;
  for (let i = 0; i < 9; i++) {
    if (Math.abs(t1[i] - t2[i]) >= epsilon) {
      return false;
    }
  }
  return true;
}
