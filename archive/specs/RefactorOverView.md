This is a detailed, thoughtful, and comprehensive refactoring implementation plan designed for a single programmer. It systematically overhauls the architecture to address the root causes of instability and complexity, strictly adhering to the KISS principle.

### Refactoring Strategy: Simplicity Through Structure and Flow

The plan focuses on three core architectural changes:

1.  **Single Source of Truth (SSoT):** A centralized data model (`LDrawModel`) will be the sole authority on the application state.
2.  **Structural Normalization (The Pivot Object Pattern):** Resolving the LDraw Center vs. Three.js Origin conflict structurally within the scene graph, eliminating complex runtime math.
3.  **Uni-directional Data Flow (UDF) and Regenerative Serialization:** Enforcing a strict data flow and guaranteeing synchronization by regenerating the LDraw text after 3D manipulations. This sacrifices comments/formatting for absolute reliability and simplicity.

---

### Phase 1: The Foundation - SSoT and UDF

The immediate goal is to centralize the state and enforce a unidirectional read path.

**Duration:** 1-2 Days

#### 1.1. Centralized Store and Data Model

1.  **Implement State Management:** Use a lightweight library (e.g., Zustand, which integrates well with React and Three.js).
2.  **Define the Store:** The store holds the `LDrawModel` (the SSoT) and the application state (e.g., `selectedIds: Set<string>`).
3.  **Stable IDs (Critical):** Refine the `LDrawPiece` interface to mandate a unique, persistent `id` (UUID).
4.  **Refactor Parser:** Ensure the parser generates these unique IDs when creating the `LDrawModel`.
5.  **Implement Serializer:** Create a pure function `serializeModel(model: LDrawModel) => string`. This generates the canonical LDraw text representation.

#### 1.2. Define Core Actions

Implement the functions that mutate the store. These are the *only* way the state should change.

*   `loadModel(ldrawText: string)`: Parses text, assigns IDs, and replaces the model in the store.
*   `setSelection(ids: string[])`: Updates the selection state.
*   `updatePieceTransforms(updates: {id: string, position: ..., rotationMatrix: ...}[])`: Updates transforms for one or more pieces.

#### 1.3. Refactor Views as Consumers (The Read Path)

1.  **Decouple Views:** Refactor the Three.js Renderer and Monaco Editor components to read data exclusively from the central store.
2.  **Temporary Disablement:** Temporarily disable editing interactions in Monaco and the 3D view. Focus on ensuring the application loads and displays the model correctly from the SSoT.

**Verification for Phase 1:**

*   Unit tests pass for parser (generating IDs), serializer (generating correct text), and store actions.
*   A sample LDraw file loads, populates the store, and displays correctly in both the 3D view (using existing rendering logic) and the editor.

---

### Phase 2: The Structural Fix - The Pivot Object Pattern

This phase addresses the root cause of interaction instability: the Center/Origin conflict.

**Duration:** 1-2 Days

#### 2.1. Implementing the Pivot Object Pattern

1.  **Refactor Geometry Loading:** Modify the function that converts an `LDrawPiece` into a Three.js object.
2.  **Create the Pivot Group:** For each piece, create a `THREE.Group`. This is the "Pivot Object." Store the piece's ID in `group.userData`.
3.  **Calculate and Apply Inverse Offset:**
    *   Load the geometry (`THREE.Mesh`).
    *   Calculate its geometric center offset using its bounding box.
    *   Set the `Mesh`'s local position to the *inverse* of this offset (e.g., if the LDraw center is Y=-10, set the mesh local position to Y=+10).
4.  **Assemble:** Add the offset Mesh as a child of the Pivot Group.
    *   *Result:* The Pivot Group's local (0,0,0) is now the visual center of the piece.

#### 2.2. Coordinate Boundary and Cleanup

1.  **Define Conversion Utilities:** Create strict `LDrawToThree()` and `ThreeToLDraw()` functions. This is the *only* place the -Y/+Y conversion happens. Apply `LDrawToThree()` to the Pivot Group.
2.  **DELETE Legacy Math (Critical):** Remove all code related to "Delta-Based Movement" and "Center-Aware Transformations." This complexity is no longer needed.

**Verification for Phase 2:**

*   Load a standard brick (e.g., 3001.dat).
*   Inspect the Three.js scene graph. Verify the Pivot Group is positioned correctly and the child Mesh has the correct local offset.
*   Manually rotating the Pivot Group (via dev tools) must cause the brick to rotate perfectly around its visual center.

---

### Phase 3: Smart Reconciliation and Code-to-3D Flow

This phase optimizes rendering updates and re-enables live editing from the editor.

