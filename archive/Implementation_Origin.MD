Implementation Plan for LDraw Web 3D Viewer & Editor (MVP)
This plan outlines a step-by-step implementation for a single developer to build the LDraw Web 3D Viewer & Editor MVP. It uses React (TypeScript) for the UI, Three.js for 3D rendering, Monaco Editor for live code editing, and a local LDraw parts library. The development is broken into phases (approximately week-by-week), with each phase delivering incremental features, adhering to test-driven development (TDD) and a modular architecture. The focus is on keeping the design simple (no unnecessary tooling) while ensuring future extensibility and maintainability.
Phase 1 (Week 1): Project Setup and Architectural Design
Goals: Set up the development environment, establish the project structure, and outline the core architecture. Ensure all needed libraries are installed and working, and define how to separate concerns for clarity and testability.
Project Initialization: Create a new React TypeScript project (e.g., using Create React App or Vite) in a single repository. Add dependencies: Three.js, Monaco Editor (or @monaco-editor/react), and any testing libraries (Jest, React Testing Library). No Nx/Turborepo – keep things simple and local.


Directory Structure: Design a modular, directory-based architecture. For example:


src/ldraw/ – LDraw parsing, data models, and format logic (pure logic, no direct rendering).


src/three/ – Three.js rendering utilities (scene setup, LDraw loaders, transform controls integration, etc.).


src/components/ – React components (UI elements like the 3D canvas, editor pane, control panels).


src/state/ (or similar) – Application state management and controllers that connect UI to logic (could use React context or simple singleton classes for the scene state).


Separation of Concerns: Clearly separate business logic from UI components from day one. For instance, parsing and model manipulation will reside in plain TypeScript classes/functions (under ldraw/), while React components in components/ will handle rendering and user interaction. This decoupling makes the code more modular, testable, and maintainable (Best Practices for Keeping Your React UI and Logic Separate). Each component or module should have a single responsibility.


TDD Setup: Configure the testing framework (Jest + suitable DOM testing for React). Write a couple of dummy tests to verify the setup. Plan to write tests for each logical module before or as it’s implemented. Emphasize the TDD cycle (red-green-refactor) to ensure high code quality and easier refactoring (The Benefits and Challenges of Test Driven Development | by Prasdika | Medium).


Basic App Scaffold: Implement a simple App component with a placeholder split layout: e.g., a area and a area side by side. For this week, these can be stub components (Canvas3D could just render a static “Hello Three.js” scene or a spinning cube; Editor could be a simple <textarea> or Monaco loaded with a sample text).


Local Parts Library Access: Ensure the LDraw parts library is available. For example, place it in a public folder or ensure a static server can serve part files. This will be needed when loading models. Document the path (e.g., /ldraw/parts/...) for later use. Three.js’s LDrawLoader allows setting a parts library path for resolving part files (threejs.org).


Outcome: By end of Phase 1, the project builds and runs with a basic UI. The developer has a clear blueprint of the architecture (documented in a README or comments). The testing framework runs. This foundation emphasizes clarity: any complex integration (Three.js, Monaco) is proven in a minimal way to avoid surprises later (e.g., verify Three.js can render something in the React app, verify Monaco can mount in a React component). The project is ready for feature development with proper structure.


Phase 2 (Week 2): LDraw Parser Module and Data Model Implementation
Goals: Build the core logic to parse LDraw files (.ldr/.dat) and represent the scene data in memory. Develop this module with TDD to ensure reliability. Also define data structures for parts and the scene.
Define Data Models: Design TypeScript interfaces/classes for the LDraw model:


LDrawPiece (or PartInstance): representing a single piece in the scene with properties like part ID (reference to a part file), position/rotation (transformation matrix or discrete translation/rotation values), color code, and maybe an identifier.


LDrawModel or Scene: representing the entire scene (which could be a top-level model containing multiple LDrawPiece or even sub-model references if needed). For MVP, a single model containing pieces is sufficient, but keep structure extensible for sub-models.


Parsing Logic: Implement a parser that can read LDraw plaintext lines and produce the data model:


Focus on Type 1 lines of LDraw (piece placement lines), since those describe placing a part in the scene (format: 1 <color> <x> <y> <z> <a11> ... <a33> <partName.dat>). This covers loading multiple pieces and positioning them. Also handle basic meta lines:


Type 0 lines (comments or META commands): ignore or store comments if needed (not critical for MVP except maybe to preserve when saving).


