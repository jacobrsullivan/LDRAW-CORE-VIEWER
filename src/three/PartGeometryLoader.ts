import * as THREE from 'three';
import { ThreeLDrawLoader, LDrawLoaderFactory, LDrawLoaderOptions } from './LDrawLoaderModule';
import { LDrawFileManager } from '../ldraw/PartsFileManager';
import { LDrawColorManager } from '../ldraw/ColorManager';

// Interface for the LDraw part geometry
export interface GeometryData {
  group: THREE.Group;
  materials: Map<number, THREE.Material>;
}

// Options for configuring the PartGeometryLoader
export interface PartGeometryLoaderOptions {
  partsLibraryPath: string;
  smoothNormals?: boolean;
}

/**
 * Part Geometry Loader - Dedicated module for loading LDraw part geometry
 * 
 * This class encapsulates the interaction with Three.js's LDrawLoader and provides
 * a clean interface for loading part geometry on demand.
 */
export class PartGeometryLoader {
  private loader!: ThreeLDrawLoader;
  private geometryCache: Map<string, Promise<GeometryData>> = new Map();
  private initialized: boolean = false;
  private initPromise: Promise<void>;
  private fileManager: LDrawFileManager;

  constructor(private options: PartGeometryLoaderOptions) {
    // Enable THREE.Cache to avoid redundant file fetching
    THREE.Cache.enabled = true;

    // Create file manager
    this.fileManager = new LDrawFileManager();

    // Initialize will set up the loader asynchronously
    this.initPromise = this.initialize();
  }

  // Initialize the loader asynchronously - must complete before parts can be loaded
  private async initialize(): Promise<void> {
    console.log('PartGeometryLoader initialization starting');
    try {
      // Create the loader using our factory
      const loaderOptions: LDrawLoaderOptions = {
        partsLibraryPath: this.options.partsLibraryPath,
        smoothNormals: this.options.smoothNormals || false
      };
      
      this.loader = await LDrawLoaderFactory.createLoader(loaderOptions);
      this.initialized = true;
      console.log('PartGeometryLoader initialized successfully');
    } catch (e) {
      console.error('PartGeometryLoader initialization failed:', e);
      throw new Error('Failed to initialize loader');
    }
  }

