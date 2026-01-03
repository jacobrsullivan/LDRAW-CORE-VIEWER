#!/usr/bin/env node

/**
 * Postinstall script for ldraw-core-viewer
 *
 * Downloads the LDraw parts library from GitHub if not present.
 * This is ~478MB and required for the viewer to function.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const LDRAW_REPO = 'https://github.com/pybricks/ldraw.git';
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const LDRAW_DIR = path.join(PACKAGE_ROOT, 'ldraw');

// Skip if ldraw already exists
if (fs.existsSync(LDRAW_DIR)) {
  const ldconfigPath = path.join(LDRAW_DIR, 'LDConfig.ldr');
  if (fs.existsSync(ldconfigPath)) {
    console.log('LDraw library already installed, skipping download.');
    process.exit(0);
  }
}

console.log(`
================================================================================
  LDraw Core Viewer - Downloading Parts Library
================================================================================

The LDraw parts library (~478MB) is required for this viewer to function.
Downloading from: ${LDRAW_REPO}

This may take a few minutes depending on your connection speed...
`);

// Check if git is available
function checkGit() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

// Clone with progress
function cloneRepo() {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['clone', '--progress', LDRAW_REPO, LDRAW_DIR], {
      stdio: ['inherit', 'inherit', 'inherit']
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git clone exited with code ${code}`));
      }
    });

    git.on('error', (err) => {
      reject(err);
    });
  });
}

// Main execution
async function main() {
  try {
    if (!checkGit()) {
      throw new Error(`
Git is required to download the LDraw library.

Please install git and try again:
  - macOS:   brew install git
  - Ubuntu:  sudo apt install git
  - Windows: https://git-scm.com/download/win

Or manually clone the repository:
  git clone ${LDRAW_REPO} ${LDRAW_DIR}
`);
    }

    await cloneRepo();

    // Verify installation
    const ldconfigPath = path.join(LDRAW_DIR, 'LDConfig.ldr');
    if (fs.existsSync(ldconfigPath)) {
      console.log(`
================================================================================
  LDraw library installed successfully!
================================================================================

You can now run the viewer with:

  npx ldraw-core-viewer

Or if installed globally:

  ldraw-core-viewer

The viewer will open in your browser at http://localhost:3000
`);
    } else {
      throw new Error('Installation completed but LDConfig.ldr not found');
    }
  } catch (error) {
    console.error(`
================================================================================
  LDraw library installation failed
================================================================================

Error: ${error.message}

The viewer requires the LDraw parts library to function.
You can manually install it by running:

  git clone ${LDRAW_REPO} ${LDRAW_DIR}

Then run the viewer with:

  npx ldraw-core-viewer
`);

    // Don't fail the npm install - let user know they need to fix it
    process.exit(0);
  }
}

main();
