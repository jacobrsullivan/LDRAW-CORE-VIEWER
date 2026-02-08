Here is the **Phase 3 Implementation Plan**—a full technical guide tailored for a single developer to implement the next refactor milestone in the Web3DViewer project. Phase 3 focuses on introducing **Smart Scene Reconciliation** (diffing-based 3D view updates) and **reactivating the Code-to-3D sync** via Monaco editing.

---

## ✅ Goal Summary – Phase 3

* **Enable Smart Scene Diffing**: Efficiently update only changed objects in the Three.js scene.
* **Enable Editor-to-3D Flow**: Changes in Monaco Editor update the model, which reflects live in 3D.
* **Guarantee Consistency**: Scene state always reflects the authoritative Zustand SSoT model.

---

## 📅 Estimated Duration

**\~1 Day** for full implementation, assuming Phase 2 is complete.

---

## 🧱 Core Components & File References

* Zustand Store: `src/state/useModelStore.ts`
* LDraw Parser/Serializer: `src/ldraw/LDrawParser.ts`, `src/ldraw/LDrawSerializer.ts`
* Scene Manager: `src/three/SceneManager.ts`
* Editor Component: `src/components/LDrawEditor.tsx`
* 3D Viewport: `src/components/ThreeDViewport.tsx`
* Monaco Integration: `src/components/Editor.tsx`

---

## 🔁 3.1 – Smart Scene Reconciliation

### 1. **Diff the New Model Against the Existing Scene**

* Add a **subscription** to the Zustand store (`model`) in `ThreeDViewport.tsx`.
* On model change:

  * Compare the **new `LDrawModel.pieces` array** to the current scene using `piece.id`.
  * For each piece:

    * If new → **add it**
    * If deleted → **remove it**
    * If changed (position/rotation/color) → **update it**

> ⚠️ Use `useModelStore((state) => state.model)` and debounce the listener (\~100ms) to prevent jitter.

```tsx
useEffect(() => {
  const unsubscribe = useModelStore.subscribe(
    (state) => state.model,
    debounce((newModel) => {
      reconcileScene(newModel);
    }, 100),
    { equalityFn: shallow }
  );
  return unsubscribe;
}, []);
```

### 2. **Reconciliation Function (`reconcileScene`)**

* Implement this function in `SceneManager.ts` (or a helper).
* Pseudo-code:

```ts
function reconcileScene(newModel: LDrawModel) {
  const existingPieceIds = new Set(sceneManager.getAllPieceIds());

  const newPieceMap = new Map(newModel.pieces.map(p => [p.id, p]));

  // Remove deleted
  for (const existingId of existingPieceIds) {
    if (!newPieceMap.has(existingId)) {
      sceneManager.removePiece(existingId);
    }
  }

  // Add or update
  for (const piece of newModel.pieces) {
    const existing = sceneManager.getPieceById(piece.id);
    if (!existing) {
      sceneManager.addPiece(piece);
    } else {
      const current = existing.piece;
      if (
        !positionsEqual(current.position, piece.position) ||
        !rotationsEqual(current.rotationMatrix, piece.rotationMatrix) ||
        current.colorCode !== piece.colorCode
      ) {
        sceneManager.updatePiece(piece.id, {
          position: piece.position,
          rotationMatrix: piece.rotationMatrix,
          colorCode: piece.colorCode,
        });
      }
    }
  }
}
```

* Helper functions `positionsEqual()` and `rotationsEqual()` compare floats with a small epsilon (`< 0.001`).

---

## 💻 3.2 – Re-enable Live Editor Updates (Code → 3D)

### 1. **Hook Monaco `onChange` to Zustand Store**

In `Editor.tsx`, implement:

```ts
const handleEditorChange = (content: string | undefined) => {
  if (!content) return;
  try {
    const parsed = parseLDraw(content);
    actions.loadModel(content); // Will regenerate UUIDs
  } catch (err) {
    console.warn('Parse error:', err);
  }
};
```

* **Debounce** this function (\~300ms).
* Be sure the parser returns a valid `LDrawModel` with fresh UUIDs.

> Note: If preserving UUIDs between parse cycles is needed for stable diffing, Phase 3 must **disable UUID regeneration** or implement a smarter parser with ID retention.

### 2. **Ensure Model Updates Trigger Scene Diff**

Your `useEffect` subscription to the model already handles this (see 3.1). Once the model is updated by `loadModel()`, the diff will take care of re-rendering the scene.

---

## 🔬 Testing & Verification Checklist

### ✅ Scene Diffing

* [ ] Add a piece in Monaco → new 3D piece appears.
* [ ] Delete a piece in Monaco → 3D piece disappears.
* [ ] Modify position/rotation → only that piece updates visually.
* [ ] No flickering/reload of unaffected objects.

### ✅ Live Editor Sync

* [ ] Typing updates are smooth (after debounce).
* [ ] Syntax errors don't crash the scene (just log a warning).
* [ ] No duplicated UUIDs.
* [ ] Switching models re-parses and resets scene.

---

## 🧪 Suggested Unit Tests

Place under `src/state/useModelStore.test.ts` or similar.

* [ ] `loadModel()` properly replaces store model and clears selection.
* [ ] `updatePieceTransforms()` updates only specified pieces.
* [ ] Parser+Serializer round-trip test passes.
* [ ] Diff function updates only changed objects.

---

## 🚧 Potential Enhancements

* **Preserve UUIDs** across parsing if minor edits happen (Phase 5+).
* Highlight diffed/updated objects in 3D (flashing material).
* Track and display update statistics in dev mode.

---

## ✅ Final Deliverables

* `src/three/reconcileScene.ts` or inline in `SceneManager.ts`
* `Editor.tsx` with Monaco `onChange` dispatching `loadModel`
* Zustand subscription in `ThreeDViewport.tsx` triggering `reconcileScene`
* Tests for reconciliation, parser updates, and SSoT stability

