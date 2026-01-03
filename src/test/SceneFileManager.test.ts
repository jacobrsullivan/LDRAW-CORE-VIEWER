import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SceneFileManager } from '../utils/SceneFileManager';
import { parseLDraw } from '../ldraw/LDrawParser';

// Mock the fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the parseLDraw function
vi.mock('../ldraw/LDrawParser', () => ({
  parseLDraw: vi.fn(content => ({
    name: 'Test Model',
    pieces: [],
    metadata: { source: content }
  }))
}));

describe('SceneFileManager', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getAvailableScenes', () => {
    it('should return scenes from folder structure', async () => {
      // Setup mock response for fetch - now returns folder structure
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: 'folder',
          name: 'public',
          children: [
            {
              type: 'folder',
              name: 'scenes',
              children: [
                { type: 'file', name: 'file1.ldr', path: 'scenes/file1.ldr' },
                { type: 'file', name: 'file2.ldr', path: 'scenes/file2.ldr' },
                { type: 'file', name: 'file3.ldr', path: 'scenes/file3.ldr' }
              ]
            }
          ]
        })
      });

      const result = await SceneFileManager.getAvailableScenes();

      // Should have 3 files
      expect(result.length).toBe(3);

      // Check that paths are correct
      const filenames = result.map(scene => scene.filename);
      expect(filenames).toContain('scenes/file1.ldr');
      expect(filenames).toContain('scenes/file2.ldr');
      expect(filenames).toContain('scenes/file3.ldr');

      // Check display names
      const displayNames = result.map(scene => scene.displayName);
      expect(displayNames).toContain('file1.ldr');
      expect(displayNames).toContain('file2.ldr');
      expect(displayNames).toContain('file3.ldr');

      // Verify fetch was called with the correct URL
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/scenes'));
    });

    it('should handle API errors gracefully', async () => {
      // Mock a failed API response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      });

      const result = await SceneFileManager.getAvailableScenes();

      // Should return an empty array on failure
      expect(result).toEqual([]);
    });
  });

  describe('loadScene', () => {
    it('should load a scene with the correct path', async () => {
      const testContent = '0 Test Model\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat';

      // Setup mock response for fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => testContent
      });

      const result = await SceneFileManager.loadScene('test_file.ldr');

      // Check that the file content was returned
      expect(result.content).toBe(testContent);

      // Check that the parser was called with the content
      expect(parseLDraw).toHaveBeenCalledWith(testContent);

      // Verify fetch was called with the correct URL for a file without path
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('scenes/test_file.ldr'));
    });

    it('should handle files with full paths', async () => {
      const testContent = '0 Test Model\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat';

      // Setup mock response for fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => testContent
      });

      await SceneFileManager.loadScene('scenes/test_file.ldr');

      // Verify fetch was called with the full path URL
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('scenes/test_file.ldr'));
    });

    it('should throw an error when loading fails', async () => {
      // Mock a failed fetch response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      });

      // The call should throw an error
      await expect(SceneFileManager.loadScene('nonexistent.ldr')).rejects.toThrow('Failed to load scene: Not Found');
    });
  });

  describe('loadDefaultScene', () => {
    it('should load the default scene', async () => {
      const testContent = '0 Default Model\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat';

      // Setup mock response for fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => testContent
      });

      const result = await SceneFileManager.loadDefaultScene();

      // Check that the file content was returned
      expect(result.content).toBe(testContent);

      // Verify fetch was called with default.ldr
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('scenes/default.ldr'));
    });

    it('should provide a fallback when default scene cannot be loaded', async () => {
      // Mock a failed fetch response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      });

      const result = await SceneFileManager.loadDefaultScene();

      // Should return fallback content
      expect(result.content).toContain('Fallback Model');
      expect(result.content).toContain('0 Name: default.ldr');

      // Should return a parsed model from the fallback content
      expect(result.model).toBeDefined();
    });
  });

  describe('saveScene', () => {
    it('should save a file with the correct path and content', async () => {
      const content = '0 Test Model\n0 Name: old_name.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat';

      // Setup mock response for fetch
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      await SceneFileManager.saveScene('new_file.ldr', content);

      // Check that fetch was called with the correct URL and data
      expect(mockFetch).toHaveBeenCalledWith('/api/save', expect.objectContaining({
        method: 'POST',
        body: expect.any(String)
      }));

      // Parse the JSON body to check its content
      const bodyJson = JSON.parse(mockFetch.mock.calls[0][1].body);

      // Verify the filename is correct
      expect(bodyJson.filename).toBe('scenes/new_file.ldr');

      // Verify the content has updated Name field
      expect(bodyJson.content).toContain('0 Name: new_file.ldr');
    });

    it('should use full path when provided', async () => {
      const content = '0 Test Model\n0 Name: old_name.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat';

      // Setup mock response for fetch
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      await SceneFileManager.saveScene('custom/path/file.ldr', content);

      // Parse the JSON body
      const bodyJson = JSON.parse(mockFetch.mock.calls[0][1].body);

      // Verify the full path is preserved
      expect(bodyJson.filename).toBe('custom/path/file.ldr');

      // Verify the Name field only has the filename, not the path
      expect(bodyJson.content).toContain('0 Name: file.ldr');
    });

    it('should throw an error when save fails', async () => {
      // Mock a failed fetch response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error'
      });

      // The call should throw an error
      await expect(SceneFileManager.saveScene('file.ldr', 'content')).rejects.toThrow('Failed to save file: Server Error');
    });
  });

  describe('createNewScene', () => {
    it('should create a new scene with the given filename', () => {
      const result = SceneFileManager.createNewScene('my_scene');

      // Should add .ldr extension if not provided
      expect(result.content).toContain('0 Name: my_scene.ldr');

      // Should create basic template content
      expect(result.content).toContain('0 New Model');
      expect(result.content).toContain('0 Author: LDraw User');

      // Should parse the content into a model
      expect(result.model).toBeDefined();
    });

    it('should keep the extension if already provided', () => {
      const result = SceneFileManager.createNewScene('my_scene.ldr');

      // Should not duplicate the extension
      expect(result.content).toContain('0 Name: my_scene.ldr');
      expect(result.content).not.toContain('0 Name: my_scene.ldr.ldr');
    });
  });
});
