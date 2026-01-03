import { LDrawModel } from '../ldraw/LDrawDataModels';
import { parseLDraw } from '../ldraw/LDrawParser';

export interface SceneFile {
  filename: string;
  displayName: string;
  content?: string;
  path?: string;
}

export interface FolderStructure {
  type: 'folder' | 'file';
  name: string;
  path?: string;
  children?: FolderStructure[];
}

export interface SaveResult {
  success: boolean;
  message: string;
  filename: string;
  normalizedPath: string;
}

export class SceneFileManager {
  /**
   * Fetches the folder structure of available scene files
   */
  public static async getFolderStructure(): Promise<FolderStructure> {
    try {
      // Construct API URL with current origin to ensure correct port
      const apiUrl = new URL('/api/scenes', window.location.origin).href;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch scenes');
      }
      
      const folderStructure = await response.json() as FolderStructure;
      return folderStructure;
    } catch (error) {
      console.error('Error fetching folder structure:', error);
      return {
        type: 'folder',
        name: 'public',
        children: []
      };
    }
  }

  /**
   * Fetches the list of available scene files (backward compatibility)
   */
  public static async getAvailableScenes(): Promise<SceneFile[]> {
    try {
      const folderStructure = await this.getFolderStructure();
      const sceneFiles: SceneFile[] = [];
      
      // Recursively extract files from folder structure
      const extractFiles = (node: FolderStructure, currentPath: string = '') => {
        if (node.type === 'file' && node.path) {
          sceneFiles.push({
            filename: node.path,
            displayName: node.name,
            path: node.path
          });
        } else if (node.type === 'folder' && node.children) {
          for (const child of node.children) {
            extractFiles(child, currentPath);
          }
        }
      };
      
      extractFiles(folderStructure);
      
      // Sort alphabetically by display name
      sceneFiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
      
      return sceneFiles;
    } catch (error) {
      console.error('Error fetching scenes:', error);
      return [];
    }
  }
  
  /**
   * Loads a specific scene file by path
   */
  public static async loadScene(scenePath: string): Promise<{ content: string; model: LDrawModel }> {
    try {
      const baseUrl = window.location.origin;
      // Handle paths with or without scenes/ prefix
      const url = scenePath.includes('/') 
        ? new URL(scenePath, baseUrl).href 
        : new URL(`scenes/${scenePath}`, baseUrl).href;
      
      console.log(`Loading scene from ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load scene: ${response.statusText}`);
      }
      
      const content = await response.text();
      const model = parseLDraw(content);
      
      return { content, model };
    } catch (error) {
      console.error(`Error loading scene ${scenePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Loads the default scene file
   */
  public static async loadDefaultScene(): Promise<{ content: string; model: LDrawModel }> {
    try {
      return await this.loadScene('default.ldr');
    } catch (error) {
      console.error('Error loading default scene:', error);
      
      // Create a minimal fallback if default.ldr cannot be loaded
      const fallbackContent = `0 Fallback Model
0 Name: default.ldr
0 Author: LDraw User
`;
      
      return {
        content: fallbackContent,
        model: parseLDraw(fallbackContent)
      };
    }
  }
  
  /**
   * Saves a scene file with the given filename and content
   */
  public static async saveScene(fileName: string, content: string): Promise<void> {
    try {
      // Always put files in scenes folder if they don't have a path
      let fullPath = fileName;
      if (!fileName.includes('/')) {
        fullPath = `scenes/${fileName}`;
      }
      
      // Update the Name field in the content if needed
      let updatedContent = content;
      const nameMatch = updatedContent.match(/0 Name:\s*(.*\.(?:ldr|dat|LDR|DAT))/i);
      if (nameMatch) {
        // Replace just the filename part, not the entire path
        const fileNameOnly = fileName.includes('/') ? fileName.split('/').pop() : fileName;
        updatedContent = updatedContent.replace(
          /0 Name:\s*(.*\.(?:ldr|dat|LDR|DAT))/i, 
          `0 Name: ${fileNameOnly}`
        );
      }
      
      const response = await fetch(`/api/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: fullPath,
          content: updatedContent
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save file: ${response.statusText}`);
      }
      
      return;
    } catch (error) {
      console.error(`Error saving file ${fileName}:`, error);
      throw error;
    }
  }
  
  /**
   * Creates a new empty scene with the given name
   */
  public static createNewScene(fileName: string): { content: string; model: LDrawModel } {
    // Add .ldr extension if not provided
    const fileNameWithExt = fileName.toLowerCase().endsWith('.ldr') 
      ? fileName 
      : `${fileName}.ldr`;
    
    // Create new scene content with proper filename
    const newSceneContent = `0 New Model
0 Name: ${fileNameWithExt}
0 Author: LDraw User
`;
    
    return {
      content: newSceneContent,
      model: parseLDraw(newSceneContent)
    };
  }

  /**
   * Handles saving the current file, prompting for a filename if none exists
   * @param currentFileName Current filename (empty if new file)
   * @param content Content to save
   * @returns Result with success status and filename
   */
  public static async saveCurrentFile(currentFileName: string, content: string): Promise<SaveResult> {
    try {
      // If no filename yet, prompt for one
      let fileName = currentFileName;
      if (!fileName) {
        const promptResult = window.prompt('Save as:', 'new_model.ldr');
        if (!promptResult) {
          return { 
            success: false, 
            message: 'Save canceled', 
            filename: '', 
            normalizedPath: '' 
          };
        }
        
        fileName = promptResult;
        
        // Add .ldr extension if not provided
        if (!fileName.toLowerCase().endsWith('.ldr') && !fileName.toLowerCase().endsWith('.dat')) {
          fileName = `${fileName}.ldr`;
        }
      }
      
      await this.saveScene(fileName, content);
      
      // Calculate the normalized path for selection in the dropdown
      const normalizedPath = fileName.includes('/') ? fileName : `scenes/${fileName}`;
      
      return {
        success: true,
        message: `File saved as ${fileName}`,
        filename: fileName,
        normalizedPath
      };
    } catch (error) {
      return {
        success: false,
        message: `Error saving file: ${error instanceof Error ? error.message : String(error)}`,
        filename: currentFileName,
        normalizedPath: ''
      };
    }
  }

  /**
   * Handles saving as a new file, always prompting for a filename
   * @param currentFileName Current filename to suggest as default
   * @param content Content to save
   * @returns Result with success status and filename
   */
  public static async saveAsNewFile(currentFileName: string, content: string): Promise<SaveResult> {
    try {
      // Always prompt for filename with current name as default
      const promptResult = window.prompt('Save as:', currentFileName || 'new_model.ldr');
      if (!promptResult) {
        return {
          success: false,
          message: 'Save canceled',
          filename: currentFileName,
          normalizedPath: ''
        };
      }

      // Add .ldr extension if not provided
      const finalFileName = (!promptResult.toLowerCase().endsWith('.ldr') &&
                         !promptResult.toLowerCase().endsWith('.dat'))
        ? `${promptResult}.ldr`
        : promptResult;

      await this.saveScene(finalFileName, content);

      // Calculate the normalized path for selection in the dropdown
      const normalizedPath = finalFileName.includes('/') ? finalFileName : `scenes/${finalFileName}`;

      return {
        success: true,
        message: `File saved as ${finalFileName}`,
        filename: finalFileName,
        normalizedPath
      };
    } catch (error) {
      return {
        success: false,
        message: `Error saving file: ${error instanceof Error ? error.message : String(error)}`,
        filename: currentFileName,
        normalizedPath: ''
      };
    }
  }

} 