Other types (2-line, 3-triangle, 4-quad, 5-optional line) are primarily used inside part definition files for geometry. The MVP may not need to parse those in detail for the scene, because official parts cover geometry. However, if we allow editing of a part itself (enhanced piece editing), we might later parse some geometry lines. For now, restrict parser to assembly (Type 1) lines for simplicity.


Implement the parser as a pure function or class method that takes LDraw text (string) and returns a LDrawModel object. Keep it decoupled from any UI or Three.js – this is pure logic.


Test-Driven Development: Write unit tests for the parser covering various cases:


A simple .ldr content with one part (ensure it creates one LDrawPiece with correct attributes).


Multiple parts with different positions/rotations (verify the parser correctly interprets translation and the rotation matrix).


Edge cases: unknown part reference (the parser might still create a piece object referencing the part name; the rendering layer will handle missing geometry), comments in the file, etc.


If applicable, test parsing of an "enhanced piece" that might contain geometry lines (this could be deferred until we handle that in a later phase).


Internal Structure & Extensibility: Ensure the parser is written in a modular way, perhaps splitting responsibilities (e.g., a function to parse a line into a data structure, separate from orchestrating the whole file). This makes it easier to extend to more LDraw commands in the future. For example, prepare to handle sub-model (MPD) syntax or writes of “0 FILE” lines if needed later, but do not implement fully now – just keep the design open for it.


Integration (Minimal): This phase is mostly about logic. To validate integration, one can create a simple test or debug usage: use a hard-coded LDraw string (maybe representing a single brick) and run it through the parser, then log the result. Ensure the data looks correct. This doesn’t require the UI yet, but it sets the stage for plugging into rendering next phase.


Outcome: By end of Phase 2, we have a robust LDraw parsing module with comprehensive unit tests. The app’s core data model is defined (pieces and scene), and we can convert LDraw text input into an in-memory representation. This fulfills a key piece of the MVP – understanding LDraw files – with full test coverage on this logic.


Phase 3 (Week 3): Three.js 3D Rendering – Basic Model Viewer
Goals: Integrate Three.js to render the parsed LDraw model in the browser. Display at least one part or a simple model in 3D. This phase bridges the gap between the data model and visual output.
Three.js Scene Setup: In the <Canvas3D> React component (or a new component dedicated to the 3D view), initialize a Three.js scene:


Create a <canvas> or use Three.js’s WebGLRenderer to target a DOM element. Set up a camera (perspective camera), basic lighting (e.g. directional light or hemisphere light for decent visibility of a 3D object), and controls (optional orbit controls for the camera so the user can rotate/zoom the view).


This component will run an animation/render loop (use requestAnimationFrame or Three.js’s clock) to continuously render the scene. Keep the animation loop logic isolated (maybe use a custom React hook or a class in src/three/).


LDrawLoader Integration (Geometry Loading): To minimize complexity in generating geometry for LEGO parts, leverage Three.js’s LDraw support:


Use Three.js’s LDrawLoader (an addon class) to load part geometries. Configure it to use the local parts library: call LDrawLoader.setPartsLibraryPath('/path/to/ldraw/') so it knows where to find part files (threejs.org). (The path would point to the directory containing parts/ and p/ subfolders from the library).


Test this by loading a single part file: e.g., instantiate LDrawLoader and call loader.load('<partName>.dat', onLoad, onProgress, onError). On load, it returns a Three.js Group or Object3D with the part’s mesh. For example, Three.js docs show loading an LDraw model and adding it to the scene (threejs.org). We can adapt that: instead of an entire model file, load individual part files or a small model.


Alternate approach: Instead of using loader.load for each part separately (which might issue many HTTP requests), we could use loader.parse( text, onLoad ) if we have the text of the model. However, since we wrote our own parser, the strategy could be:


Use our parser to get the list of pieces.


For each piece, use LDrawLoader to load that part’s geometry (if not loaded before). The loader can cache results, or we can maintain a cache to avoid reloading the same part multiple times.


Assemble the parts in the Three.js scene according to their position/rotation from our data model. (Note: LDrawLoader when loading a full model file would do this assembly automatically. But if we handle parts individually, we must apply the transform from the LDraw data to each mesh).


To simplify MVP, an even quicker path: use LDrawLoader.load() on an entire .ldr file string (which requires building a Blob or using a data URL since loader expects a URL). Given time, it might be easier to let LDrawLoader parse & build the whole model geometry, then later integrate editing. However, doing so might bypass our own parser. We should ideally combine: use our parser for the authoritative data model (for editing), and use LDrawLoader only to fetch the geometry for each part referenced. This separation ensures our parser (which is tested) drives the content, and LDrawLoader (trusted library) handles the heavy geometry creation.


