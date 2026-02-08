# Coordinate System Transformation Fix

## ✅ Successfully Implemented

### Problem
The coordinate system conversion between LDraw's `-Y up` world and Three.js's `+Y up` world was incorrectly implemented, causing rotations to not work properly in both directions.

### Root Cause
The previous implementation was incorrectly negating individual elements rather than applying the proper mathematical transformation: **`M_three = C * M_ldraw`** where `C` is a 180-degree X-axis rotation matrix.

### Solution Applied

#### 1. Fixed `ldrawToThreeJsRotationMatrix4()` 
**File**: `src/three/LDrawTransforms.ts` (lines 74-80)

**Before (Incorrect):**
```typescript
const t11 = l[0], t12 = -l[1], t13 = l[2];
const t21 = -l[3], t22 = l[4], t23 = -l[5];
const t31 = l[6], t32 = -l[7], t33 = l[8];
```

**After (Correct):**
```typescript
const t11 = l[0],  t12 = l[1],  t13 = l[2];  // 1st row unchanged
const t21 = -l[3], t22 = -l[4], t23 = -l[5]; // 2nd row negated
const t31 = -l[6], t32 = -l[7], t33 = -l[8]; // 3rd row negated
```

#### 2. Fixed `extractRotationMatrix()` 
**File**: `src/three/LDrawTransforms.ts` (lines 55-59)

**Before (Incorrect):**
```typescript
const l11 = t11,  l12 = -t12, l13 = t13;
const l21 = -t21, l22 = t22,  l23 = -t23;
const l31 = t31,  l32 = -t32, l33 = t33;
```

**After (Correct):**
```typescript
const l11 = t11,  l12 = t12,  l13 = t13;  // 1st row unchanged
const l21 = -t21, l22 = -t22, l23 = -t23; // 2nd row negated
const l31 = -t31, l32 = -t32, l33 = -t33; // 3rd row negated
```

### Mathematical Explanation

The transformation correctly implements:
- **Forward (LDraw → Three.js)**: Pre-multiply by 180° X-rotation: `M_three = C * M_ldraw`
- **Reverse (Three.js → LDraw)**: Post-multiply by 180° X-rotation: `M_ldraw = M_three * C`

This translates to negating the **2nd and 3rd rows** of the rotation matrix in both directions.

### Expected Benefits

1. **Correct Rotations**: Rotations applied in the 3D viewer will now be saved correctly to LDraw format
2. **Bidirectional Consistency**: Loading LDraw files and saving back will preserve rotations exactly
3. **Transform Reliability**: All transform operations (rotate, move) will work consistently
4. **File Integrity**: Saved files will have correct orientation data

### Testing
- ✅ **Build successful**: No compilation errors
- ✅ **No linting issues**: Clean code with no warnings
- ✅ **Ready for testing**: Coordinate transformations should now work correctly

### Files Modified
- `src/three/LDrawTransforms.ts` - Fixed both transformation functions

---
**Next**: Test rotation operations in the 3D viewer and verify that saved files maintain correct orientations.
