Technical Specification: LDraw Web 3D Viewer & Editor
Architecture Overview
The LDraw 3D Viewer & Editor will be organized as a modular, layered system built with React for the UI, Three.js for 3D rendering, and Monaco for code editing. The application runs in a web browser and will reside in a single monorepo containing multiple logical modules. At a high level, the architecture is divided into the following layers:
UI Layer (React & CSS): Provides interactive panels, buttons, and the Monaco editor, as well as a container for the Three.js canvas. This layer handles user input (mouse, keyboard) and dispatches events to the underlying system (e.g., user clicks "Rotate" or drags a piece).


Application Core: The core logic is split into modules for scene management, LDraw parsing, rendering control, interaction handling, and editor integration. Each module has a clear responsibility, enabling test-driven development and maintainability.


3D Rendering Layer (Three.js): Responsible for actual 3D visualization. It maintains the Three.js scene, camera, lights, and objects. The renderer module converts the abstract scene representation (Pieces, geometry, etc.) into Three.js Meshes, Lines, and Groups.


Data & Persistence Layer: Handles LDraw file I/O – parsing .ldr/.dat files into internal data structures and saving scene or part data back to LDraw format. This layer also manages any needed access to an LDraw parts library for resolving sub-part references (threejs.org).


The design is event-driven: user actions (e.g., selecting a piece, editing code) produce events that update the application state (scene graph, piece properties), which in turn triggers UI updates (re-render React components or Three.js scene updates). React will manage the UI state, while the Three.js scene graph state is managed by the Scene Manager module. We will avoid tight coupling between React components and Three.js objects – interactions go through the core modules so that logic can be tested independently of the UI rendering.
All modules will be developed with testability in mind: business logic (parsing, state updates, transformations) is kept separate from Three.js or DOM direct manipulation, allowing us to write unit tests for those parts. The architecture is designed to be extensible; new features (e.g., new Special Box types or different file format support) can be added by creating new modules or extending existing ones without disrupting the whole system.
Core Modules and Responsibilities
The monorepo will contain separate directories or packages for each core module. The table below outlines each module and its primary responsibilities:
Module
Responsibilities
Notes
LDraw Parser
Parse LDraw files (*.ldr, *.dat) into an internal scene representation. Supports all LDraw line types (0-5) (LDraw.org - LDraw File Format Specification), handling file structure (including multi-part files), coordinate values, transformation matrices, and color codes (LDraw.org - LDraw File Format Specification). Performs basic validation of LDraw syntax.
- Implements full LDraw spec support (see File Format Support).- May reuse or reference Three.js LDrawLoader logic, but custom parsing is preferred for fine-grained control and live editing. QUESTION: Should we use the Three.js LDrawLoader for parsing to speed up development, or implement our own parser to allow better live-edit integration? ANSWER: We will implement our own parser to allow better live-editing integration.
Scene Manager
Maintain the state of the current Scene (one or more Pieces). A Scene contains a list of Piece instances (including their position, orientation, color, and any special boxes if Enhanced). Provides an API to add/remove Pieces, group selections, and apply transformations. Ensures each Piece is treated as a cohesive object (even if composed of many sub-geometries). Manages hierarchy: for example, grouping multiple selected pieces for collective transformations.
- Represents Pieces as objects with properties (including children for special boxes). - Responsible for linking each Piece with its Three.js representation in the renderer. - Handles parent-child relations (e.g., a temporary group for multi-selection).
Three.js Renderer
Set up and manage the Three.js scene, camera, controls, and lights. Converts parsed LDraw geometry into Three.js meshes and lines. Creates a Three.js Group for each Piece, treating it as one selectable object. Updates the Three.js scene graph when the Scene Manager state changes (e.g., adding or moving a piece). Implements rendering optimizations (e.g., merging geometry by material or using instancing in future) without changing core logic.
- Uses the LDraw Parser output to build geometry. Each LDraw triangle (type 3) becomes a Three.js face; quads (type 4) are split into two triangles; lines (type 2/5) become Three.js LineSegments for edges. - Applies LDraw coordinate system conversions if needed (LDraw uses right-handed coordinates with Y-axis inverted relative to typical 3D up-axis, see Rendering Pipeline). - Maintains a mapping from Piece in Scene Manager to Three.js Group/Mesh for selection.
Interaction Controller
Handle user input for selecting and manipulating pieces. Includes mouse picking (raycasting) to select pieces or special boxes, and keyboard or UI gestures to move/rotate. Uses Three.js controls for transformations (e.g., attaching a TransformControls gizmo to the selected piece or group of pieces). Allows multi-selection via modifier keys (Ctrl/Shift+click) or a selection marquee (future extensibility). Interprets UI button clicks (e.g., "Move" or "Rotate" mode) to switch the transform tool.
- Implements selection: on mouse click, determine which Piece (or Special Box) was clicked and notify Scene Manager. - Implements transformation: attach a transformation gizmo to the selection. For multi-select, creates a temporary group as parent and attaches the gizmo to that group so all move/rotate together. After transform, updates each piece’s position/rotation in Scene Manager and then dismantles the group. - Ensures that even if a user clicks on a sub-part of a Piece (e.g., one triangle), the whole Piece’s group is selected (cohesive selection).
Monaco Editor Integration
Provides the embedded code editor for LDraw editing. Loads the LDraw text of a selected Piece’s instance-level definition into Monaco. Supports a limited editing scope: the user can edit the LDraw code that defines that instance in the scene, not the global part file. On edit, validates the text for LDraw syntax correctness and propagates changes to the Scene Manager (which triggers re-render). Implements live preview: as the user makes valid changes, the 3D view updates in near-real-time.
- Likely uses react-monaco-editor to embed Monaco in a React component. - When a Piece is selected, it generates the LDraw snippet corresponding to that instance (could be as simple as one Type 1 line, or a multi-line embedded submodel if the piece has been enhanced/modified in the scene). - Edit process: on each change or on debounce, run the LDraw Parser on the snippet. If parsing fails, show Monaco error markers; if success, update the internal representation of that piece (and its special boxes). - Prevent edits from affecting the original part definition on disk. If the user attempts to change the part reference or geometry, we treat it as an instance-specific override (see Monaco Integration section for strategy).
Special Box Manager
Manage Enhanced_Piece data – the additional Special Boxes (Collision_Box, Boundary_Box, Stud_Box, Receiver_Box) attached to pieces. Provides functions to add or remove a Special Box to a Piece, and ensures each box’s position/orientation is stored relative to the piece. Handles toggling visibility of boxes by type. Integrates with Scene Manager and Renderer (each box is a selectable/editable sub-object rendered in a distinct color).
- Defines data structures for Special Boxes (type, dimensions, link to parent Piece). - When adding a box, creates a new sub-entity (could be represented as an internal LDraw sub-part or just a parametric shape) and attaches it to the Piece’s group in the Scene and Three.js. - Provides logic for toggling: e.g., enable/disable rendering of all Stud/Receiver boxes or Collision/Boundary boxes. - Ensures if a Piece moves/rotates, its boxes move with it (because they are children of the Piece’s Group in Three.js). If a box itself is moved by the user (adjusting placement), update its stored offset in Scene Manager.
Persistence (I/O) Module
Handle loading and saving of files. On load: uses LDraw Parser to read a file (could be a scene or a single part) and populate the Scene Manager. On save: exports the current Scene to an LDraw-formatted file. Also supports exporting an Enhanced_Piece (a part with its special boxes) as a standalone .dat file. Ensures that the output follows LDraw format standards as much as possible (including multi-part structure if needed).
- Loading: If the file is a Scene (possibly containing multiple parts), ensure all referenced sub-part files are found (via library or embedded). If any Enhanced Pieces are present, parse their special geometry (could be indicated via custom meta or by structure). - Saving Scene: If Enhanced Pieces exist, decide how to store them. Likely uses MPD (Multi-Part Document) structure to embed modified piece definitions inside the scene file so that it’s self-contained (DAT - LDraw.org Wiki). QUESTION: Should saved scene files use the .ldr extension (convention for models) instead of .dat to align with LDraw standards (DAT - LDraw.org Wiki)? Currently, we plan to use “*.dat” as requested, but adopting .ldr for multi-part scenes could aid compatibility. - Saving Enhanced Piece: Write a .dat file containing the original part geometry plus added box geometries. Possibly include custom meta comments to denote special boxes for future editing. QUESTION: How should special boxes be represented in saved files? We could save them as regular LDraw geometry (e.g., 6 faces per box) or as references to predefined box parts, with meta lines indicating their type. Using meta tags (e.g., 0 !StudBox BEGIN/END) could help identify them on re-import, but requires a custom extension. ANSWER: Predefined special_box.dat parts that unscaled size matches the Reciever_Box and Stud_Box size, and will need to be scaled for Collision_Box and Boundry_Box (as they are unique size for each piece). And mark them with meta tags. 

