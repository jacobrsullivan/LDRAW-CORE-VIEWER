// CRITICAL: This import is required for TypeScript module resolution throughout the project.
// Even though ESLint reports it as "unused", removing it breaks Three.js type resolution
// across all files that use THREE.* types. The import enables proper namespace resolution
// for the module augmentation below and ensures TypeScript can find Three.js exports.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as THREE from 'three';

// Extend the THREE namespace to allow any string type for event types
declare module 'three' {
  interface EventDispatcher {
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
    dispatchEvent(event: { type: string, [key: string]: any }): void;
  }
} 