Render a Sample Model: Use either approach to render a basic model:


For example, create a sample LDraw string in code (or include a small .ldr file) representing a couple of bricks stacked. Parse it with our parser to get a model. Then iterate pieces: for each, call LDrawLoader to get the mesh (or possibly have LDrawLoader load the whole model at once for initial demo). Add the resulting meshes to the Three.js scene.


Adjust camera and controls to frame the model nicely (e.g., center the model by computing its bounding box or just position camera at a standard angle).


Testing & Verification: This is a visually oriented phase, so testing is partly manual:


Verify that when given a known input (like one brick at origin), the 3D view indeed shows that brick at the correct position.


If possible, inspect the Three.js scene graph in code: for example, after loading, check that scene.children contains the expected number of objects corresponding to pieces. If using our parser plus manual adding: ensure each LDrawPiece produced a Three.js Mesh with the correct part geometry. These can be asserted in integration tests (e.g., after a render update, the scene has N meshes matching N pieces).


Ensure that the rendering is correct (right colors, orientation). If colors are an issue (LDraw color codes need mapping to RGB), note to handle that in parser or rendering (Three’s LDrawLoader likely handles official color codes automatically).


Result: By the end of Phase 3, the application can display a 3D LEGO model from an LDraw file. It’s likely hard-coded or loaded via a dev-only method at this stage (since we haven’t hooked up the editor UI yet), but it proves that our data -> geometry -> rendering pipeline works. We have a Three.js scene integrated in React, and we can see a part or simple assembly on screen. We also kept the geometry loading abstracted (e.g., in a LDrawGeometryService or within the three/ module) so that the React component doesn’t have to know the details. Complexity is managed by using Three.js’s provided loader (rather than writing a full geometry parser ourselves), which keeps development efficient (threejs.org).


Phase 4 (Week 4-5): Scene Composition and Interactive Manipulation
Goals: Support scenes with multiple pieces and allow the user to manipulate those pieces (move/rotate) in the 3D view. This phase brings interactive editing capabilities to the scene viewport. It also involves updating the underlying data model when changes occur.
Multiple Pieces Rendering: Expand on Phase 3 to fully support multiple parts:


Instead of a hard-coded sample, allow the scene to be built from any parsed LDrawModel. In practice, after parsing, loop through all LDrawPiece objects and for each, load or retrieve its Three.js object (mesh or group) and add to the scene. The result should correctly overlay multiple bricks as described by the LDraw file.


If using LDrawLoader on the whole model was the initial method, consider switching to per-piece loading now for finer control. Implement a caching mechanism so that if the same part ID appears multiple times, we reuse the geometry (clone meshes) instead of loading again.


Test with a small multi-part LDraw file (e.g., two different bricks at different positions). Verify all appear. Add a unit test for the model-to-scene conversion function if possible (for example, a function that takes an LDrawModel and returns an array of Three.js Objects).


Selection Mechanism: Implement the ability to select a piece in the 3D scene:


Use raycasting on click events: on mouse click in the canvas, cast a ray and find which object (mesh) was clicked. Identify the corresponding LDrawPiece. One way is to store a reference from the Three.js mesh back to the data model (e.g., set mesh.userData.pieceId = ... so we know which piece it represents).


Maintain a selected state (could be a property in a React component state or a globally in the model controller). Only one piece selection at a time for now (multi-select will be addressed as an enhancement later).


Visual feedback for selection: e.g., highlight the selected piece by changing its material (maybe add a semi-transparent outline or glow), or use Three.js BoxHelper to show a wireframe box around it.


Transform Controls for Manipulation: Incorporate Three.js TransformControls to enable moving/rotating the selected object with mouse drag:


TransformControls is an add-on that provides a gizmo (arrows for translate, circles for rotate, etc., like Blender/3D editors) to manipulate an object (threejs.org). Import and add it to the scene, attaching it to the selected object. Configure it for translation and rotation (scaling can be disabled because we typically don’t want to scale LEGO pieces).


When a piece is selected, call transformControls.attach(selectedMesh) so the gizmo appears. The user can then drag the arrows to move or rotate.


Listen for TransformControls change events (it dispatches events like objectChange on each manipulation) (threejs.org) (threejs.org). On each confirmed change (or on mouseUp), update the LDrawPiece data in the model with the new position/rotation. (Compute the new translation and rotation from the mesh’s matrix or position/quaternion).


Also, guard to not treat clicks on the gizmo as de-selection of the object (distinguish gizmo interaction vs clicking empty space).


