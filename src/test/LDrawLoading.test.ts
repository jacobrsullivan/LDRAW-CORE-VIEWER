import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { PartGeometryLoader } from '../three/PartGeometryLoader';
import * as THREE from 'three';

describe('LDraw File Loading', () => {
  let partLoader: PartGeometryLoader;

  // Spy on console logs for testing
  const consoleLogSpy = vi.spyOn(console, 'log');
  const consoleErrorSpy = vi.spyOn(console, 'error');
  const consoleWarnSpy = vi.spyOn(console, 'warn');

  beforeAll(() => {
    // Mock dynamic import for LDrawLoader
    vi.mock('three/addons/loaders/LDrawLoader.js', () => {
      return {
        LDrawLoader: vi.fn().mockImplementation(() => ({
          setPartsLibraryPath: vi.fn(),
          smoothNormals: false,
          loadAsync: vi.fn((path: string) => {
            // For testing purposes, reject loading of non-existent parts
            if (path.includes('nonexistent_part')) {
              return Promise.reject(new Error('Part not found'));
            }
            // Otherwise, return a successful Group
            return Promise.resolve(new THREE.Group());
          })
        }))
      };
    });

    // Create the loader with correct paths - use a mock implementation for tests
    partLoader = new PartGeometryLoader({
      partsLibraryPath: '/ldraw',
      smoothNormals: false
    });

    // Manually patch the loader to bypass initialization for testing
    Object.defineProperty(partLoader, 'initialized', { value: true });

    // Mock fetch for LDConfig.ldr
    global.fetch = vi.fn().mockImplementation((url: string) => {
      console.log(`Mock fetch called with URL: ${url}`);

      // Simulate successful response for LDConfig.ldr
      if (url.includes('LDConfig.ldr')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('0 LDraw.org Configuration File\n0 Name: LDConfig.ldr')
        });
      }

      // Return a 404 for any other file
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('<!DOCTYPE html><html><body><p>Not found</p></body></html>')
      });
    });
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  it('should throw an error for non-existent parts', async () => {
    // Attempt to load a part that doesn't exist
    await expect(async () => {
      await partLoader.loadPartGeometry('nonexistent_part');
    }).rejects.toThrow('Failed to load part');

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
}); 