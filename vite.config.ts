import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'
import path from 'path'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

// API middleware function to handle scene operations
const sceneApiMiddleware = () => {
  return {
    name: 'scene-api-middleware',
    configureServer(server: ViteDevServer) {
      // Get available scenes with folder structure
      server.middlewares.use('/api/scenes', (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const publicDir = path.join(__dirname, 'public')
          const scenesDir = path.join(publicDir, 'scenes')

          // Create directories if they don't exist
          if (!fs.existsSync(scenesDir)) {
            fs.mkdirSync(scenesDir, { recursive: true })
          }

          const folderStructure: { type: string; name: string; children: Array<{ type: string; name: string; path?: string; children?: unknown[] }> } = {
            type: 'folder',
            name: 'public',
            children: []
          }

          // Get .ldr files in public root
          const rootFiles = fs.readdirSync(publicDir)
            .filter(file => file.toLowerCase().endsWith('.ldr'))
            .map(file => ({
              type: 'file',
              name: file,
              path: file
            }))

          // Get .ldr files in scenes directory
          const sceneFiles = fs.readdirSync(scenesDir)
            .filter(file => file.toLowerCase().endsWith('.ldr'))
            .map(file => ({
              type: 'file',
              name: file,
              path: `scenes/${file}`
            }))

          // Build folder structure
          folderStructure.children.push(...rootFiles)

          // Add scenes folder if it has files
          if (sceneFiles.length > 0) {
            const scenesFolder = {
              type: 'folder',
              name: 'scenes',
              children: [...sceneFiles]
            }
            folderStructure.children.push(scenesFolder)
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(folderStructure))
        } catch (error) {
          console.error('Error in /api/scenes:', error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Failed to list scenes' }))
        }
      })

      // Save a scene
      server.middlewares.use('/api/save', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let data = ''
        req.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })

        req.on('end', () => {
          try {
            const { filename, content } = JSON.parse(data)

            // Validate filename and content
            if (!filename || !content) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Missing filename or content' }))
              return
            }

            // Ensure the filename has .ldr extension
            const normalizedFilename = filename.endsWith('.ldr') ? filename : `${filename}.ldr`

            // Determine the path to save
            const filePath = normalizedFilename.includes('scenes/')
              ? path.join(__dirname, 'public', normalizedFilename)
              : path.join(__dirname, 'public', 'scenes', normalizedFilename)

            // Ensure the directory exists
            const dir = path.dirname(filePath)
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true })
            }

            // Write the file
            fs.writeFileSync(filePath, content)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, filename: normalizedFilename }))
          } catch (error) {
            console.error('Error in /api/save:', error)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Failed to save scene' }))
          }
        })
      })
    }
  }
}

// API middleware function to handle LDraw parts
const partsApiMiddleware = () => {
  return {
    name: 'parts-api-middleware',
    configureServer(server: ViteDevServer) {
      // Get LDConfig.ldr file
      server.middlewares.use('/api/parts/ldconfig', (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const ldconfigPath = path.join(__dirname, 'ldraw', 'LDConfig.ldr');

          if (fs.existsSync(ldconfigPath)) {
            // Read the file as a buffer to preserve all bytes exactly
            const fileContent = fs.readFileSync(ldconfigPath);

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Length', fileContent.length);
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
            res.statusCode = 200;
            res.end(fileContent);
          } else {
            console.warn(`[Parts API] LDConfig.ldr not found`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'LDConfig.ldr not found' }));
          }
        } catch (error) {
          console.error(`[Parts API] Error serving LDConfig.ldr:`, error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to serve LDConfig.ldr' }));
        }
      });

      // Get a part file by path (dynamic route)
      server.middlewares.use('/api/parts/', (req: IncomingMessage, res: ServerResponse) => {
        const url = req.url || '';

        // Skip the /ldconfig endpoint as it's handled above
        if (url.endsWith('/ldconfig') || url === '/ldconfig') {
          return;
        }

        try {
          // Extract the requested part path from the URL
          const partPath = url.startsWith('/') ? url.slice(1) : url;

          if (!partPath) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing part path' }));
            return;
          }

          console.log(`[Parts API] Requested part: ${partPath}`);

          // Normalize the part path (lowercase for case-insensitive filesystems)
          const normalizedPath = partPath.toLowerCase();

          // Try different paths to find the file
          const ldrawDir = path.join(__dirname, 'ldraw');
          const possiblePaths = [
            path.join(ldrawDir, 'parts', normalizedPath),
            path.join(ldrawDir, 'parts/s', normalizedPath),
            path.join(ldrawDir, 'p', normalizedPath),
            path.join(ldrawDir, normalizedPath)
          ];

          let filePath = '';

          // Find the first path that exists
          for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
              filePath = testPath;
              console.log(`[Parts API] Found file at: ${filePath}`);
              break;
            }
          }

          if (filePath && fs.existsSync(filePath)) {
            // Read the file as a buffer to preserve all bytes exactly
            const fileContent = fs.readFileSync(filePath);

            // Serve the file with appropriate headers
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Length', fileContent.length);
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
            res.statusCode = 200;
            res.end(fileContent);
          } else {
            console.warn(`[Parts API] Part not found: ${partPath}`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Part not found' }));
          }
        } catch (error) {
          console.error(`[Parts API] Error serving part:`, error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to serve part' }));
        }
      });
    }
  }
}

