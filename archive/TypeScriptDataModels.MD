
# TypeScript Data Models for LDraw Web 3D Viewer and Editor

In a web-based LDraw 3D viewer/editor, we define data models for parts and scenes that are simple, easily testable, and maintainable. We use **TypeScript interfaces** to describe the shape of these data objects (favoring interfaces since no instance methods are required) ([angular - Difference between interfaces and classes in Typescript - Stack Overflow](https://stackoverflow.com/questions/40973074/difference-between-interfaces-and-classes-in-typescript#:~:text=If%20you%20only%20need%20to,those%20instances%20then%20use%20classes)). This keeps complexity low – each model is a plain object with well-defined fields – and ensures they can be easily constructed or modified in tests. Below we present the primary interfaces (`LDrawPiece`, `SpecialBox`, `LDrawModel`), along with supporting types (vector, matrix, enums) for clarity and extensibility.

## Supporting Types and Enums

Before defining the main models, we establish some foundational types for positions, orientations, and box types:

- **Vector3**: An interface for a 3D coordinate or dimension, with `x`, `y`, and `z` numeric properties (used for positions, offsets, sizes).
- **Matrix3x3**: A type alias for a 3x3 rotation matrix, represented as a flat array of 9 numbers. We will use row-major order for consistency (i.e. `[m11, m12, m13, m21, m22, m23, m31, m32, m33]`).
- **SpecialBoxType**: An enum of the four kinds of special boxes: `"Collision"`, `"Boundary"`, `"Stud"`, `"Receiver"`. Using an enum provides strong typing and readability instead of raw strings.

```typescript
/** 3D vector for position or size (in LDraw units) */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 3x3 rotation matrix in row-major order (flat array of 9 numbers) */
type Matrix3x3 = [number, number, number, number, number, number, number, number, number];

/** Types of special boxes for part collision/boundary or connectivity points */
enum SpecialBoxType {
  Collision = "Collision",
  Boundary  = "Boundary",
  Stud      = "Stud",
  Receiver  = "Receiver"
}
```

## LDrawPiece (PartInstance)

The **`LDrawPiece`** interface represents a single part instance placed in the scene. It corresponds to a part reference in an LDraw model (often analogous to an LDraw file "Line Type 1" entry ([LDraw.org - LDraw File Format Specification](https://www.ldraw.org/article/218.html#:~:text=,take%20either%20of%20the%20following))). Each `LDrawPiece` holds identifying information, transformation, color, and optional extras like a unique ID or special collision/connectivity boxes. By keeping this as a plain data object, we make it easy to create, update, or serialize for testing and state management.

- **partId** (`string`): Identifier of the part being used. This could be the filename of the LDraw part (e.g. `"3001.dat"` for a brick) or a unique reference ID. It tells the viewer which geometry to instantiate.
- **position** (`Vector3`): The translation of this part in the scene coordinate system. Given as an object with `x, y, z` coordinates (in LDraw units). This corresponds to the part’s XYZ position in the model ([LDraw.org - LDraw File Format Specification](https://www.ldraw.org/article/218.html#:~:text=,take%20either%20of%20the%20following)).
- **rotationMatrix** (`Matrix3x3`): The orientation of the part, expressed as a 3x3 rotation matrix. It’s stored as an array of 9 numbers (row-major). This matrix aligns the part’s local axes to the scene. (In LDraw terms, these 9 numbers are the rotation/scaling portion of the transformation ([LDraw.org - LDraw File Format Specification](https://www.ldraw.org/article/218.html#:~:text=,take%20either%20of%20the%20following)).)
- **colorCode** (`number`): The LDraw color code for this part. It’s typically an index per the LDraw spec’s color table ([LDraw.org - LDraw File Format Specification](https://www.ldraw.org/article/218.html#:~:text=,take%20either%20of%20the%20following)) (e.g., 0 for default, 1 for blue, 16 for current color). Using a number here aligns with the standard LDraw color definitions.
- **id** (`string | number`, optional): A unique identifier for this part instance. This is not from LDraw itself but is useful in an interactive editor for tracking parts (e.g., for selecting or deleting a specific part). It could be a GUID string or an auto-increment number.
- **specialBoxes** (`SpecialBox[]`, optional): An array of special box definitions associated with this part. These might represent collision boxes, boundary boxes, stud connectors, or stud receivers for the part (enhancing interactivity or physics). This field is omitted if the part doesn’t have any such auxiliary data. For parts that do (i.e. *enhanced pieces* with connectivity info), each entry describes one box (see `SpecialBox` below). For example, a brick might have multiple `Stud` and `Receiver` boxes to indicate where studs connect ([[KEY TOPIC] LDD New Parts - Digital LEGO: Tools, Techniques, and Projects - Eurobricks Forums](https://www.eurobricks.com/forum/forums/topic/177795-key-topic-ldd-new-parts/#:~:text=,is%20not%20necessary%20for%20approval)).

```typescript
/** Represents a placed LDraw part in the scene (part instance) */
interface LDrawPiece {
  partId: string;
  position: Vector3;
  rotationMatrix: Matrix3x3;
  colorCode: number;
  id?: string | number;
  specialBoxes?: SpecialBox[];
}
```

This interface uses clear names and simple types for each field, which makes it straightforward to use and extend. For instance, adding a new property (say, a visibility flag) in the future wouldn’t break existing code – TypeScript would enforce its presence where needed, aiding maintainability.

## SpecialBox

The **`SpecialBox`** interface defines a rectangular box volume attached to a part, used for advanced features like collision detection or connection points. Each box has a type (from the `SpecialBoxType` enum) to specify its purpose. The box’s position and size are defined relative to the part’s local coordinate system, and it may have an optional rotation (if the box is not axis-aligned with the part).

- **type** (`SpecialBoxType`): The category of the box. It can be one of four enumerated values – `"Collision"` (a collision volume for physics or overlap checking), `"Boundary"` (a bounding box for the part’s extents), `"Stud"` (an attachment stud connector), or `"Receiver"` (a counterpart connector for studs). Using `SpecialBoxType` enum ensures only valid types are used.
- **offset** (`Vector3`): The local offset of the box’s center (or origin) from the part’s origin. For example, `{x: 0, y: 0, z: 0}` would place the box at the part’s origin, while another value positions it elsewhere relative to the part. This allows precise placement of the box on the part model.
- **size** (`Vector3`): The dimensions of the box along the X, Y, Z axes. This defines the half-size or full size of the box depending on convention (typically this would be the full width, height, depth of the box). For instance, a 2x2 stud connector might have a small size like `{x: 10, y: 1, z: 10}` in LDraw units.
- **rotation** (`Matrix3x3`, optional): An optional rotation matrix for the box orientation. If provided, this 3x3 matrix (same format as in `LDrawPiece`) rotates the box relative to the part’s coordinate space. If omitted, the box is axis-aligned with the part (no extra rotation). This is useful if, say, a connection box needs to be tilted (some specialized parts have angled connectors).

```typescript
/** Represents a special box (collision, boundary, or connection element) tied to a part */
interface SpecialBox {
  type: SpecialBoxType;
  offset: Vector3;
  size: Vector3;
  rotation?: Matrix3x3;
}
```

With this design, special boxes provide extensibility for advanced part features without complicating the core `LDrawPiece`. They are optional and encapsulated in their own structure, keeping the part definition clean. New box types could be added to the enum and handled accordingly without affecting other parts of the model.

## LDrawModel (Scene)

The **`LDrawModel`** interface represents an entire model or scene, which is essentially a collection of pieces (and potentially submodels). It corresponds to an LDraw build or scene file, including metadata. This model holds an array of `LDrawPiece` instances that make up the scene, along with optional descriptive fields. The design also anticipates future support for hierarchical submodels by allowing nesting of `LDrawModel` objects.

- **pieces** (`LDrawPiece[]`): The list of all part instances in this model. This array contains every piece (brick, part) placed in the scene, each with its own position, rotation, etc. It acts as the core of the scene graph at the model level.
- **name** (`string`, optional): The name/title of the model. This could be analogous to the model’s filename or a user-defined title (often LDraw files use a meta command for model name). Having it as a field makes it easy to display or reference the model by name.
- **author** (`string`, optional): The author of the model. This is metadata indicating who created or is editing the model (similar to the `Author` meta line in LDraw files). It’s purely informational for documentation.
- **submodels** (`LDrawModel[]`, optional): An optional array of sub-models (or assemblies) that this model contains. Each submodel is itself an `LDrawModel` with its own pieces (and could further nest submodels). This allows complex models to be composed of smaller components. For example, a car model might contain a submodel for the engine assembly. In the current design, a submodel could be referenced by an `LDrawPiece` (using a special partId or by linking to the submodel object), but by including a submodels list, we make the nesting explicit and easily extensible. (In practice, one might reference submodels by a piece with a partId equal to submodel name, but this `submodels` field provides a structured way to include them if needed.)

```typescript
/** Represents an entire LDraw scene or model, which can contain pieces (and submodels) */
interface LDrawModel {
  pieces: LDrawPiece[];
  name?: string;
  author?: string;
  submodels?: LDrawModel[];
}
```

By using an interface for the model, we keep it flexible – for instance, in tests one can construct a dummy `LDrawModel` with a few pieces easily, or substitute a mock submodel. The structure is also maintainable: adding new metadata (like description, license, etc.) or new features (nested submodels, grouping) can be done without breaking the contract (especially if new fields are optional).

## Extensibility and Best Practices

The above interfaces provide a clear separation of concerns: **LDrawPiece** for individual part placement, **SpecialBox** for auxiliary volumes, and **LDrawModel** for the collection of pieces (scene). This separation makes each part of the data model easier to understand and test in isolation. We favored simple **interfaces** (plain data containers) over classes since no behavior is needed on these models – this aligns with TypeScript best practices for pure data structures ([angular - Difference between interfaces and classes in Typescript - Stack Overflow](https://stackoverflow.com/questions/40973074/difference-between-interfaces-and-classes-in-typescript#:~:text=If%20you%20only%20need%20to,those%20instances%20then%20use%20classes)) and ensures the models impose minimal runtime overhead (interfaces are erased at compile time). Enums and specific types make the code self-documenting and less error-prone (e.g., using `SpecialBoxType` prevents typos in box types).

The design is intentionally made extensible. For example, to support **nested submodels** in the future, the `LDrawModel` already includes a `submodels` field. This means complex hierarchical builds can be represented without a redesign. If a different approach to submodels is desired (such as treating a submodel reference as a special kind of `LDrawPiece`), the current model still accommodates it because we can identify submodel parts by a distinct `partId` or an extended piece type. In any case, adding capabilities (fields or relationships) will typically be a backward-compatible change due to the flexible interface structure and optional properties.

Overall, these TypeScript definitions reflect the given technical design while prioritizing **low complexity** (each interface has only the necessary fields, no convoluted inheritance), **high testability** (plain data objects that can be easily created and inspected in tests), and **maintainability** (clear naming and strong typing, making the codebase easier to understand and extend). By closely mirroring the LDraw concepts (part ID, position, rotation matrix, color ([LDraw.org - LDraw File Format Specification](https://www.ldraw.org/article/218.html#:~:text=,take%20either%20of%20the%20following)), etc.) and including modern enhancements (connectivity/collision boxes ([[KEY TOPIC] LDD New Parts - Digital LEGO: Tools, Techniques, and Projects - Eurobricks Forums](https://www.eurobricks.com/forum/forums/topic/177795-key-topic-ldd-new-parts/#:~:text=,is%20not%20necessary%20for%20approval))), the models form a robust foundation for the LDraw web 3D viewer and editor.