Updating the Data Model: Ensure that moving a piece updates the underlying data model:


Implement functions in the model controller (e.g., movePiece(pieceId, newPositionMatrix)) that update the stored transform of that piece. This logic is separate from the Three.js code – the 3D view should ideally call a method to update the model, rather than directly mutate the data structure in place without tracking.


With TDD, test these model manipulation methods: for example, start with a known transform, apply a move, and verify the internal data changed correctly (and that exporting it would yield the new coordinates).


Integration & Testing:


Write unit tests for selection logic if possible (e.g., given a set of pieces, a ray intersection function should identify the correct piece by id). This might require abstracting the raycasting into a testable function (e.g., pass a known set of object bounds and a ray, see which would hit first).


Test the transform update logic at the data level (simulate a user move by directly calling the model update and then maybe re-render or export to see if changes reflect).


Manual testing: run the app, load a multi-piece scene (via hardcoded or by pasting text if possible at this stage), then use the mouse:


Click on a piece – it should highlight.


Drag the transform gizmo’s arrows – the piece should move and stay in the new position when released.


Rotate similarly.


Click off to potentially deselect (implement deselection on clicking empty space).


Ensure that only the intended piece moves. Also verify that the transform control doesn’t accidentally detach or attach to the wrong object if multiple clicks.


Multi-Piece Manipulation (Basic): At this stage, we likely support editing one piece at a time. The MVP requirement mentions manipulation of multiple 3D pieces – meaning the scene supports multiple pieces, but not necessarily moving them simultaneously. If interpretation is multi-select, we'll handle that in Phase 7. For now, ensure we can manipulate all pieces one by one.


Outcome: By end of Phase 4-5, the application is an actual 3D editor: the user can view a composed LEGO scene and interactively reposition parts. The logic for selection and transformation is encapsulated (for example, a SelectionController or within the Three canvas component logic). The design remains modular: the Three.js-specific code (raycasting, transform controls) is isolated from the pure data model. Tests cover the data updates. This achieves a core part of the MVP – a basic LEGO CAD editor interface – in an incremental, testable way.


Phase 5 (Week 6): Monaco Editor Integration for Live LDraw Code Editing
Goals: Integrate the Monaco code editor into the app to allow live editing of the LDraw file text. Changes in the code should reflect in the 3D scene (one-way update, we will handle two-way sync in the next phase). This provides the “source code” editing aspect of the viewer/editor.
Monaco Editor Setup: Replace the placeholder editor (or <textarea>) with Monaco Editor:


Use the @monaco-editor/react package for easier integration, which provides a ready-to-use React component. This avoids the need for custom webpack configuration and works with CRA/Vite easily (@monaco-editor/react - npm) (@monaco-editor/react - npm).


Render the <Editor> component in the UI (in the LDrawEditor panel). Configure it with a suitable language mode. There is no official LDraw language mode, but we can use plaintext or create a simple custom language definition for syntax highlighting of numeric lines vs comments (optional).


Set the initial editor contents to something (could be an example model or blank). If a model is currently loaded (from previous steps), populate the editor with the exported LDraw code of that model.


Make the editor fill its container (maybe half the screen) and allow resizing if needed (could implement a splitter for user to resize 3D vs code panes).


Live Update on Code Change: Enable live editing – when the user types in the Monaco Editor, update the 3D scene:


The Monaco React wrapper provides an onChange prop or event that is called with the current value whenever the content changes (@monaco-editor/react - npm). Attach a handler onChange(newValue) that will receive the updated text of the editor.


Use a debounce or throttle (e.g., update at most 2-3 times per second) so that fast typing doesn’t cause a flurry of parse operations. Alternatively, require an explicit action like pressing a "Apply" button to reparse – but since the spec says live editing, we aim for automatic updates.


In the change handler, call the LDraw parser (from Phase 2) with the new text:


If parsing succeeds, obtain a new LDrawModel representing the scene.


Replace the old scene model with the new one (this could mean simply setting the new model as the current state in a state manager, and then re-rendering the 3D scene).


For rendering update: the simplest implementation is to clear the Three.js scene completely and then add all pieces from the new model (similar to initial load). This brute-force approach is fine for an MVP with small models, and avoids complex diffing of which parts changed. (It might cause a slight flicker or loss of current camera view if not careful; we can preserve camera and just remove/destroy old meshes then add new ones).


