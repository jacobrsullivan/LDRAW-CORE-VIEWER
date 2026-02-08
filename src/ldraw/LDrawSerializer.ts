import { LDrawModel } from './LDrawDataModels';

// Helper to format numbers cleanly for LDraw, removing trailing zeros.
const fmt = (num: number): string => {
    if (Number.isInteger(num)) {
        return num.toString();
    }
    // Use 5 decimal precision as a safe standard
    return num.toFixed(5).replace(/\.?0+$/, '');
}

export interface PieceLineMapping {
  pieceId: string;
  lineNumber: number;
}

export interface SerializationResult {
  content: string;
  pieceLineMapping: PieceLineMapping[];
}

export function serializeModel(model: LDrawModel): string;
export function serializeModel(model: LDrawModel, includeMapping: true): SerializationResult;
export function serializeModel(model: LDrawModel, includeMapping?: boolean): string | SerializationResult {
  const lines: string[] = [];
  const pieceLineMapping: PieceLineMapping[] = [];

  // Handle metadata
  if (model.name) {
    lines.push(`0 Name: ${model.name}`);
  }

  if (model.author) {
    lines.push(`0 Author: ${model.author}`);
  }

  if (model.description) {
    lines.push(`0 Description: ${model.description}`);
  }

  // Handle pieces (Type 1 lines)
  for (const piece of model.pieces) {
    const { colorCode, position, rotationMatrix, partId } = piece;

    const pos = `${fmt(position.x)} ${fmt(position.y)} ${fmt(position.z)}`;
    const rot = rotationMatrix.map(fmt).join(' ');

    // Format: 1 <color> <x> <y> <z> <a>..<i> <file>
    const pieceLine = `1 ${colorCode} ${pos} ${rot} ${partId}`;
    lines.push(pieceLine);

    // Track piece line mapping (1-based line numbers for Monaco editor)
    if (includeMapping) {
      pieceLineMapping.push({
        pieceId: piece.id,
        lineNumber: lines.length
      });
    }
  }

  const content = lines.join('\n');

  if (includeMapping) {
    return {
      content,
      pieceLineMapping
    };
  }

  return content;
}

 