Each module will be implemented as an independent unit (e.g., as separate directories or classes). Clear interfaces will be defined between modules. For example, the Interaction Controller will call SceneManager.selectPiece(pieceId) and SceneManager.transformPiece(pieceId, newTransform), and the Scene Manager will emit events or callbacks that the Renderer listens to in order to update the Three.js scene. This decoupling ensures that each module can be tested in isolation (e.g., feed the parser various LDraw strings and check the output data structures, or simulate user inputs to the Interaction Controller and verify the resulting scene state).
Rendering Pipeline and LDraw Format Support
This section describes how the system will take LDraw data and render it in 3D, addressing coordinate systems, geometry creation, and performance considerations.
LDraw File Parsing and Geometry Assembly
The LDraw Parser module will fully support the LDraw file format specification. LDraw files are text-based and consist of one command per line (LDraw.org - LDraw File Format Specification), where each line starts with an integer "Line Type" (LDraw.org - LDraw File Format Specification) that determines how to interpret the rest of the line. Key elements of LDraw format and our support plan are summarized below:
LDraw Feature
Support in Viewer
Line Type 0: Comment or META
Supported. These lines do not produce geometry. Comments (e.g. titles, remarks) are stored if needed for re-export. Recognized META commands are processed if relevant (e.g., 0 FILE for MPD structure, BFC orientation, or custom meta for special boxes). Unrecognized metas are ignored but preserved for saving.
Line Type 1: Sub-file Reference (Piece reference) (LDraw.org - LDraw File Format Specification)
Supported. This is how one part references another. We parse the part reference line, which has format 1 <Color> <X> <Y> <Z> <a> <b> <c> <d> <e> <f> <g> <h> <i> <File> (LDraw.org - LDraw File Format Specification). We apply the 3x3 rotation/scaling matrix (a..i) and translation (X, Y, Z) to the referenced part’s geometry. Color handling: color code 16 means "current color" (inherit the parent’s color) and will be handled by substituting the parent’s color into the child part (LDraw.org - LDraw File Format Specification). If the color is a fixed code (not 16), it overrides any color 16 lines in the sub-part. Nested references are resolved recursively. External references are loaded via the parts library path or cache (the application will require the official LDraw parts library to be available, or use packed parts). If a sub-file is not found, an error is logged.
Line Type 2: Line (Edge)
Supported. Edges will be rendered as line segments for visual reference. We will create Three.js LineSegments with a distinct material (e.g., solid color). By LDraw convention, line type 2 is usually colored with code 24 (the "edge color") (LDraw.org - LDraw File Format Specification). Our color handling will map code 24 to an appropriate edge color (often a contrast to the part’s color as defined in LDConfig.ldr (LDraw.org - Colour Definition Reference)). These edges help outline parts in the viewer.
Line Type 3: Triangle
Supported. Each triangle is converted to a Three.js geometry face (we will likely use BufferGeometry). Triangles carry a color code which we map to an actual material/color using the LDraw palette. We ensure the vertices are transformed by any parent sub-file matrices. All triangles of a given color within a Piece can share one Three.js Mesh for efficiency (one material per color).
Line Type 4: Quadrilateral
Supported. Quads are split into two triangles (typically along the diagonal that preserves the proper winding order). They are then rendered like line type 3 geometry. We will be cautious about non-planar quads (LDraw assumes they are planar; if not, the split might cause slight rendering differences).
Line Type 5: Conditional Line (optional edge)
Supported (with limitations). Conditional lines are edges that should appear only under certain viewing angles (to outline curves). Full support requires evaluating a conditional line’s control points against the camera position. As an initial approach, we may render conditional lines the same as normal edges, or possibly omit them, to minimize complexity. Future enhancement: implement logic to hide/show conditional lines based on viewpoint.