// Custom plugin to filter public files during build
const filterPublicFiles = () => {
  return {
    name: 'filter-public-files',
    enforce: 'post' as const,
    apply: 'build' as const,
    generateBundle(_: unknown, bundle: Record<string, { type: string }>) {
      // Loop through bundle to find assets copied from public dir
      Object.keys(bundle).forEach(id => {
        const asset = bundle[id];
        // Check if this is an asset (file)
        if (asset.type === 'asset') {
          // Skip assets from the ldraw directory
          if (id.includes('ldraw/')) {
            console.log(`[filter-public-files] Excluding: ${id}`);
            delete bundle[id];
          }
        }
      });
    }
  };
};

// Special middleware to fix the trailing character issue in LDR files
const ldrawFixMiddleware = () => {
  return {
    name: 'vite-plugin-ldraw-fix',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || '';

        if (url.endsWith('.ldr') && url.includes('/scenes/')) {
          console.log(`[LDraw Fix] Processing scene file: ${url}`);

          // Get the file path
          const filePath = path.join(process.cwd(), 'public', url);

          if (fs.existsSync(filePath)) {
            // Read the file content
            const content = fs.readFileSync(filePath, 'utf8');

            // Send the content
            res.setHeader('Content-Type', 'text/plain');
            res.statusCode = 200;
            res.end(content);
            return;
          }
        }

        // Pass to next middleware
        next();
      });
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Special middleware to fix the trailing character issue in LDR files
    ldrawFixMiddleware(),
    // Custom middleware plugin to handle LDraw file requests - MUST be before react()
    {
      name: 'vite-plugin-ldraw-files',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';

          // Check if this is a request for a .dat or .ldr file
          if ((url.endsWith('.dat') || url.endsWith('.ldr'))) {
            console.log(`[LDraw middleware] Processing request for: ${url}`);

            // Try different paths to find the file
            let filePath = '';

            // Try both with and without the public prefix
            const possiblePaths = [
              // Direct path from workspace root
              path.join(process.cwd(), url),
              // With public prefix
              path.join(process.cwd(), 'public', url),
              // Try in parts directory
              path.join(process.cwd(), 'ldraw/parts', path.basename(url)),
              // Try in s directory
              path.join(process.cwd(), 'ldraw/parts/s', path.basename(url)),
              // Try in p directory
              path.join(process.cwd(), 'ldraw/p', path.basename(url))
            ];

            // Find the first path that exists
            for (const testPath of possiblePaths) {
              if (fs.existsSync(testPath)) {
                filePath = testPath;
                console.log(`[LDraw middleware] Found file at: ${filePath}`);
                break;
              }
            }

            if (filePath && fs.existsSync(filePath)) {
              // Read the file as a buffer to preserve all bytes exactly
              const fileContent = fs.readFileSync(filePath);

              // Set content type to text/plain to avoid any processing
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Content-Length', fileContent.length);
              res.statusCode = 200;
              res.end(fileContent);
              return;
            }

            // If file wasn't found, still respond with plain text empty content
            // instead of letting Vite serve HTML for a missing file
            console.warn(`[LDraw middleware] File not found: ${url} - Sending empty response instead of HTML`);
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Length', '0');
            res.statusCode = 404;
            res.end('');
            return; // Don't pass to next middleware
          }

          // For all other requests, continue to the next middleware
          next();
        });
      }
    },
    // Custom plugin to filter out ldraw files during build
    filterPublicFiles(),
    // React plugin AFTER our middleware
    react(),
    sceneApiMiddleware(),
    partsApiMiddleware(),
  ],
  define: {
    'import.meta.vitest': 'undefined',
  },
  server: {
    fs: {
      // Allow serving files from one level up from the project root (where ldraw/ might be)
      allow: ['..']
    },
    port: 5173,
    strictPort: false,
    open: true,
  },
  assetsInclude: ['**/*.dat', '**/*.ldr'],
  publicDir: './public',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'ldraw': resolve(__dirname, './ldraw'),
      // Fix ESM compatibility issues
      'react': resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, './node_modules/react/jsx-runtime')
    }
  },
  optimizeDeps: {
    include: ['zustand'],
    esbuildOptions: {
      target: 'es2020',
      mainFields: ['module', 'main'],
      format: 'esm'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Remove console statements in production (using terser for reliable stripping)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Exclude the ldraw folder from being copied to production builds
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Create specific chunks for large dependencies
          if (id.includes('node_modules')) {
            if (id.includes('three')) return 'three';
            if (id.includes('zustand')) return 'zustand';
            return 'vendor';
          }
        }
      }
    },
    copyPublicDir: true,
    // Custom plugin to control what gets copied
    commonjsOptions: {
      include: [/node_modules/],
      requireReturnsDefault: 'auto',
      esmExternals: true
    }
  }
})
