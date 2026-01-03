# LDraw File Format Specification

This document describes the LDraw file format - the standard for digital LEGO modeling. It covers the essentials needed to understand and work with LDraw files in this viewer/editor.

## Quick Reference

### Line Type Summary

| Type | Purpose | Format |
|------|---------|--------|
| 0 | Comment/Meta | `0 <comment>` or `0 !<META> <params>` |
| 1 | Part Reference | `1 <color> <x> <y> <z> <matrix 9 values> <file>` |
| 2 | Line | `2 <color> <x1> <y1> <z1> <x2> <y2> <z2>` |
| 3 | Triangle | `3 <color> <x1> <y1> <z1> <x2> <y2> <z2> <x3> <y3> <z3>` |
| 4 | Quadrilateral | `4 <color> <4 points × 3 coordinates>` |
| 5 | Optional Line | `5 <color> <2 points> <2 control points>` |

### Common Color Codes

| Code | Color | Code | Color |
|------|-------|------|-------|
| 0 | Black | 1 | Blue |
| 2 | Green | 4 | Red |
| 14 | Yellow | 15 | White |
| 16 | Main Color (inherited) | 24 | Edge Color |

### LDraw Units (LDU)

| Measurement | LDU Value |
|-------------|-----------|
| 1 brick width/depth | 20 LDU |
| 1 brick height | 24 LDU |
| 1 plate height | 8 LDU |
| 1 stud diameter | 12 LDU |
| 1 stud height | 4 LDU |
| Real world: 1 LDU | ≈ 0.4 mm |

---

## Coordinate System

LDraw uses a **right-handed coordinate system** where **-Y is "up"**.

```
       -Y (up)
        |
        |
        +------ +X (right)
       /
      /
    +Z (toward viewer)
```

This differs from most 3D systems where +Y is up. The viewer automatically converts between LDraw and Three.js coordinate systems.

---

## File Basics

### Text Encoding
- LDraw files are plain text, UTF-8 encoded
- No byte order mark (BOM)
- DOS/Windows line endings (`<CR><LF>`) preferred
- Unix line endings (`<LF>`) also supported

### File Extensions
- `.ldr` - Model files (default)
- `.dat` - Part definition files
- `.mpd` - Multi-Part Document files

### File Structure
Each line contains one command. Lines consist of:
1. Optional leading whitespace
2. Line type number (0-5)
3. Whitespace-delimited parameters
4. Empty lines are ignored

---

## Line Types

### Line Type 0: Comments and Meta Commands

Comments provide documentation and metadata:

```ldraw
0 This is a comment
0 // This is also a comment (preferred form)
```

Meta commands control processing:

```ldraw
0 !LDRAW_ORG Unofficial_Model
0 Name: my_model.ldr
0 Author: Your Name
0 STEP
```

#### Common Meta Commands

| Command | Purpose |
|---------|---------|
| `0 Name: <filename>` | Model filename |
| `0 Author: <name>` | Creator name |
| `0 !LDRAW_ORG <type>` | File type declaration |
| `0 STEP` | Building step marker |
| `0 BFC CERTIFY CCW` | Back-face culling |

---

### Line Type 1: Part/Submodel Reference

This is the most important line type - it places a part or submodel in the scene.

**Format:**
```
1 <color> <x> <y> <z> <a> <b> <c> <d> <e> <f> <g> <h> <i> <file>
```

**Components:**
- `<color>` - Color code (see color table above)
- `<x> <y> <z>` - Position coordinates
- `<a> through <i>` - 3×3 rotation/scale matrix
- `<file>` - Part filename (e.g., `3001.dat`)

**Example:**
```ldraw
1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
```
This places a red (`4`) 2×4 brick (`3001.dat`) at origin with no rotation.

#### Transformation Matrix

The 9 values form a 3×3 rotation matrix:

```
| a  b  c |
| d  e  f |
| g  h  i |
```

**Identity matrix** (no rotation):
```
1 0 0
0 1 0
0 0 1
```
In LDraw format: `1 0 0 0 1 0 0 0 1`

