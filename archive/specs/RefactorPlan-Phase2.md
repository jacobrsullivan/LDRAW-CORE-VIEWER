# RefactorPlan‑Phase2.md — Structural Normalization Without Extra Wrappers

> **Objective**  Resolve the *LDraw‑center vs. Three.js‑origin* mismatch by offsetting each part’s *visual mesh* within its existing **PieceContainer** (`THREE.Group`). No additional “PivotGroup” is created.

**Duration:** 1‑2 developer days ‑ a single engineer can finish in one sitting with breaks.

---

## 2.0 Prerequisites

- Phase 1 SSoT store + UUIDs complete (see Status Tracker) fileciteturn1file0.
- `PieceManager.addPiece()` already creates a **PieceContainer** per part and stores `userData.geometryInfo` fileciteturn1file1.
- Core transform helpers exist: `createLDrawToThreeJsMatrix`, `applyLDrawTransformToObject`, `getLDrawTransformFromObject` fileciteturn1file5turn1file13.

---

## 2.1 Geometry Centering (One‑time)

*Target file*: `src/three/PieceManager.ts`

1. **Load geometry → compute local center**
   ```ts
   const bbox = new THREE.Box3().setFromObject(partGroup);
   const center = new THREE.Vector3();
   bbox.getCenter(center);
   ```
2. **Inverse‑translate child mesh**
   ```ts
   partGroup.position.set(-center.x, -center.y, -center.z);
   pieceContainer.add(partGroup); // unchanged
   ```
3. **Persist metrics**
   ```ts
   pieceContainer.userData.geometryInfo = {
     center: { x: center.x, y: center.y, z: center.z },
     size: bbox.getSize(new THREE.Vector3())
   };
   ```
4. **Remove outdated bbox logic** (was run on the container) to avoid double offsets — delete the block starting at `// Calculate bounding box (Now correctly in LOCAL space …)` fileciteturn1file6.

> **Result:** `PieceContainer.localOrigin == visualCenter` for every brick.

---

## 2.2 Pure Transform Utilities

*Target file*: `src/three/LDrawTransforms.ts`

1. **Update **`` to accept `geometryInfo` (already passed) and compute *rotation‑aware offset* only once fileciteturn1file5.
2. **Symmetrical extraction** — in `getLDrawTransformFromObject()` use `geometryInfo.center` when reconverting from world space to LDraw space fileciteturn1file13.
3. **Guarantee single Y‑axis flip** — audit file to ensure `ldrawToThreeJsPosition()` / `threeJsToLDrawPosition()` are the *only* places with `y = -y` inversion.

---

## 2.3 Purge Legacy Math

Delete:

- `initialLDrawPosition`, `initialThreePosition` props (already flagged) fileciteturn1file1.
- Ad‑hoc center‑aware helpers in `utils.ts` (e.g. `copyWorldTransformWithCenterPreservation`) now redundant fileciteturn1file8.
- Any manual bbox re‑centering in `SceneManager`.

> **Tip:** `git grep "centerToOriginOffset"` to smoke‑test stray hacks.

---

## 2.4 Scene Interaction Hooks

*Files*: `TransformControlsManager.ts`, `SelectionManager.ts`

- **Attach controls** directly to `PieceContainer` (already true). Verify no code expects an extra wrapper.
- **Selection outline** uses `object.userData.type === 'piece'` — unchanged.

---

## 2.5 Testing & Verification

### 2.5.1 Unit: Geometry Offset

`PieceManager.test.ts`

```ts
it('centers mesh at origin', async () => {
  const obj = await pieceManager.addPiece(sampleBrick);
  const mesh = obj.children[0];
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(mesh).getCenter(center);
  expect(center.length()).toBeLessThan(1e-3);
});
```

### 2.5.2 Unit: Round‑trip Transform

`LDrawTransforms.test.ts`

```ts
const m = createLDrawToThreeJsMatrix(pos, rot, geom);
obj.applyMatrix4(m);
const back = getLDrawTransformFromObject(obj);
expect(back.position).toEqual(pos);
expect(back.rotationMatrix).toEqual(rot);
```

### 2.5.3 Integration: Manual QA Checklist

- Rotate `piece_0` 90° in devtools → spins about visual center.
- Drag with TransformControls → no drift.
- Serialize → reload → brick in same spot, same orientation.

---

## 2.6 Scripts

Add shortcuts in *package.json*:

```json
{
  "scripts": {
    "test:phase2": "vitest run src/**/PieceManager.test.ts src/**/LDrawTransforms.test.ts",
    "lint:phase2": "eslint src/three/{PieceManager,LDrawTransforms}.ts"
  }
}
```

---

## 2.7 Deliverables Checklist

| ID   | Deliverable                             | Status |
| ---- | --------------------------------------- | ------ |
|  2‑A | Geometry centered in **PieceContainer** | ☐      |
|  2‑B | Transform helpers symmetrical           | ☐      |
|  2‑C | Legacy math removed                     | ☐      |
|  2‑D | All tests green                         | ☐      |
|  2‑E | Manual QA passes                        | ☐      |

Mark all boxes ✅ before moving to Phase 3 (Smart Reconciliation).

---

### Appendix — Reference Diagram

*PieceContainer (THREE.Group)*

```
└─ partGroup (THREE.Group)
   └─ mesh / sub‑meshes   ← shifted by –center
```

Visual center (0,0,0) lives at the PieceContainer’s origin; all app‑level transforms operate here — **no extra wrapper required**.