**Duration:** 1 Day

#### 3.1. Smart Scene Reconciliation (Diffing)

Instead of rebuilding the scene on every change, update only what is necessary.

1.  **Implement the Synchronizer:** Create a mechanism in the renderer that subscribes to the store.
2.  **Diffing Logic:** When `LDrawModel` changes, compare the new model with the existing scene using the Stable IDs.
    *   **Add:** Create Pivot Objects for new IDs.
    *   **Remove:** Dispose of and remove Pivot Objects for deleted IDs.
    *   **Update:** For existing IDs, compare the data (transform, color, etc.) and update the Three.js object *only* if it differs.

#### 3.2. Re-enable Live Editing (Monaco → SSoT → 3D)

1.  **Hook up Monaco `onChange`:** Re-enable editing.
2.  **Debounce and Dispatch:** On change (debounced, e.g., 300ms), dispatch the `loadModel(editorText)` action.
3.  **Automatic Update:** The Smart Reconciliation logic will now efficiently update the 3D view.

**Verification for Phase 3:**

*   Edit coordinates in Monaco. The corresponding piece should move smoothly after typing stops.
*   Verify that only the edited piece updates; there should be no flicker or reloading of other objects.

---

### Phase 4: Simplified 3D Interactions and 3D-to-Code Flow

With the normalized structure, 3D interactions become straightforward and reliable.

**Duration:** 2 Days

#### 4.1. Selection and Transformation

1.  **Refactor Raycasting:** Implement clicking. When a ray hits a `Mesh`, traverse up (`.parent`) to find the Pivot Group. Use the ID in `userData`.
2.  **Dispatch Selection:** Dispatch the `setSelection` action.
3.  **Attach Gizmo:** When a single ID is selected in the store, attach the `TransformControls` (gizmo) directly to the corresponding Pivot Group. It will automatically be centered.
4.  **Handle Transformation End:** Listen for the `dragging-changed` event (when the user releases the mouse).
    *   Read the new absolute transform directly from the Pivot Group.
    *   Convert using `ThreeToLDraw()`.
    *   Dispatch `updatePieceTransforms`.

#### 4.2. 3D-to-Code (Regenerative Serialization)

1.  **Subscribe Monaco to Store:** Ensure the Monaco component is subscribed to changes in the `LDrawModel`.
2.  **Regenerate and Replace:** Whenever the `LDrawModel` changes (e.g., after the 3D interaction in 4.1), run the Serializer (from 1.1) and replace the *entire* content of the Monaco editor with the result. This guarantees synchronization.

**Verification for Phase 4:**

*   **The "Jump" Test (Critical):** Select a piece and start dragging. The movement must be smooth with absolutely no initial "jump."
*   **Synchronization Test:** Drag a piece in 3D. Verify the coordinates in Monaco update immediately upon release.

---

### Phase 5: Multi-Select and Group Transformations

The final step is handling group interactions using the established clean architecture.

**Duration:** 2-3 Days

#### 5.1. The Temporary Transform Group Pattern

1.  **Handle Multi-Selection:** Update the selection logic to handle Shift/Ctrl clicks, dispatching multiple IDs to `setSelection`.
2.  **Create Temporary Group:** When multiple IDs are selected in the store:
    *   Calculate the geometric center (centroid) of all selected Pivot Groups.
    *   Create a temporary `THREE.Group` (the "Selection Group") and position it at the centroid.
    *   Attach the `TransformControls` gizmo to this Selection Group.

#### 5.2. Group Manipulation and Commitment

This requires careful handling of Three.js parenting while preserving world transforms.

1.  **Temporary Reparenting (Attach):** When the user starts dragging the gizmo, iterate through the selected Pivot Groups and use the `attach` method (a standard Three.js utility or manual world matrix calculation) to move them into the Selection Group: `selectionGroup.attach(pivotGroup)`. This makes them children of the moving group without visually jumping.
2.  **Manipulation:** The user manipulates the Selection Group, and the children follow.
3.  **Committing the Change (Detach):** When the user releases the mouse:
    *   Iterate through the children and attach them back to the main scene: `scene.attach(pivotGroup)`. This bakes their new world transforms.
    *   Read the new world transforms of all involved Pivot Groups.
    *   Convert using `ThreeToLDraw()`.
    *   Dispatch a single `updatePieceTransforms` action containing all updates.
    *   Dispose of the temporary Selection Group.

**Verification for Phase 5:**

*   Select multiple pieces. Verify the gizmo appears at their collective center.
*   Translate the group; they must move rigidly together.
*   Rotate the group; they must orbit the collective center.
*   Verify that Monaco updates correctly for all pieces involved upon release.