**Common rotations:**

| Rotation | Matrix Values |
|----------|---------------|
| No rotation | `1 0 0 0 1 0 0 0 1` |
| 90° around Y | `0 0 -1 0 1 0 1 0 0` |
| 180° around Y | `-1 0 0 0 1 0 0 0 -1` |
| 90° around X | `1 0 0 0 0 -1 0 1 0` |

#### Point Transformation

A point `(u, v, w)` is transformed to `(u', v', w')`:

```
u' = a*u + b*v + c*w + x
v' = d*u + e*v + f*w + y
w' = g*u + h*v + i*w + z
```

---

### Line Type 2: Line Segment

Draws a line between two points (typically for edges).

**Format:**
```
2 <color> <x1> <y1> <z1> <x2> <y2> <z2>
```

**Example:**
```ldraw
2 24 0 0 0 10 0 0
```
Edge-colored line from origin to (10, 0, 0).

---

### Line Type 3: Triangle

Filled triangle between three points.

**Format:**
```
3 <color> <x1> <y1> <z1> <x2> <y2> <z2> <x3> <y3> <z3>
```

**Example:**
```ldraw
3 4 0 0 0 10 0 0 5 0 10
```
Red triangle with vertices at origin, (10,0,0), and (5,0,10).

---

### Line Type 4: Quadrilateral

Filled quad between four points. Points must be coplanar and in clockwise or counter-clockwise order.

**Format:**
```
4 <color> <x1> <y1> <z1> <x2> <y2> <z2> <x3> <y3> <z3> <x4> <y4> <z4>
```

**Example:**
```ldraw
4 4 0 0 0 10 0 0 10 0 10 0 0 10
```
Red square on the XZ plane.

---

### Line Type 5: Optional Line

Conditional edge line - only drawn when control points are on same side.

**Format:**
```
5 <color> <x1> <y1> <z1> <x2> <y2> <z2> <x3> <y3> <z3> <x4> <y4> <z4>
```

Points 1-2 are the line endpoints; points 3-4 are control points.

---

## Colors

### Special Colors

- **Color 16 (Main Color)**: Inherits color from parent reference
- **Color 24 (Edge Color)**: Complement/edge color, inherits from parent

### Direct Colors

RGB values can be specified directly: `0x2RRGGBB`

Example: `0x2FF0000` = bright red (RGB 255, 0, 0)

### Color Definition

Official colors are defined in `LDConfig.ldr`. The viewer loads this file to map color codes to RGB values.

---

## Part Library Structure

LDraw parts are organized in directories:

```
ldraw/
├── parts/          # Main part definitions
│   └── s/          # Sub-parts
├── p/              # Primitives
│   └── 48/         # Hi-res primitives
├── models/         # Example models
└── LDConfig.ldr    # Color definitions
```

Part references resolve in this order:
1. Current file's directory
2. `parts/` directory
3. `parts/s/` subdirectory
4. `p/` directory
5. `p/48/` subdirectory

---

## Complete Example

```ldraw
0 Simple Car Model
0 Name: car.ldr
0 Author: LDraw User
0 !LDRAW_ORG Unofficial_Model

0 Base plate
1 1 0 0 0 1 0 0 0 1 0 0 0 1 3020.dat

0 Front wheels
1 0 -30 8 0 0 0 1 0 1 0 -1 0 0 3641.dat
1 0 30 8 0 0 0 -1 0 1 0 1 0 0 3641.dat

0 STEP

0 Body
1 4 0 -8 0 1 0 0 0 1 0 0 0 1 3004.dat
1 4 0 -16 0 1 0 0 0 1 0 0 0 1 3004.dat

0 STEP
```

---

## Further Reading

- [LDraw.org Official Specification](https://www.ldraw.org/article/218.html)
- [LDraw Color Chart](https://www.ldraw.org/article/547.html)
- [BFC (Back Face Culling) Extension](https://www.ldraw.org/article/415.html)
- [MPD (Multi-Part Document) Format](./MPD.MD)