If parsing fails (e.g., user types an incomplete line), consider how to handle: perhaps keep the last good state and optionally show an error message in the UI. Monaco can mark errors, but since LDraw has no formal parser library, we might just catch exceptions or validation errors. For MVP, it’s acceptable to either do nothing on a parse error (ignore keystroke until it's valid) or display a simple alert/console error.


Make sure to also handle large updates: e.g., if the user replaces the entire text (maybe by loading a different file’s content), it should still reparse and update scene.


Testing:


Unit test the code-change handler function in isolation: supply a sample LDraw text to it and verify that the model updates accordingly (this is essentially reusing the parser tests, but now in the context of the integration function).


If using @monaco-editor/react, we might not easily simulate actual keystrokes in Jest (since Monaco is heavy), but we can test our model-update logic by calling it directly. We trust the Monaco component’s onChange to trigger it as long as we wire it correctly (the integration itself can be tested with a simple smoke test: render the Editor in a test, simulate an onChange event, and verify our handler was called).


Manual test the live update extensively:


Add a new part line in the code – see if a new piece appears in the 3D view at the right position.


Change a part’s coordinates or color in the text – verify the existing piece moves or changes color in the 3D view.


Delete a line – ensure the corresponding piece is removed from the scene.


Try a complex model paste – does it render all parts?


Verify that the selection and transform features from Phase 4 still work after the scene is updated. (After a reparse, any previous selection might be lost since we reconstructed the scene. That’s acceptable for now, though we could enhance by preserving selection by some ID or name if it exists in new model.)


Outcome: At the end of Phase 5, the application supports live editing of the model via code. The Monaco Editor is fully integrated: as the user edits the LDraw script, the 3D scene responds and updates to reflect the changes. This achieves the MVP feature of Monaco-based live LDraw editing. The architecture ensures that this is handled in a clean way: the editor component sends updates to a controller which parses and updates the model, and the rendering component reacts to model changes. We haven’t yet fed changes from the 3D side back to the code (that’s next), so currently the flow is one-directional (code -> scene). The feature is built with maintainability in mind — parsing and rendering are still decoupled and testable, and the Monaco integration is confined to the editor module.


Phase 6 (Week 7): Two-Way Synchronization (Scene Edits -> Code Updates) and Model Refinement
Goals: Close the loop between the 3D view and the code editor. When the user moves or adds/removes pieces through the 3D interface, the LDraw code in the Monaco editor should update to match. Also, refine the model management for consistency and prepare for saving.
LDraw Exporter Module: Implement the counterpart to the parser – an exporter that takes our LDrawModel in memory and produces LDraw format text. This will be used to reflect interactive changes back in the code editor and for final saving:


Similar to the parser, do this with TDD. Write tests for various scenarios:


A model with one piece: expect a single type-1 line with correct syntax (matrix, part reference, etc.).


Multiple pieces: lines should be output in perhaps the same order as in model (we can preserve the original order by storing lines or just output in current array order).


Include any formatting considerations (we can output in a standardized way, e.g., one piece per line with a newline at end).


If we want to preserve comments or formatting from the original input, that would complicate things; for MVP we can drop comments and output a clean regenerated file.


The exporter should use each LDrawPiece’s data: color, position, rotation. If rotation is stored as a matrix, convert it to the space-separated matrix elements in the proper order. (Alternatively, since LDraw rotations are typically given as a 3x3 rotation matrix, we ensure we maintain that form. If the user uses transform controls to rotate arbitrarily, we may end up with a matrix that includes those rotations; that’s fine.)


Include any meta lines needed: If the model is meant to be a standalone .ldr, we might include a “0 FILE” or title line. But not strictly necessary for MVP.


Sync from Scene to Code: Tie the exporter into the app so that whenever the data model changes due to user action in the 3D scene, the code editor text is updated:


After a transform (move/rotate) is completed on a piece, or any other model modification (like adding/removing a piece if we later allow via UI), call the exporter to get the updated LDraw text of the whole scene.


Use Monaco’s API to update the editor content. With @monaco-editor/react, if the editor is uncontrolled, we can call a method to set its value. Another approach is to treat the editor value as a piece of React state: since we have two sources of truth (the code editor and the model), making the editor a controlled component might simplify syncing. We can hold the LDraw text in state, update it via setState when model changes (which re-renders Editor with new value), and update it via onChange when the user types (which in turn updates the model). Implement whichever is simpler.


Be careful to avoid clobbering the user’s typing mid-stream: if they are in the middle of typing and the scene updates the text, it could reset their cursor. To mitigate this, only push updates from scene to code at certain points:


For moves/rotations initiated in the scene, it’s straightforward – user isn’t typing, so just update the code immediately.


If we later allow adding pieces via scene UI, those would add lines to code too.


We might skip continuously updating the code while the user is dragging a piece (since that would cause rapid text changes); instead, update on drop (mouse up).


After updating the editor value, ensure the Monaco cursor or view doesn’t jump weirdly. We might accept that the cursor moves if the line changed; that’s fine for MVP.


Model Consistency: With two-way sync, we should ensure the single source of truth is clear. Likely, the LDrawModel in memory is the source of truth, and both UI elements (3D scene and text editor) reflect it:


When user edits text, we parse into a new model object and replace the current model.


When user manipulates scene, we update the current model, then regenerate text from it.


This means we are effectively regenerating a model on every code edit and regenerating text on every scene edit. That’s acceptable for MVP scale. All updates funnel through the model.


This approach ensures the model is always in sync with whichever interface was used last, at the cost of sometimes losing formatting or comments in the LDraw text (since after an edit in scene, we output canonical text). This is acceptable in an MVP (the spec didn’t mention preserving comments or formatting).


Testing:


Expand unit tests to cover the exporter (from model to text) thoroughly (target 100% branches coverage on this critical logic).


Write a round-trip test: start with an LDraw text, parse it to model, then export it back to text, and parse again. Verify the final model matches the initial model (this checks that parse+export preserves data, even if text formatting differs).


Integration test idea: simulate a user action sequence in code:


Start with a known LDraw text in the editor (set the model via parser).


Simulate a move on a piece by directly calling the model’s update function (this bypasses needing a full Three.js simulation in test).


Then get the new text via exporter and verify it changed the coordinates as expected.


Optionally, parse that text and ensure the coordinates match the moved position.


Manual testing:


Do an edit in the code, then move a piece in the scene, then edit code again, etc., to ensure everything stays consistent and there’s no crash or desync.


Specifically, move a piece in the scene and check the text updates in Monaco immediately to the new coordinates (and the line corresponds to the correct piece).


Try multiple sequential moves and rotations and ensure the text updates each time correctly.


Verify that if the user deletes a piece via code or adds one via code, and then moves another piece, the text reflects exactly the current state.


Outcome: By the end of Phase 6, the 3D editor and code editor are fully synchronized both ways. The user can freely switch between dragging pieces and writing LDraw code, with the scene and code views updating each other. We have a complete model representation that can be parsed and exported, fulfilling the requirement for editing and reflecting changes in proper LDraw format. The application’s architecture has proven itself: the parser and exporter (logic) are independent and tested, the UI simply reflects the model. The code is safer to maintain because the extensive tests act as a safety net, ensuring changes can be made without breaking functionality (The Benefits and Challenges of Test Driven Development | by Prasdika | Medium).


Phase 7 (Week 8): Enhanced Piece Editing – Special "Box" Handling and Advanced Controls
Goals: Implement the advanced editing features described as "enhanced piece editing with special box handling". This likely involves additional visual aids or editing modes for certain pieces or selections. We interpret this as possibly handling grouped pieces or editing the dimensions of specific part primitives (e.g., a box). We will also refine selection capabilities (like multi-select) if needed.
Bounding Box Visualization: Introduce a feature to show a bounding box around selected items:


This can improve user awareness of a piece’s dimensions and orientation. Use Three.js BoxHelper or compute a Box3 for the geometry of the selected piece. Display a wireframe box. (If a piece is composed of multiple sub-parts in geometry, BoxHelper will encompass all, which is fine).


This is straightforward for single selections. Test it by selecting a piece and verifying the box aligns with the piece edges. This does not change the model, so it’s purely a rendering helper.


Multi-Selection Support: Allow selecting and transforming multiple pieces as a group (if required by spec or a desirable enhancement for MVP):


Implement multi-select (e.g., using Ctrl+Click in the 3D view to add to selection). Maintain an array of selected piece IDs instead of a single one.


When multiple are selected, we want to move them together. Three.js TransformControls doesn’t natively support multiple objects, but we can solve this by using a helper object:


Compute the collective bounding box of all selected pieces and create an invisible Group or empty Object3D at that center.


Attach TransformControls to this helper object.


When the user manipulates the control, listen to the objectChange event. Calculate the delta transformation (position or rotation change of the helper).


Apply that transformation to each selected piece’s data (and their meshes). For translation, if the helper moved by (dx,dy,dz), translate each piece by the same amount (Selecting multiple objects in the Transform Controls · Issue #6336 · mrdoob/three.js · GitHub). For rotation, rotate each piece around the helper’s origin by the same angle.


This effectively moves/rotates the group while keeping their relative arrangement.


On drop, update all those pieces in the data model and then update the code via exporter as usual.


This is complex; ensure to time-budget accordingly (hence possibly spanning into week 8). Write tests for the math of group transforms (e.g., rotating multiple points around a center).


If multi-select is not a strict MVP requirement, we can deprioritize or leave hooks for it. However, including it demonstrates extensibility. Mark the code clearly to handle single vs multiple selection using the same pipeline (e.g., always attach transform to either a piece or a group helper depending on selection count).


Special "Box" Piece Editing: If the spec refers to editing special pieces (perhaps pieces that are essentially rectangular boxes or similar):


Identify if any parts in LDraw are parameterized as boxes. LDraw primitives include box2 or box3 for rectangular box shapes. If the user is creating an "enhanced piece" that is a simple box (for example, a custom part that is just a scaled box), we can allow intuitive resizing.


Implementation idea: Provide a mode or a separate editor panel when such a piece is selected (or when user indicates to edit a part’s geometry). In this mode, show control points on the edges of the box in the 3D view that the user can drag to resize it. This would effectively change the dimensions of that part.


This requires mapping the visual resize to changes in the part’s LDraw definition. For instance, if the part is defined by a single line referencing a box primitive with certain scales, updating the scale factors and rewriting that line.


A simpler approach: since MVP might not want full arbitrary part editing, we can implement a numeric input: e.g., detect that a part is an axle or spring or a box and allow setting its length via a form, which updates the underlying part file lines. However, modifying official parts is not typical; more likely this refers to custom parts the user is designing.


To keep it contained: maybe treat “enhanced piece” as a separate concept (like a custom part being edited). Possibly out-of-scope for MVP to fully implement an editor for part internals, but we can demonstrate capability with one case (like editing a simple box part).


If doing this, create an EnhancedPieceEditor component or mode. It could reuse Monaco Editor to show the part’s .dat file text on side, and overlay the 3D with edit controls for that geometry. This starts to become a “part editor” feature within our app.


Given time constraints, we might limit this: implement the detection and maybe just show the bounding box differently (e.g., highlight in a distinct color if the piece is an unofficial part or a primitive) and note in documentation that the architecture allows adding editors for custom parts. We ensure the code is structured such that adding a “part editing mode” would be possible (the separation of main model vs part model is possible).


Testing:


For bounding box display, no heavy logic to test beyond ensuring enabling/disabling works (maybe unit test a function that computes the bounding box dimensions).


For multi-select: write tests for the math of grouping. For example, select two pieces at known coords, simulate moving the group +5 in X, check both pieces got +5 in X. Do the same for rotation (this might involve a bit of linear algebra in tests).


For special box editing: if implemented, test that adjusting the dimension yields correct LDraw code. E.g., if a part’s code has a 1 16 x y z ... box.dat, after resizing, the line’s transformation matrix changes as expected.


Manual testing:


Try selecting two pieces (hold Ctrl and click two). The transform gizmo should position at their center and moving it should move both. Check that after moving, both pieces’ lines in code updated accordingly.


If resizing a special part, verify the geometry updates live and code changes. For example, if editing a custom part defined by a box primitive, ensure the 3D box scales properly and the output reflects new size.


Ensure normal operations still work (single select still fine, code editing still fine).


Outcome: At the end of Phase 7, we have delivered the “enhanced” editing capabilities envisioned in the spec:


The UI provides helpful bounding boxes around selections for clarity.


(Optional/milestone) The user can select multiple pieces and move/rotate them as a group, which is a powerful addition for arranging a scene.


(Optional/milestone) If special piece editing was targeted, the groundwork is laid or an example is implemented (like resizing a box primitive). Even if not fully general, the code structure can support expansion of this feature.


Throughout this phase, we kept complexity in check by leveraging existing mechanisms (e.g., using a transform helper for group moves as recommended (Selecting multiple objects in the Transform Controls · Issue #6336 · mrdoob/three.js · GitHub), using the model’s own data to handle special cases rather than new global logic). We also documented any limitations (for instance, “multi-select does not yet support rotating around arbitrary pivot, just around group center” or “only box primitives are supported in part editing”).


The architecture remains modular: multi-select is an extension of the selection module, and special part editing would be an extension of either the part model or a plugin module. This demonstrates extensibility – new features can be added without major rewrites, thanks to the clean separation of concerns established earlier.


Phase 8 (Week 9): Save/Load Functionality and Final Polishing
Goals: Implement the ability to save the current scene (and any custom parts) to files in proper LDraw format, and load existing files. Perform final testing, polishing of UI, and ensure the MVP is complete and robust.
Scene Saving (Export): Now that the exporter is implemented and tested, integrate a UI control to save the scene:


Add a "Save" or "Download" button. When clicked, it triggers the exporter to produce the LDraw text for the scene (just like what we’ve been syncing to the editor).


Create a blob of this text and use the browser’s download API to save it as, e.g., model.ldr. Alternatively, open a modal with the text that the user can copy. The direct download is more user-friendly.


If there are custom “enhanced pieces” (i.e., if the user created/modified part files in the session), we need to save those too. An MVP approach: if a piece is detected as custom (not from the official library), when saving, prompt the user to save that part’s .dat as well. This could be a list of files to save.


We might not implement a full MPD (multi-part) file packing (combining model and sub-part in one file) due to time. Instead, instruct user to save the part file separately. Document this behavior.


Test saving: create a small scene, click save, then try loading that file (manually or via the app’s load) to ensure it round-trips correctly.


Scene Loading (Import): Allow the user to load an LDraw file into the editor:


Add an "Open" button or drag-and-drop area. Upon file selection, read the file as text (use FileReader API).


Pass the text to the same parse routine and load the model+scene, and populate the Monaco editor with the text. This is essentially the same as if the user pasted the text, but more convenient.


Handle errors (if file is not proper LDraw format, show an error message).


Test loading with known LDraw example files (maybe from LDraw official models or a small sample we include).


UI/UX Refinements: Ensure the interface is user-friendly:


Maybe add basic instructions or labels (like tooltips for the buttons, a short text in the editor panel about editing).


Make sure the layout is responsive or at least decent on different screen sizes (since it’s a SPA, perhaps ensure the editor can scroll if content is large, etc.).


If time, add quality-of-life features: e.g., a grid or ground plane in the 3D view to help judge scale, snapping transform controls to grid, undo/redo for moves (could be another advanced feature, but if not now, leave for future).


Performance Check: With all features in place, test the app with moderately complex models (dozens of pieces):


Ensure that parsing and rendering are reasonably fast (within a second or two). If too slow, note potential optimizations (like using web workers for parsing or Three.js’s packed model approach (threejs.org)). We likely won’t implement these now, but the architecture should allow them later (since parsing is a self-contained module, we could offload it to a worker thread in the future without changing the rest).


Check memory usage if possible – adding and removing parts repeatedly should not leak (Three.js objects should be disposed if removed; ensure we properly clear geometries on reloading scene to avoid accumulating unused meshes).


Full Test Pass: By now, unit tests should cover most logic. Do a final pass to increase coverage:


Test any utility functions added in late stages (e.g., the file load function logic with a sample string).


If any component logic is complex (like the top-level App state management for sync), consider using React Testing Library to mount the App and simulate a simple scenario end-to-end (like provide an LDraw text, trigger parse, then trigger an export, and compare output).


Verify all previous tests still pass (no regression).


Maintainability Review: Review the code for clarity and modularity:


Ensure each directory/module has a clear responsibility. If some modules grew too intertwined, perform targeted refactoring. For example, if the Three.js canvas component is doing too much (like also parsing text), move that logic out to the controller or a custom hook.


Confirm that business logic is not buried in UI code (which aligns with our architecture principle). This makes future maintenance easier as per the separation-of-concerns strategy (Best Practices for Keeping Your React UI and Logic Separate).


The test suite also acts as up-to-date documentation of behavior, aiding maintainability.


Documentation: Write or update documentation for the project:


Update the README with instructions to run the app and run tests.


Include a summary of the architecture (directories and their purposes, how the data flows from code to scene and back).


Note any deviations from the spec or known limitations (e.g., “Currently supports official parts and simple custom parts. Some LDraw meta commands like STEP are ignored in this MVP.”).


This documentation ensures that anyone reviewing or continuing development can quickly grasp the design decisions.


Outcome: By the end of Phase 8, the MVP is feature-complete and polished. The user can load LDraw files, view and edit the model in 3D and code, and save their changes. All key features from the specification are implemented: parsing/rendering LDraw, scene composition with multiple parts, interactive manipulation, live code editing via Monaco, special editing aids (bounding boxes/multi-select), and saving in proper format. The product is delivered with full test coverage on logic and a clear, modular codebase ready for future enhancements. Developer efficiency was maximized by reusing proven libraries (Three.js loaders, Monaco, etc.) and avoiding over-engineering, while the architecture ensures that the app can scale up (we can add more LDraw features or even multi-file project support without reworking the whole system). The single developer can be confident in the robustness and maintainability of the application due to the disciplined iterative approach and TDD practices employed throughout the development.



