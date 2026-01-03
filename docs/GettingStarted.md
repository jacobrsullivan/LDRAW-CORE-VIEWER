# Getting Started

This guide will help you set up, run, and understand the LDraw 3D Web Viewer & Editor.

## Prerequisites

- **Node.js** version 18.0 or higher ([download](https://nodejs.org/))
- **Git** for version control
- **Modern web browser** (Chrome, Firefox, Safari, or Edge)

Verify your Node.js installation:
```bash
node --version  # Should be 18.0+
npm --version   # Comes with Node.js
```

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/LDraw3DWebVis.git
cd LDraw3DWebVis
```

### 2. Install Dependencies

```bash
npm install
```

This installs all required packages including React, Three.js, and Monaco Editor.

### 3. Start the Development Server

```bash
npm run dev
```

The application opens automatically at `http://localhost:5173`

---

## Application Overview

### Interface Layout

The application has a split-pane interface:

```
┌─────────────────────────────────────────────────────┐
│                    Header                           │
├──────────────────────────┬──────────────────────────┤
│                          │                          │
│      3D Viewport         │      Code Editor         │
│      (Canvas3D)          │      (Monaco)            │
│                          │                          │
│   - View model in 3D     │   - Edit LDraw code     │
│   - Select pieces        │   - Syntax highlighting │
│   - Transform controls   │   - Real-time sync      │
│                          │                          │
└──────────────────────────┴──────────────────────────┘
```

### 3D Viewport Controls

**Camera:**
- **Left-click + drag**: Rotate camera
- **Right-click + drag**: Pan camera
- **Scroll wheel**: Zoom in/out

**Selection:**
- **Click**: Select a piece
- **Ctrl/Cmd + Click**: Add to selection
- **Ctrl/Cmd + A**: Select all pieces
- **Escape**: Clear selection

**Transform Controls:**
- **W**: Translate mode (move)
- **E**: Rotate mode
- **R**: Scale mode

### Code Editor

The right panel contains a Monaco Editor (same as VS Code) for editing LDraw code:

- Changes in the editor update the 3D view in real-time
- Transforming pieces in 3D updates the code automatically
- File toolbar for New, Save, and Load operations

---

## Working with Models

### Loading a Model

1. Use the dropdown in the editor toolbar to select a scene file
2. Available models are in `public/scenes/`

### Creating a New Model

1. Click "New" in the toolbar
2. A template is created with basic metadata
3. Add pieces using Type 1 lines:

```ldraw
0 My First Model
0 Name: my_model.ldr
0 Author: Your Name

1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
```

This adds a red 2×4 brick at the origin.

### Saving a Model

1. Click "Save" in the toolbar
2. Enter a filename (or keep the existing one)
3. File is saved to `public/scenes/`

---

## Understanding LDraw Code

### Basic Line Format

Each piece is defined with a Type 1 line:

```
1 <color> <x> <y> <z> <rotation matrix> <part file>
```

**Example:**
```ldraw
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
│ │ └─┬─┘ └───────┬───────┘ └───┬───┘
│ │   │           │             └── Part file (2×4 brick)
│ │   │           └── Rotation matrix (identity = no rotation)
│ │   └── Position (x=0, y=0, z=0)
│ └── Color code (4 = red)
└── Line type (1 = part reference)
```

### Common Colors

| Code | Color |
|------|-------|
| 0 | Black |
| 1 | Blue |
| 2 | Green |
| 4 | Red |
| 14 | Yellow |
| 15 | White |

### Common Parts

| Part ID | Description |
|---------|-------------|
| 3001.dat | 2×4 Brick |
| 3002.dat | 2×3 Brick |
| 3003.dat | 2×2 Brick |
| 3004.dat | 1×2 Brick |
| 3005.dat | 1×1 Brick |
| 3020.dat | 2×4 Plate |
| 3021.dat | 2×3 Plate |
| 3022.dat | 2×2 Plate |
| 3023.dat | 1×2 Plate |
| 3024.dat | 1×1 Plate |

---

## Transforming Pieces

### In the 3D View

1. Click a piece to select it
2. Press W (translate), E (rotate), or R (scale)
3. Drag the transform gizmo axes
4. The code updates automatically

### In the Editor

Edit the position values directly:

```ldraw
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat    // At origin
1 4 20 0 0 1 0 0 0 1 0 0 0 1 3001.dat   // Moved 20 units on X
1 4 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat  // Stacked one brick height up
```

**Note:** In LDraw, **-Y is up**, so negative Y values move pieces upward.

---

## Multi-Selection

### Selecting Multiple Pieces

1. **Ctrl/Cmd + Click** to add pieces to selection
2. **Ctrl/Cmd + A** to select all pieces
3. Selected pieces are highlighted with an emissive glow

### Transforming Groups

When multiple pieces are selected:
- A group is created at the center of all selected pieces
- Transform controls affect all pieces together
- Relative positions are maintained

---

## Project Structure for Developers

```
src/
├── components/          # React UI components
│   ├── Canvas3D.tsx     # 3D viewport
│   ├── LDrawEditor.tsx  # Code editor
│   └── modals/          # Dialog components
├── ldraw/               # LDraw parsing/serialization
├── three/               # Three.js managers
├── state/               # Zustand store
└── utils/               # Utilities
```

See [Architecture.md](./Architecture.md) for detailed implementation info.

---

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Create production build |
| `npm run lint` | Check code quality |

---

## Troubleshooting

### Parts Not Rendering

1. Check the browser console for errors
2. Verify the `ldraw/` folder exists with parts
3. Ensure the development server is running

### Editor Not Syncing

1. Wait for debounce (500ms after typing)
2. Check for parse errors in the UI
3. Ensure piece IDs are unique

### Selection Not Working

1. Click directly on the piece geometry
2. Check that pieces loaded correctly (no errors)
3. Try refreshing the browser

---

## Next Steps

- Read [LDraw File Format](./ldraw_specs.MD) to understand the format
- Read [Architecture](./Architecture.md) to understand the implementation
- Browse example models in `public/scenes/`
- Explore the [LDraw Parts Library](https://www.ldraw.org/library/) for available parts