In addition, colour standards will be respected. LDraw defines colors by numeric codes, with definitions (RGB values, material properties) in the LDConfig.ldr file (LDraw.org - Colour Definition Reference). We will incorporate the official color definitions so that parts appear in correct colors. For example, code 4 is red and code 2 is green (LDraw.org - Colour Definition Reference). We will use Three.js materials (likely MeshStandardMaterial or MeshPhongMaterial for solid parts) with those color values. Special finishes (like chrome, transparent, rubber) might be represented in LDConfig.ldr with material attributes; our initial implementation will map these to basic approximations (e.g., chrome could be a shiny metal material). Edge color 24 is handled by using the edge’s parent color’s complementary edge color (defined in LDConfig) or a default (like dark grey/black) if not explicitly defined.
Back-face culling (BFC): LDraw parts often include meta lines like 0 BFC CERTIFY CW/CCW indicating face orientation for correct culling (LDraw.org - Colour Definition Reference). The renderer will by default use double-sided rendering for part geometry to avoid missing faces (simpler and safe). However, for performance and visual correctness, we can utilize BFC info: if a part is certified CCW, we know the winding order of triangles is CCW when viewed from the front, so we can enable back-face culling on that geometry. This is an optimization; initially we might render all faces double-sided and add BFC-based culling later.
Coordinate system: The LDraw coordinate system uses a right-handed system with a specific orientation: traditionally, LDraw uses +X, +Z on the ground plane and +Y pointing downward (so -Y is the "up" direction in the LEGO model frame) (Orientation of flex parts - Forums LDraw.org). Three.js by default uses +Y as up. We have two choices: (a) adopt LDraw coordinates as-is (meaning models might appear rotated in Three.js space), or (b) transform the entire model to match Three.js conventions (e.g., swap Y and Z axes or apply a rotation so that LDraw's -Y becomes Three.js +Y). We will likely apply a constant rotation to the root scene (e.g., rotate around X-axis by -90°) so that the LEGO model's "up" (studs pointing up) corresponds to the screen's +Y up. QUESTION: Should we convert the coordinate system on import (for consistency with Three.js and easier camera setup), or maintain LDraw’s native orientation and adjust the camera? This decision impacts how we interpret the axes from the LDraw data. In either case, all internal computations will be consistent once the choice is made. ANSWER: Convert on import for consistency with Three.js and camera setup. But will need to be translated back into the LDraw native orientation when saving Scenes and Enhanced_Pieces. 
Geometry Creation and Rendering
After parsing, the Renderer module takes the structured data (Scene graph with Pieces and geometry primitives) and creates Three.js objects:
Each Piece in the Scene is represented as a Three.js Group object. This group will contain one or more child meshes or lines that represent the geometry of that piece. By grouping, we ensure that selecting or transforming the piece affects all its geometry together (including special boxes).


For the actual brick geometry: we will create a Three.js Mesh for each distinct color in the piece. For example, if a part has its main body in color 5 and some printed pattern in color 1, we create two meshes under that piece’s Group. This way, we can apply a single-color material to each mesh. All triangles (and converted quads) of the same color can share a BufferGeometry.


Edges (line type 2 and 5) can be combined into a single Three.js LineSegments object (with a LineBasicMaterial, likely using the edge color or a neutral color). Alternatively, edges could be omitted or toggled by the user (we might provide an option to hide/show edges for a cleaner view).


Special Boxes: For Enhanced_Pieces, each special box (Collision_Box, Boundary_Box, Stud_Box, Receiver_Box) will also be represented in Three.js. We will likely model each box as a simple rectangular wireframe or solid box. For visual clarity, we will use distinct colors: green for Stud/Receiver and red for Collision/Boundary. For example, a Stud_Box might be rendered as a semi-transparent green cube sitting on top of a stud connection point. All special box objects are added as children of the Piece’s Group as well. They may be represented by a Three.js Mesh (with transparent material) or a WireframeHelper for visibility. They are selectable (the Interaction module will recognize them), but operationally they remain linked to the parent piece.


The Scene graph in Three.js will mirror the logical Scene: The root scene contains all Piece Groups (positioned according to their translations in the scene file). Lights and camera are separate. If multiple pieces are selected and a transform group is created on the fly, that group is not persisted in Scene Manager (it’s just for manipulation), and will be removed after the operation.


We will initialize a camera (likely a perspective camera) and utilize Three.js’s orbit controls for user navigation around the model. The camera will initially frame the entire scene (we can compute bounding box of all geometry to set a good initial distance). Users can orbit, zoom (scroll), and pan as expected in a 3D viewer.
Rendering loop: We will use Three.js’s WebGLRenderer. Since React is in use, we must ensure the Three.js canvas either updates on animation frames. We can run an animation loop to continuously render the scene, or use Three.js’s requestAnimationFrame. Because most of the time the scene is static (unless the user is actively interacting), we could optimize by rendering on-demand (render on state changes or at least throttle frame rate when idle). Initially, a simple continuous render loop is fine for simplicity.
Performance considerations: The initial implementation targets correctness and clarity over maximum performance. However, the design enables future optimizations:
We will design the geometry builder such that repeated parts can share geometries or materials. For example, if 10 identical Pieces (same part number and color) are in the scene, we could instantiate one geometry and reuse it for all (via cloning meshes or using InstancedMesh). The architecture (separating data from rendering) allows us to incorporate instancing later without changing how scenes are defined. We simply plug in a different rendering approach for repeated parts when we optimize.


Level of Detail (LOD): for very large scenes, we might introduce simplified representations of pieces far from the camera (or allow dropping rendering of studs or edges). This is not in the initial scope, but the modular design means the Renderer could be extended with an LOD system in the future.


Three.js has utilities to merge geometries by material (the LDrawLoader example uses LDrawUtils.mergeObject() to merge all meshes by material for better runtime performance at cost of losing interactivity of sub-parts (threejs.org)). In our case, we do not want to merge all pieces, because we need individual piece interactivity. But within one Piece, merging all geometry of the same material is fine and will be done by constructing a single BufferGeometry per color per piece. This keeps draw calls per piece minimal.


Finally, the Renderer will also handle scene updates: if the Scene Manager indicates that a piece’s transform changed (position/orientation), the Renderer updates the corresponding Three.js Group’s transformation. If a piece is added or removed, the Renderer adds or removes the Three.js Group. This synchronization can be done via an observer pattern or simple method calls (the Scene Manager can call a Renderer method to apply changes, or both can register to a central event bus). This separation ensures we can test the logic of scene manipulation without needing the 3D context.
Monaco Editor Integration for LDraw Editing
One of the key features is the integration of the Monaco code editor to allow live editing of LDraw code for pieces within the scene. This feature will be implemented by the Monaco Editor Integration module, in coordination with the Scene Manager and Parser.
Editor Setup and Scope
A React component will host the Monaco editor (likely using an available wrapper component). When the user selects a single Piece in the scene, the application will load that piece’s instance-level LDraw code into the editor. The "instance-level LDraw structure" refers to how that piece is represented within the scene.
If the piece is a simple reference to an official part (i.e., originally just a single Type 1 line in the scene file), then initially the instance-level code might be just that one line (the reference).


If the piece has been enhanced or modified in the scene (e.g., special boxes added, or other edits), the instance-level code could be multiple lines (potentially represented as an embedded submodel in the scene’s MPD structure).


Goal: The user can edit this code to adjust the piece’s configuration in the scene. For example, they could add a transformation to a sub-part, adjust coordinates of a special box, or even replace the reference with a different part. However, these changes should not propagate to other instances or the global part library – they are specific to this piece in this scene.
To achieve this, we likely use the concept of embedded subfiles. If a user wants to make changes beyond just moving the whole piece, the application will treat that piece as an embedded model in the scene file:
Behind the scenes, if a piece is initially an external reference (line type 1 to partX.dat), and the user starts editing it, the system can pull in that part’s definition into the scene file as a new sub-model. Then the scene’s reference will point to this new sub-model (effectively making a copy of the part that is editable in the scene). The Monaco editor would then show the content of that sub-model (which initially is the part’s original geometry) for editing. This way, the original partX.dat remains untouched externally.


This approach aligns with LDraw’s MPD (multi-part document) support: the scene file can contain a 0 FILE pieceX_copy.dat section with the part geometry. We will use a naming or tagging scheme to ensure uniqueness and clarity (e.g., append “_enh” or use a temp name if needed).


QUESTION: Should the conversion to an embedded submodel happen automatically on entering edit mode for a part, or should we prompt the user? Automatic conversion offers seamless editing, but it means the saved scene will contain a modified part definition if they even tweak a piece. We will likely do it automatically for simplicity, and maybe indicate in the UI that the part is now an “instance copy”. ANSWER: A Scene file is a collection of Pieces. The only editing is at this level. Submodels of Pieces can not be edited. Enhanced_Pieces are somewhat like a Scene, in that Enhanced_Pieces are a Piece and set of Specality_Boxes in a single file. Editing of an Enhanced_Piece does allow editing of the Piece dat file. The Piece is included in the Enhanced_Piece file as a reference to that Piece, not the submodules in that Piece’s LDraw file. 


Live Editing and Validation
Once the Monaco editor is loaded with the piece’s LDraw code, the user can make changes. We want the 3D view to update live as they edit, but also not break if the user types something invalid. Our strategy:
As the user types, we run a debounce timer (e.g., 300ms after the last keystroke) to validate and apply the changes. This prevents constant re-parsing on every character.


We feed the current editor content to the LDraw Parser module (which can be used in a web worker thread if performance becomes an issue, but initially it can run on the main thread given typically small size of part definitions).


If the parser returns an error (syntax not matching LDraw format), we will not apply any changes to the scene. Instead, we use Monaco’s diagnostics API to display an error marker or underline in the editor. We will also likely disable the live update until the syntax is fixed (to avoid partial application).


If the parser is successful, we get a new piece definition (which could be multiple lines of geometry). We then update the Scene Manager’s representation of that piece: essentially replace the old geometry of that piece with the new geometry from the editor. The Scene Manager can have a method like updatePieceGeometry(pieceId, newGeometryData).


The Renderer will then update the Three.js objects for that piece. The simplest approach is to rebuild the Three.js group for that piece from scratch using the new data (discard old meshes and create new ones). Given pieces are not extremely large, this is acceptable. For more efficiency, we could diff the changes, but that’s likely unnecessary complexity at first.


During editing, it’s possible to introduce special box definitions via code as well. For example, if the user knows the meta or format we use to denote a Stud_Box, they could type it. Our parser would interpret it and add a Stud_Box to the piece data. This is advanced usage, but we will support it since Monaco is essentially another input method. More commonly, users will add/remove special boxes via UI, and those actions will insert or remove lines in the Monaco editor as well (keeping both in sync).


We will also provide basic syntax highlighting in Monaco for LDraw. If Monaco is configurable with a custom language, we can define a simple grammar: keywords like 0 BFC, 0 !COLOR, numbers, etc., can be colored. At minimum, we treat it as plain text if custom highlighting is too time-consuming; this can be improved later.
Edit scope limitations: The editor is not a full-fledged part editor for anything; it is constrained to the piece instance. For example, the user cannot open the Monaco editor for multiple pieces at once – they must edit one piece’s code at a time. If multiple pieces are selected, the editor might either be disabled or show a read-only combined view (but likely easier: only enable Monaco when exactly one piece is selected). Also, the user cannot use the editor to directly add a completely new separate piece to the scene – they would do that via the UI (or by editing the main scene file, which is beyond the scope of instance editing).
When the user finishes editing (or as they edit), the changes are already in effect in the scene. We may include an “Apply” or “Revert” button in the UI for safety: e.g., if they want to discard changes, we could reload the last saved state of that piece. Otherwise, every valid change is immediately applied (this is effectively an always-live editing mode).
Saving Edits and Enhanced Pieces
If the user has edited a piece’s geometry via Monaco (or by adding boxes), that piece is now an “Enhanced_Piece”. When the user saves the Scene, the Persistence module will output the piece’s definition as part of the scene file so that the scene is self-contained. Specifically, for each enhanced piece, we will include an embedded sub-model in the saved LDraw file representing that piece. The main scene model will reference the embedded piece instead of the original.
If the user chooses to save an Enhanced_Piece separately, the application will create a standalone .dat file for that piece. This file will include all geometry and special box definitions. We will ensure that the format is a valid LDraw part file:
We’ll preserve the original part’s header comments (author, part number, etc.) if present, and perhaps append a note that it was enhanced.


Special boxes might be saved as either pure geometry or using meta commands (if we introduce custom ones). For simplicity, we could save them as geometry: e.g., a Collision_Box is a set of 12 lines or 6 faces forming a rectangle, tagged with a comment before it like 0 !COLLISION_BOX. That way, when re-importing, we can detect !COLLISION_BOX comment to treat those lines as a special box rather than normal part geometry. QUESTION: What format should Enhanced Piece files use for special boxes? Should we define new meta commands (e.g., 0 !COLBOX x y z ... with parameters) for compact representation, or just embed raw geometry and rely on color to distinguish? The decision will affect ease of editing later and compatibility with other tools. ANSWER: Enhanced_Piece contain a Piece and set of Specality_Boxes in a single file. The Piece is included in the Enhanced_Piece file as a reference to that Piece, not the submodules in that Piece’s LDraw file. Predefined special_box.dat parts that unscaled size matches the Reciever_Box and Stud_Box size, and will need to be scaled for Collision_Box and Boundry_Box (as they are unique size for each piece). And mark them with meta tags. 


The Monaco editor can also be used to edit the main scene’s LDraw code if we expose it (though not stated in requirements). We might eventually allow a mode to edit the whole scene text, but since the requirement specifically limits scope to piece instances, we will not implement full scene text editing in Monaco for now.
User Interaction Design
User interaction covers how a user will select and manipulate pieces in the 3D view, as well as how they toggle special view options. This includes both mouse interactions in the Three.js canvas and UI controls (buttons, menus in React). The Interaction Controller module is central here, coordinating inputs and updating the Scene.
Selection and Navigation
By default, the user can navigate the 3D scene using mouse or touch:
Orbit (Rotate view): Click and drag the background (when not clicking on a piece) to rotate the camera around the scene (Three.js OrbitControls).


Pan: Right-click drag or a specific key+drag (or two-finger drag on touchpad) to pan the camera.


Zoom: Mouse scroll wheel or pinch gesture to zoom in/out.


These camera controls will be provided by Three.js OrbitControls and configured in the Renderer. They are always active for user convenience, except possibly when the user is actively dragging a piece (to prevent conflict).
For selecting pieces:
A left-click on a piece’s visible geometry will select that Piece. Under the hood, we cast a ray from the camera through the click point and intersect with the Three.js objects. Because each Piece is a group containing meshes, we’ll get an intersection with a specific mesh/face. We then determine the parent Piece group of that mesh and consider that the selected object. The Scene Manager is informed which piece is selected. The React UI can highlight the selection (e.g., outline the selected piece or list its name).


If the user clicks on empty space (nothing hit), we clear the selection (or leave it unchanged if we want require explicit deselect via UI button or clicking blank area).


Multi-selection: The user can hold Ctrl or Shift and click another piece to add it to the selection. We maintain an internal set of selected piece IDs. The UI should update to indicate multiple selection (perhaps listing the count of items selected). If they click an already-selected piece with Ctrl, it could remove it from selection (toggle).


We may also implement a drag-selection (marquee) in the future, but initially Ctrl-click is sufficient.


If a piece has Special Boxes visible, clicking directly on a box should ideally select that box (for editing its position) or possibly select the whole piece. We will implement the ability to select a Special Box independently:
Each Special Box (as a Three.js object) will be tagged such that we know what it is and which piece it belongs to (e.g., using object.userData = { type: "StudBox", parentPiece: pieceId }).


If the user clicks a box, we might select that box in addition to the piece, or highlight it differently. For simplicity, clicking a special box could just select the parent piece as well, but the UI might then focus on the box’s properties. However, since the requirement says boxes are selectable and editable, we will treat them as separate selectable items. Possibly, we have a concept of a secondary selection for a box when a piece is selected.


Proposed approach: clicking a box selects the parent piece (if not already selected) and also marks that specific box as the active sub-selection (for translation/rotation operations that should apply only to the box). This way, transformations will move the box relative to the piece, not move the entire piece. The UI can show a different highlight color on the box to indicate it’s the sub-object being edited.


The user could also multi-select multiple boxes (though use case is rare; perhaps adjusting multiple studs together).


The visual feedback for selection will be important. When a piece is selected, we might:
Highlight it by adding a colored outline or halo. One method: use Three.js OutlinePass or simply add a second mesh with a slightly enlarged scale and bright transparent material. Or easier, change the material emissive or wireframe temporarily. We will research a clean highlighting technique.


When multiple pieces are selected, highlight all of them.


When a special box is the active selection, highlight that box (maybe a thicker outline or color change) distinct from piece highlight.


Transformation (Move/Rotate)
Users need to move and rotate individual or multiple pieces. We will implement an interaction mode using Three.js TransformControls:
TransformControls can be configured for translation or rotation (and scale, though scaling pieces is generally not a desired user feature for LEGO parts, we likely disable scaling).


The user will toggle between "Move" and "Rotate" modes using UI buttons or keyboard shortcuts. For example, buttons could be labeled "Move (Translate)" and "Rotate", or we could follow convention: W = translate, E = rotate (like many 3D tools).


In Move mode, the TransformControls gizmo (with axes arrows) is shown on the selected object; the user can drag an arrow to move along one axis, or drag the plane between arrows to move in a plane. In Rotate mode, a rotation ring gizmo appears around the object for each axis.


We will attach TransformControls to either a single selected piece or a group:


If one piece is selected, attach controls to that piece’s Group.


If multiple pieces are selected, we create a temporary Three.js Group that parents all those pieces. We attach TransformControls to this group. When the user drags/rotates, all child pieces move together. After completing the transform (on mouse-up), we remove the temporary group and update each piece’s own position/rotation in the Scene Manager.


QUESTION: For multi-selection rotation, what pivot should we use? Options: the group's origin at (0,0,0) of world, the average centroid of selected pieces, or perhaps the first selected piece’s origin. We will likely use the geometric center of all selected pieces as the pivot for group transform, as that feels intuitive. ANSWER: Use the geometric center of all selected pieces as the pivot for group transform, as that feels intuitive.


The Interaction Controller will listen for changes from TransformControls (there are events for objectChange). As the user drags a piece, we update the Scene Manager continuously or at end. Likely, continuous update is fine for immediate feedback (the piece is already moving in Three.js view). On release, we do a final commit of the transform.


When a single Special Box is the selection (sub-object), the TransformControls will be attached to that box’s object instead. Then movement will adjust that box’s position relative to its parent piece (since the parent piece’s transform remains fixed). We must then update the box’s stored offset in the Special Box Manager and Scene Manager. Rotating a box might not be commonly needed (most boxes axis-aligned to piece), but we allow it in case.


We will also allow transformations via UI input as an alternative:
For precision, the user might type coordinates or angles. We could have an inspector panel showing the position (X, Y, Z) and rotation (Euler angles) of the selected item(s). The user could input numbers to move/rotate. This might be an extensibility feature; initially, we might not implement a full inspector, focusing on mouse interaction and the Monaco editor for fine adjustments.


We will, however, include simple UI buttons for quick nudge: e.g., "nudge up/down/left/right" or "rotate 90°". These can be in a toolbar. Clicking them calls Scene Manager to adjust the transform by a fixed increment. This provides an accessible way to manipulate pieces without dragging (useful if precise 90-degree rotations are needed or aligning to grid).


Snapping: The initial spec doesn’t mention snapping pieces to a grid or to each other, but that could be a future feature (aligning pieces via stud connections). For now, movement is freeform. We might still allow toggling a coarse grid snap for translation/rotation (e.g., move in increments of 1 LDraw unit or rotate 90° increments) via a setting.


Special Box Management (User Perspective)
Special Boxes (Collision, Boundary, Stud, Receiver) can be toggled, added, and removed by the user through the UI:
Toggle visibility: The UI will provide checkboxes or toggles for each type of special box (or at least for the two groups: Stud/Receiver and Collision/Boundary). For example: "Show Connectivity (Stud/Receiver)" and "Show Collision/Bounds". If toggled off, the Renderer hides those objects (could simply set their Three.js visible property to false for all of that type). The toggle is global for the scene view – it affects all pieces. Toggling does not remove any data, just visibility. The Scene Manager or Special Box Manager will maintain flags for which categories are visible.


Add Special Box: The user can select a piece and choose (via a context menu or a dedicated panel) to add one of the four types of boxes. For instance, "Add Stud Box" might be a button. When clicked, the Scene Manager will create a new Stud_Box object associated with that piece. We may require the user to then position it appropriately. The workflow could be: upon adding, a default-sized box appears at the piece’s origin or a suggested position, and is selected (with transform gizmo active) so the user can move it to the desired location (e.g., place the stud box exactly where a stud is on the part). If the part is a standard brick, perhaps we can auto-snap it to a stud position if we know standard geometry, but that’s complex – likely the user will manually position it for now.


Remove Special Box: If a special box is selected (or perhaps via a list of boxes), the user can press a "Delete" key or click a "Remove Box" button. This will remove that box from the piece: update the Scene Manager (remove from piece’s data), and the Renderer removes the Three.js object. If the Monaco editor is open on that piece, it should also remove or comment out the corresponding lines representing that box.


The special boxes themselves are part of the piece’s data, so editing their properties can also be done via Monaco (as discussed). But the UI approach is more straightforward for most users.
To ensure usability, special boxes will be drawn slightly transparently so that underlying piece geometry is visible, or maybe as wireframes. For example, a red collision box may cover an entire piece, so making it semi-transparent (alpha) or just edges would allow the piece to be seen inside it.
The table below summarizes user interactions and expected behaviors in the UI:
User Interaction
Description & Behavior
Orbit/Rotate Camera
Drag background with left mouse (when no piece is grabbed) to rotate the view around the scene. The focal point is the center of the scene or last selected object. Uses OrbitControls (inertia enabled for smooth stop).
Zoom Camera
Use mouse wheel or pinch gesture to zoom in/out. Zoom is centered on cursor (if possible) for intuitive navigation.
Pan Camera
Drag with right mouse (or middle mouse) to pan the camera view.
Select Single Piece
Left-click on a piece’s geometry. That piece becomes selected: highlight it and load its data in the side panel (e.g., its name or Monaco editor if open). Any previous selection is cleared.
Multi-Select Pieces
Ctrl+Click or Shift+Click on additional pieces to add to selection. All selected pieces are highlighted. If Transform mode is active, the gizmo reattaches to encompass all selected.
Select Special Box
Click on a visible special box (if boxes are toggled on). That box is selected (with some highlight). The parent piece might also become selected (if not already) to provide context. Transformations will apply only to the box if the box is the active selection.
Deselect All
Click on empty space or press Esc to clear the selection. The transform gizmo is hidden.
Translate (Move) Mode
Activate via toolbar button or hotkey. If an object is selected, a Translate gizmo appears. User drags arrows (X/Y/Z axes) to move the selection. For multiple pieces, they move together. Live feedback shown; upon release, positions are saved. Possibly constrain to plane if user drags the plane handle.
Rotate Mode
Activate via toolbar or hotkey. A rotation gizmo (colored rings) appears on the selection. Dragging a ring rotates the object(s) around that axis. For multiple pieces, they rotate as a group about the chosen pivot (likely center of group).
Nudge/Step Move
Use arrow keys or small move buttons (if provided) to move selected piece by a fixed increment (e.g., 1 unit) along ground plane. Similarly, rotation buttons to rotate 90° around vertical axis. These provide coarse adjustments. (Optional feature)
Open Monaco Editor
Select a piece and click "Edit Code" (or it could open automatically on selection if we design so). The Monaco editor panel opens with the piece’s LDraw code. User can edit text. Changes live-update the piece’s model as described.
Add Special Box
With a piece selected, use UI control to add a box of a chosen type. The new box appears (e.g., at piece center or pre-calculated spot). The box is selected so user can move/rotate it into place. The piece now is marked as "Enhanced". The Monaco editor (if open) will update with new lines for this box.
Delete Special Box
Select a special box (it might also highlight in a list of piece’s boxes if we show that). Press Delete or click "Remove Box". The box is removed from scene and data.
Toggle Box Visibility
Click checkbox "Show Stud/Receiver" – all stud and receiver boxes globally become visible or hidden. Same for collision/boundary. Toggling does not change selection or data, just the render visibility.
Save Scene
Click "Save Scene" button. The current scene (with any enhancements) is compiled into an LDraw file (*.dat or .ldr as decided). If parts have instance edits (embedded submodels), the file will be in MPD format containing those submodels (DAT - LDraw.org Wiki). The file is offered for download.
Save Enhanced Piece
With a piece (especially if enhanced) selected, click "Export Piece". The app generates a .dat file for that single piece including its special boxes. The user can then reuse this as a custom part in other scenes (though external tools might not understand the special box metas without our viewer).

This interaction design ensures that a user can construct a scene of multiple LEGO pieces, position them freely, optionally augment pieces with collision/connectivity boxes, and make fine adjustments either visually or via code. We treat each piece as a high-level object for ease of manipulation, addressing requirement (4) that pieces are cohesive UI objects.
One more detail: We will implement undo/redo for user actions if possible (this greatly improves testability and user experience). Each operation (transform move, add box, delete piece, code edit commit) would push a state change to an undo stack. This is an extensibility point; initial version might not have full undo for all actions, but we design state changes in a way that it’s feasible (perhaps leveraging an immutable state approach or snapshotting changes in Scene Manager).
File Persistence and Format Details
Saving and loading of files is crucial for an editing tool. The application will support:
Loading an existing scene or model (LDraw format .ldr/.dat, potentially .mpd).


Saving the current Scene to a file (as a .dat as specified, though .ldr is an option – see question above).


Saving an enhanced piece to a .dat file.


Loading Files (Import)
When the user chooses to load a file (or multiple files), the Persistence module uses the LDraw Parser:
It reads the file line by line, building the scene. If the file is an MPD (multi-part document with embedded subfiles separated by 0 FILE <name> lines), the parser will handle that: it might create multiple internal structures but the main model is identified and set as the Scene.


As it encounters type 1 lines referencing external files (parts), it will attempt to load those as well. We will have a configured parts library path (perhaps the user or system provides the path to the official library on initialization). The parser will look up the referenced filename in the library directories (parts/, p/, etc., as per LDraw standards) (LDraw.org - LDraw File Format Specification). For web, this may require that we have pre-downloaded the library or use a fetch mechanism. Initially, since this is an internal tool, we can assume the environment can serve the part files (maybe we bundle needed parts or have an API).


If a referenced part is not found, we log a warning and skip it (the piece will be missing in the scene). We might display a placeholder geometry (like a wireframe box with an X) to indicate a missing part.


Colour definitions: The parser will also likely load the LDConfig.ldr (color config) once at startup to get all color codes. (Alternatively, we embed a known color map in code).


After parsing, the Scene Manager is populated with Piece objects. If the file was a model (not just a single part), each type 1 reference becomes a Piece. If the file only described one part’s geometry (like a .dat part file), we may treat it as a Scene with one Piece (which has no subparts, just geometry lines).


Enhanced parts: If the file being loaded was previously saved by our application and contains special box definitions, the parser needs to detect them. For example, if we used 0 !COLLISION_BOX meta comments, the parser can create a Collision_Box object instead of treating those lines as normal geometry. If no explicit meta, perhaps the presence of geometry in our reserved colors (pure green/red) and possibly some pattern in comments could flag them. We will define a clear meta format to avoid ambiguity. E.g., saved file might have:

 0 !EnhancedPiece OriginalID 3001
1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat
0 !StudBox 1 0 24 0 8 8 8
4 2  ... (faces of the stud box geometry)
...
0 !EndEnhancedPiece
 The above is hypothetical. We will refine the exact saving format. The key point is the loader must reconstruct the piece with its special boxes attached.


The Monaco editor is not directly involved in loading, but after loading, a user can select and edit, etc. If the loaded scene has embedded subfiles, those are part of the Scene Manager structure.


Saving Scene Files
When saving the entire scene, we want the output to be as portable as possible in LDraw format, while capturing the extra data:
If no pieces have been enhanced or edited, the scene file could simply list all pieces as type 1 references (just like a normal .ldr model file referencing official parts). This would be the simplest case and most compatible with other LDraw viewers (though they would ignore unknown metas or extra lines).


If some pieces are enhanced (modified geometry or added boxes), we cannot reference an external official part for those, since they differ. We have to include their definitions. We will therefore use the MPD approach:


Start the file with the main model (the scene assembly) as the first part.


For each unique enhanced piece, include a 0 FILE <name> section with its definition. The <name> could be the original part number with a suffix, or a generated name. We should ensure no conflicts with real part names.


In the main model section, instead of 1 <color> x y z ... part.dat, we put 1 <color> x y z ... <name> matching the embedded piece's name.


Inside the embedded piece definition, we will include everything that piece needs: possibly a reference to the original part geometry (or we could inline all geometry, but better to reference the original part’s geometry via type 1 line as well, if we treat the original as a sub-part).


We have two options when saving an enhanced piece:


Inline geometry: Write out all polygons of the original part into the enhanced part file along with polygons for boxes. This makes it self-contained but duplicates a lot of data (the original part’s hundreds of lines).


Reference original + add-ons: Keep a reference to the original part (type 1 line inside the enhanced part) and then additional lines for the boxes. For example: 1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat to bring in the standard brick geometry, then additional geometry for the enhancements. This way, if loaded in a normal LDraw environment with the official library, it will still show a brick (though the extra geometry might be unrecognized meta or just extra faces). We prefer option 2 as it avoids duplicating part polygons and remains closer to standard LDraw usage. We just need to ensure that if we transform or remove some part geometry via editing, we handle that (e.g., if user removed a subpart, we might not want to include the reference to it).


Write meta comments to clearly denote what each section is (e.g., "0 // Enhanced piece definition for 3001.dat with collision boxes").


We will include at the top of the file some identification, like:

 0 // File created by LDraw Web Editor
0 !LDRAW_ORG Unofficial Model
 Or similar, to follow conventions (the Official Model Repository spec might not fully apply, but we aim to be somewhat compliant).


One challenge is if the user has multiple instances of the same piece enhanced in the same way or differently. If two pieces of the same part are enhanced differently, we will have two different embedded submodels (e.g., brick_enh1 and brick_enh2). If they are enhanced identically, ideally we could share the same embedded definition to reduce duplication. That requires detecting that two instances ended up with identical LDraw code. That’s an edge case; initially we might give each its own section to be safe. (Later optimization: hash the definition and reuse if match.)
Saving Enhanced Pieces (individual)
When the user opts to save an enhanced piece on its own, it’s akin to exporting a custom part. The output .dat will likely look like a normal part file but with extra content for special boxes:
We will include the standard part header if possible (if the piece was based on an official part, we might include a reference to it). For example, the first lines of a part file usually include title, author, etc. We can generate a title like "Enhanced 2x4 Brick with Connectivity Data".


Then include the part geometry (likely via a reference to the official part as mentioned).


Then include box geometries. If we define custom meta for boxes, other LDraw tools will ignore those lines as unknown metas, which is fine (they won’t show the boxes, but at least the normal geometry will show via the reference). If we include actual geometry for the boxes (like 6 faces of a cube in green), other tools would show those as weird colored geometry which might not be desired outside our tool. Using meta commands for the boxes might be cleaner for external compatibility (so that other renderers just skip them entirely instead of rendering odd cubes). Therefore, leaning towards meta (or at least using a conditional convention like color 4 and a specific comment might still show a red box in other viewers, which could be confusing).


We'll likely add 0 //! style comments to explain that these are collision/connectivity boxes for anyone opening the file in a text editor.


The Persistence module will be responsible for converting internal data structures back into text. This involves iterating through each piece and outputting lines. We must ensure the original formatting (like decimals precision, etc.) is reasonable. LDraw typically uses integer or one-decimal for coordinates (since units are 1/20th of a stud = 0.05 stud per LDraw unit, which equals 0.4 mm per unit, coordinates often integers for studs). Our internal transformations might be floating point (especially after rotations), so we’ll round to at most 2-3 decimal places to keep the output clean and avoid very long floats.
Questions & Unresolved Design Choices for Persistence
We have flagged a few QUESTIONS earlier regarding file format decisions:
Use of .dat vs .ldr for scene files: The convention is .ldr for models (DAT - LDraw.org Wiki), but since the requirement explicitly says save Scenes (*.dat), we need confirmation. This is minor but affects user expectation and integration with other LDraw tools. ANSWER: Let’s use .ldr for Scene files. 


Meta commands for Special Boxes: define custom !StudBox, !ReceiverBox, etc., vs encoding them as normal geometry. Using custom metas (with perhaps parameters for position/size) would make the scene files more semantically rich, but then our parser must handle them (which we can). It would also keep other viewers from drawing these (they'll ignore unknown metas). We lean towards custom meta commands for clarity. ANSWER: Let’s use custom meta commands. 


How to handle partial edits: e.g., user removes a subpart via Monaco. Do we reflect that by not referencing the original part geometry but rather by writing out all geometry except that removed subpart? Edge case to consider in implementation. ANSWER: A Scene file is a collection of Pieces. The only editing is at this level. Submodels of Pieces can not be edited. Enhanced_Pieces are somewhat like a Scene, in that Enhanced_Pieces are a Piece and set of Specality_Boxes in a single file. Editing of an Enhanced_Piece does allow editing of the Piece dat file. The Piece is included in the Enhanced_Piece file as a reference to that Piece, not the submodules in that Piece’s LDraw file.  


Overall, the persistence will be implemented carefully to ensure no data loss and that a saved scene can be re-loaded to the same state in our tool.
Testing Strategy (Unit & Integration Testing)
The project will be developed with Test-Driven Development (TDD) principles, meaning we will write tests for key functionality before or as we implement them. Our testing strategy covers both unit tests for individual modules and integration tests for the interactions between them.
Unit Testing
Each core module lends itself to unit testing:
LDraw Parser Tests: We will create a suite of test cases with sample LDraw lines and files. For example, test that a simple part file with known content (triangles, subparts) is parsed into the correct internal structure. Test edge cases: invalid line types, missing files (should throw or handle gracefully), meta commands parsing. We will also test the color substitution logic (e.g., a part with color 16 inside a subassembly gets the parent color).


Geometry/Renderer Tests: Although Three.js objects are complex to assert against directly, we can test our geometry construction logic in isolation. For instance, test that given a set of triangle definitions, we produce the correct arrays of vertices and indices. We might simulate a minimal Three.js environment or use Three.js in a Node context to create geometry and then verify counts of vertices, etc. The critical math, such as applying transformation matrices to coordinates, can be tested with known inputs (e.g., a 90° rotation matrix applied to a point).


Scene Manager Tests: We will test that adding/removing pieces updates the internal state appropriately. If we add two pieces and then group them, ensure the grouping logic is correct (if any). Also test that transformations (position, rotation) are stored correctly and combine properly (especially if hierarchy is introduced for multi-select).


Interaction Controller Tests: Simulating actual DOM events might be done in integration tests, but we can unit test the logic for selection. For example, feed a known raycast hit (like an object id) into the selection handling function and verify the correct piece gets selected in Scene Manager. Similarly test that multi-select toggling logic works (select A, then select B with ctrl results in both selected).


Monaco Integration Tests: We can instantiate the Monaco integration logic in isolation by simulating a piece selection and some edit text, then verify the outputs. Monaco itself is an external component, so we focus on our adapter: e.g., test that given a snippet of LDraw code with an error, our validation detects it and returns an error state; test that correct code results in the Scene Manager being updated with expected geometry. We might have to abstract Monaco’s editor API (or use a mock for it in tests).


Special Box Manager Tests: For example, test that adding a Stud_Box to a piece actually creates a box with the right default size and that removing it deletes it. If we define any calculation for default positions (like maybe a collision box default spans the part’s extents), test those calculations.


We will use a testing framework like Jest (suitable for React and general JS/TS projects). Each module can have its test file(s). We plan to write tests for every new feature (target a high coverage, e.g., >90% for core logic).
To ensure maintainability, we’ll run tests in CI for every change. This catches regressions early, especially important if we later refactor for performance.
Integration Testing
Beyond unit tests, we need to test how modules work together and end-to-end usage scenarios:
Loading and Rendering Integration Test: For example, take a small known LDraw model (like two bricks stacked) as input text. Run the import pipeline (parser to scene manager to renderer) and then verify that the Three.js scene contains the expected number of piece groups and geometry. We might not run a real browser for this; instead, use a headless GL context or just inspect the scene graph. Alternatively, run the code in a browser automated test (using something like Puppeteer or Cypress) and verify visually or via the DOM that certain canvas elements exist. We could also read back the Three.js object's positions to confirm the parser applied transforms correctly.


User Interaction Sequence Test: Using a tool like Cypress (which can simulate user events in a headless browser), we can script a scenario: load the app, import a known model, simulate a click on a piece, press a rotate button, drag the mouse, and then assert that the piece's rotation in the scene data changed by the expected amount. This level of testing ensures our integration of React, Three.js, and controls is working. We will likely have to use testing libraries that can trigger pointer events on the canvas.


Monaco Edit Integration Test: Simulate selecting a piece, opening the editor, making a text change, and then confirm the 3D view updated. This could be done by programmatically setting the Monaco model value and then checking the scene data. We may not easily automate checking the visual output, but we can check the internal state (like the vertices count changed or a new sub-part exists).


Saving/Loading Round-trip Test: Create a scene programmatically (or via user simulation), save it to a file (string), then re-parse that string and ensure the scene comes back identical. This verifies that our save and load are consistent and preserve all data.


We will use mocking where appropriate to isolate tests (for instance, to test parser without needing actual files, we can provide a fake file lookup for part library references).
Because of Three.js and Monaco which are heavy libraries, we might segregate tests that require a browser-like environment. Jest with jsdom might not fully support WebGL or Monaco. If needed, we will mark some tests to run in a real browser context (maybe use Cypress or Puppeteer for those).
Continuous Integration: We plan to incorporate a CI pipeline that runs all tests on push. This ensures that the requirement of stability is met – test-driven development will catch issues early. We will also consider performance tests (loading a large scene to ensure it stays responsive) as part of integration testing, though formal performance testing might be manual initially.
Manual and UI Testing
In addition to automated tests, the team will perform manual testing of the UI in various browsers (Chrome, Firefox, etc.) since WebGL and pointer capture can have browser differences. We will prepare test cases for all user interactions (like a script for a tester to follow: "add a collision box to this part, then move it, then save, then reload, check it’s there").
Given the goal of internal use and eventual open-source, we might also start writing documentation which doubles as testable scenarios (for example, a tutorial that if followed should work – if not, something’s wrong).
Extensibility and Maintainability
The system is being architected for internal use initially, but with an eye towards future open-source release. Therefore, we emphasize clean design, modularity, and documentation to make the codebase easy to understand and extend.
Modular Monorepo Design
By organizing into modules (as described in Core Modules), we ensure that each piece of functionality can be developed and reasoned about in isolation. This will make it easier for new contributors to find where to make changes. In the monorepo, we might have sub-packages like viewer-parser, viewer-renderer, viewer-ui, etc. They can be published as separate libraries if needed, or just logically separated:
For example, if someone wanted to use our LDraw Parser in a different project, we could later publish that as an npm package.


The Monaco integration could be optional; an open-source version might allow building without it if someone only needs a viewer.


We will use TypeScript (if possible) for the codebase to improve maintainability (explicit types for LDraw AST, etc., reduce bugs and make the code self-documenting). If not TypeScript, we will at least have JSDoc comments for important structures.
Future Feature Hooks
We keep future enhancements in mind:
Snapping and Connectivity: Since we are already handling stud and receiver boxes, a logical extension is to implement snapping (so that when a user moves a brick near another, the studs snap into receivers). We can plan our data model such that each Stud_Box and Receiver_Box has identifiable properties (like maybe an ID or position vector) that could be used to compute alignments. We won’t implement snapping now, but by having the boxes data and a clear API, a future function snapPieceTo(pieceA, pieceB) could be implemented using those.


LOD and Performance: As noted, we allow possible replacement of the Renderer internals. Perhaps in open-source, someone might integrate this with a different engine or add a web-worker to generate geometry. By isolating rendering logic, that’s feasible.


Multi-user or Collaboration: Though not in scope, if in future we wanted real-time collaboration, having a single source of truth in Scene Manager that can be serialized (for network transfer) will help.


Extending file format support: If the LDraw format evolves (new meta commands or official extensions like texture mapping (LDraw.org - Colour Definition Reference)), our Parser can be extended in one place. We already plan to ignore unknown metas safely, so adding support is incremental.


Open-Source considerations: We will avoid internal-only quick hacks. Everything should be written as if other developers will read and possibly use it. This includes writing documentation for the modules, comments explaining non-trivial code, and perhaps a developer guide. The question inline format we’re using now would of course be removed in actual code, but serves to highlight decisions to be made.


Minimizing Complexity
We aim for the simplest design that works, given the feature set:
We will leverage existing libraries as much as possible (e.g., Three.js for 3D, Monaco for editing, and even three.js OrbitControls/TransformControls to avoid reinventing camera or gizmo logic).


We avoid over-engineering: for instance, we considered dynamic conditional lines and fancy snapping, but those can wait. We will implement the core such that adding those later doesn’t require a rewrite. For example, conditional line support could be added by extending the Renderer’s line creation to include logic with camera angle – this could be an optional module that hooks into the render loop (the design might allow registering a callback on frame render to update conditional lines).


We keep the UI relatively simple: a main canvas view, a side panel that can toggle between an Inspector/Properties view and the Monaco editor, and a toolbar for common actions. We’re not building a full-fledged IDE, just the specific needed tools.


Documentation and Clean Code
We will maintain a detailed README/Developer Guide in the repo describing how each module works and how to run tests, etc. Public APIs of modules (like methods in Scene Manager) will have clear doc comments.
Naming conventions will follow consistency (e.g., using CamelCase for classes, lowerCamel for functions, etc., aligning with typical TypeScript/JS guidelines).
We also plan to use linters (ESLint) and formatters (Prettier) to enforce code style, making contributions easier and code style uniform.
Open Questions for Extensibility
Some design choices will be revisited after initial implementation:
The architecture assumes a single page app with one scene loaded at a time. In the future, we might want to support multiple scenes/tabs. Our design of Scene Manager as a singleton might need to change to handle multiple scenes in memory. We acknowledge this but will proceed with a singleton for simplicity, abstracting enough that it can be turned into multiple instances if needed.


Integration with other formats: maybe someone will want to import LXFML (LEGO Digital Designer format) or export to other 3D formats. We don’t do this now, but by isolating parsing and rendering, we could add an import module for other formats that populates the same Scene data structure.


If open-sourced, licensing of LDraw parts library needs consideration (the parts library is freely available but has its own license; we won’t embed parts data in our repo, we’ll instruct users to download from official source (threejs.org)).


In summary, this technical specification outlines a robust yet modular architecture for the LDraw web-based 3D viewer/editor. We have detailed the handling of the LDraw format, interactive manipulation of pieces, the integration of a code editor for advanced edits, and the extension of parts with collision/connectivity data. The design meets all the requirements (1-13) and leaves room for future enhancements. With test-driven development and careful attention to code quality, the resulting application will be stable and maintainable for internal use and possible open-source contributions in the future.

