import { Vector3 } from 'three';

// Define the 3x3 rotation matrix as a specific tuple
export type RotationMatrix = [number, number, number, number, number, number, number, number, number];

export interface LDrawPiece {
  // CRITICAL: Mandatory UUID for tracking and reconciliation.
  id: string;
  partId: string; // e.g., "3001.dat"
  position: Vector3; // Stored in LDraw coordinates (-Y up)
  rotationMatrix: RotationMatrix;
  colorCode: number;
  // Support for existing functionality
  specialBoxes?: Array<{
    type: "Collision" | "Boundary" | "Stud" | "Receiver";
    offset: Vector3;
    size: Vector3;
    rotation?: RotationMatrix;
  }>;
}

export interface LDrawModel {
  pieces: LDrawPiece[];
  name?: string;
  author?: string;
  description?: string;
  // Support for hierarchical models if needed later
  submodels?: LDrawModel[];
} 