  /**
   * Load part geometry by part ID, with caching
   */
  public async loadPartGeometry(partId: string): Promise<GeometryData> {
    // Ensure the loader is initialized
    if (!this.initialized) {
      console.log(`Waiting for loader initialization before loading ${partId}`);
      await this.initPromise;
    }
    
    // Generate a normalized part ID for cache lookup 
    const normalizedPartId = partId.toLowerCase();
    
    // Check if this part is already in the cache (case-insensitive)
    if (this.geometryCache.has(normalizedPartId)) {
      console.log(`Found ${normalizedPartId} in cache`);
      return this.geometryCache.get(normalizedPartId)!;
    }
    
    try {
      console.log(`Loading part ${normalizedPartId} using LDrawLoader`);
      
      // Create a promise for loading the part and store it in cache immediately
      const loadPromise = this.loadValidatedPart(normalizedPartId);
      this.geometryCache.set(normalizedPartId, loadPromise);
      
      // Wait for the loading to complete
      return await loadPromise;
    } catch (error) {
      console.error(`Error loading part geometry for ${normalizedPartId}:`, error);
      
      // Remove failed attempt from cache
      this.geometryCache.delete(normalizedPartId);
      
      throw new Error(`Failed to load part ${normalizedPartId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Load a part after validating it (UPDATED)
   * NOTE: Requires Three.js r177+ - materials must have userData.code property
   */
  private async loadValidatedPart(partId: string): Promise<GeometryData> {
    try {
      // First validate the file to ensure it's a valid LDraw file
      await this.fileManager.validateLDrawFile(partId);

      // Construct full path to the part file
      // LDrawLoader needs the full path so it can resolve subpart references correctly
      // (e.g., when 3001.dat references s\3001s01.dat, the loader uses the parent path)
      const partPath = `${this.options.partsLibraryPath}parts/${partId}`;

      // Now we know it's a valid file, proceed with the real loader
      const group = await this.loader.loadAsync(partPath);
      group.name = partId;
      
      // Note: Coordinate system transformation is handled in SceneManager
      
      console.log(`Successfully loaded geometry for ${partId}`);
      
      // Extract and map materials
      const materials = new Map<number, THREE.Material>();
      
      group.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          const material = object.material;
          
          // Handle both single materials and material arrays
          if (Array.isArray(material)) {
            material.forEach(m => {
              if (m.userData && m.userData.code !== undefined) {
                materials.set(m.userData.code, m);
              }
            });
          } else if (material && material.userData && material.userData.code !== undefined) {
            materials.set(material.userData.code, material);
          }
        }
      });

      return { group, materials };
    } catch (error) {
      console.error(`Error loading validated part for ${partId}:`, error);
      throw new Error(`Failed to load validated part for ${partId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Clear the geometry cache
   */
  public clearCache(): void {
    this.geometryCache.clear();
  }
  
  /**
   * Create a clone of the part geometry with specified color
   * @param data The original geometry data
   * @param colorCode The LDraw color code to apply
   * @returns A new Three.js Group with the applied color
   * 
   * Applies LDraw color inheritance rules:
   * - Color code 16: Inherits the main/parent color
   * - Color code 24: Inherits the edge/complement color
   * - Other colors: Keep their original appearance
   */
  public createColoredPartInstance(data: GeometryData, colorCode: number): THREE.Group {
    // Clone the original group
    const clonedGroup = data.group.clone();
    
    // Get parent color values
    const parentColorValue = LDrawColorManager.getLDrawColorValue(colorCode);
    const parentOpacity = LDrawColorManager.getColorOpacity(colorCode);
    const isParentTransparent = parentOpacity < 1.0;
    
    // Helper function to check if a color should inherit from parent
    const shouldInheritColor = (originalColorCode: number | string): boolean => {
      // Color 16 = Main color (inherits parent color)
      // Color 24 = Edge color (inherits complement color)
      const code = typeof originalColorCode === 'string' ? parseInt(originalColorCode, 10) : originalColorCode;
      return code === 16 || code === 24;
    };
    
    // Helper function to get the inherited color value
    const getInheritedColorValue = (originalColorCode: number | string): number => {
      const code = typeof originalColorCode === 'string' ? parseInt(originalColorCode, 10) : originalColorCode;
      if (code === 16) {
        // Main color inherits parent color directly
        return parentColorValue;
      } else if (code === 24) {
        // Edge color inherits complement color
        return LDrawColorManager.getComplementColor(colorCode);
      }
      // Should never reach here if shouldInheritColor was checked first
      return parentColorValue;
    };
    
    // Apply LDraw color inheritance rules to all meshes
    clonedGroup.traverse((object) => {
      if (!object) return;
      
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        // Handle different material types
        if (Array.isArray(object.material)) {
          if (!object.material.length) return;
          
          // For multi-material meshes, clone and conditionally update each material
          object.material = object.material.map(m => {
            if (!m) return new THREE.MeshBasicMaterial({ visible: false }) as THREE.Material;
            
            const clonedMaterial = m.clone();
            const originalColorCode = m.userData?.code;
            
            // Apply color inheritance for LDraw color codes 16 (main) and 24 (edge)
            if (originalColorCode !== undefined && shouldInheritColor(originalColorCode)) {
              const inheritedColorValue = getInheritedColorValue(originalColorCode);
              const inheritedColor = new THREE.Color(inheritedColorValue);
              
              // Apply inherited color based on material type
              if (clonedMaterial instanceof THREE.MeshStandardMaterial ||
                  clonedMaterial instanceof THREE.MeshPhongMaterial ||
                  clonedMaterial instanceof THREE.MeshLambertMaterial) {
                clonedMaterial.color.copy(inheritedColor);
              } else if (clonedMaterial instanceof THREE.LineBasicMaterial) {
                clonedMaterial.color.copy(inheritedColor);
              }
            }
            // Materials with explicit colors (not 16/24) keep their original colors
            
            // Apply parent transparency if needed
            if (isParentTransparent) {
              clonedMaterial.transparent = true;
              clonedMaterial.opacity = parentOpacity;
            }
            
            return clonedMaterial;
          });
        } else if (object.material) {
          // For single material meshes - same logic
          const material = object.material;
          
          if (!material) {
            object.material = new THREE.MeshBasicMaterial({ visible: false });
            return;
          }
          
          const clonedMaterial = material.clone();
          const originalColorCode = material.userData?.code;
          
          // Apply color inheritance for LDraw color codes 16 (main) and 24 (edge)
          if (originalColorCode !== undefined && shouldInheritColor(originalColorCode)) {
            const inheritedColorValue = getInheritedColorValue(originalColorCode);
            const inheritedColor = new THREE.Color(inheritedColorValue);
            
            // Apply inherited color based on material type
            if (clonedMaterial instanceof THREE.MeshStandardMaterial ||
                clonedMaterial instanceof THREE.MeshPhongMaterial ||
                clonedMaterial instanceof THREE.MeshLambertMaterial) {
              clonedMaterial.color.copy(inheritedColor);
            } else if (clonedMaterial instanceof THREE.LineBasicMaterial) {
              clonedMaterial.color.copy(inheritedColor);
            }
          }
          // Materials with explicit colors (not 16/24) keep their original colors
          
          // Apply parent transparency if needed
          if (isParentTransparent) {
            clonedMaterial.transparent = true;
            clonedMaterial.opacity = parentOpacity;
          }
          
          object.material = clonedMaterial;
        } else {
          // If the object has no material, add a default one to prevent errors
          const defaultColor = new THREE.Color(parentColorValue);
          object.material = new THREE.MeshBasicMaterial({ 
            color: defaultColor,
            visible: false 
          });
        }
      }
    });
    
    return clonedGroup;
  }

  /**
   * Create a simple error geometry to show when a part fails to load
   */
  public createErrorGeometry(partId: string): THREE.Group {
    const group = new THREE.Group();
    group.name = `Error_${partId}`;
    
    // Create a visible error indicator - red cube with a wireframe
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xff0000,
      roughness: 0.8,
      metalness: 0.2
    });
    
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    
    // Add wireframe
    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff })
    );
    group.add(wireframe);
    
    // Add a text label to indicate this is an error
    const textMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    
    // Create a simple "X" shape from lines
    const textGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -5, -5, 5,   5, 5, 5,    // Line 1
      -5, 5, 5,    5, -5, 5    // Line 2
    ]);
    textGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const text = new THREE.LineSegments(textGeometry, textMaterial);
    text.position.z = 5.1; // Slightly in front of the cube
    group.add(text);
    
    return group;
  }
}
