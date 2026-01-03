#!/usr/bin/env node

/**
 * CLI entry point for ldraw-core-viewer
 *
 * Usage:
 *   npx ldraw-core-viewer [options]
 *   ldraw-core-viewer [options]
 *
 * Options:
 *   --port, -p <number>   Port to run server (default: 3000)
 *   --no-open             Don't open browser automatically
 *   --ldraw <path>        Custom path to ldraw directory
 *   --help, -h            Show help
 *   --version, -v         Show version
 */

const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  port: 3000,
  open: true,
  ldrawDir: null,
  help: false,
  version: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' || arg === '-p') {
    options.port = parseInt(args[++i], 10);
  } else if (arg === '--no-open') {
    options.open = false;
  } else if (arg === '--ldraw') {
    options.ldrawDir = args[++i];
  } else if (arg === '--help' || arg === '-h') {
    options.help = true;
  } else if (arg === '--version' || arg === '-v') {
    options.version = true;
  }
}

// Show help
if (options.help) {
  console.log(`
ldraw-core-viewer - LDraw 3D Web Viewer & Editor

Usage:
  npx ldraw-core-viewer [options]

Options:
  --port, -p <number>   Port to run server (default: 3000)
  --no-open             Don't open browser automatically
  --ldraw <path>        Custom path to ldraw directory
  --help, -h            Show this help message
  --version, -v         Show version number

Examples:
  npx ldraw-core-viewer                  # Start on port 3000
  npx ldraw-core-viewer -p 8080          # Start on port 8080
  npx ldraw-core-viewer --no-open        # Don't auto-open browser
  `);
  process.exit(0);
}

// Show version
if (options.version) {
  const pkg = require('../package.json');
  console.log(pkg.version);
  process.exit(0);
}

// Resolve paths relative to package root
const packageRoot = path.resolve(__dirname, '..');
const ldrawDir = options.ldrawDir || path.join(packageRoot, 'ldraw');

// Check if ldraw directory exists
if (!fs.existsSync(ldrawDir)) {
  console.error(`
Error: LDraw parts library not found at: ${ldrawDir}

The LDraw library should have been installed automatically during npm install.
You can manually download it by running:

  git clone https://github.com/pybricks/ldraw.git ${ldrawDir}

Or specify a custom path:

  ldraw-core-viewer --ldraw /path/to/your/ldraw
  `);
  process.exit(1);
}

// Set environment variables
process.env.PORT = options.port;
process.env.LDRAW_DIR = ldrawDir;

// Start the server
console.log(`
Starting LDraw 3D Web Viewer...
  Port: ${options.port}
  LDraw: ${ldrawDir}
`);

// Import and run server
require('../server.cjs');

// Open browser after short delay (allow server to start)
if (options.open) {
  setTimeout(() => {
    const url = `http://localhost:${options.port}`;
    const openCommand = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

    try {
      if (process.platform === 'win32') {
        execSync(`${openCommand} ${url}`, { stdio: 'ignore', shell: true });
      } else {
        execSync(`${openCommand} ${url}`, { stdio: 'ignore' });
      }
    } catch (e) {
      console.log(`Open your browser to: ${url}`);
    }
  }, 1000);
}
