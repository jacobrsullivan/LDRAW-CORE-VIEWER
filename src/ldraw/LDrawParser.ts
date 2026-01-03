import { v4 as uuidv4 } from 'uuid';
import { LDrawModel, LDrawPiece, RotationMatrix } from './LDrawDataModels';
import { Vector3 } from 'three';

// Adapt this to your existing parser structure
export function parseLDraw(ldrawText: string): LDrawModel {
  const lines = ldrawText.split('\n');
  const pieces: LDrawPiece[] = [];
  let name: string | undefined;
  let author: string | undefined;
  let description: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments starting with //
    if (!trimmedLine || trimmedLine.startsWith('//')) {
      continue;
    }

    const parts = trimmedLine.split(/\s+/);
    const lineType = parseInt(parts[0], 10);

    if (lineType === 0) {
      // Type 0: Meta command or comment
      if (parts.length > 1) {
        const command = parts.slice(1).join(' ');
        
        // Parse common metadata
        if (command.toLowerCase().startsWith('name:')) {
          name = command.substring(5).trim();
        } else if (command.toLowerCase().startsWith('author:')) {
          author = command.substring(7).trim();
        } else if (command.toLowerCase().startsWith('description:')) {
          description = command.substring(12).trim();
        } else if (!name && i === 0) {
          // First line without explicit "Name:" prefix is often the model name
          name = command;
        }
      }
    } else if (lineType === 1) {
      // Type 1: Part reference line
      if (parts.length >= 15) {
        try {
          const piece: LDrawPiece = {
            id: uuidv4(), // <-- THE KEY CHANGE: Assign stable ID during parsing
            colorCode: parseInt(parts[1], 10),
            position: new Vector3(
              parseFloat(parts[2]), 
              parseFloat(parts[3]), 
              parseFloat(parts[4])
            ),
            rotationMatrix: parts.slice(5, 14).map(parseFloat) as RotationMatrix,
            partId: parts.slice(14).join(' '),
          };

          pieces.push(piece);
        } catch (error) {
          console.warn(`Failed to parse Type 1 line ${i + 1}: ${trimmedLine}`, error);
        }
      } else {
        console.warn(`Invalid Type 1 line ${i + 1}: insufficient parts (${parts.length}/15 required)`);
      }
    }
    // Note: Types 2-5 (lines, triangles, quads, optional lines) are handled by part files
    // and not typically needed for scene-level parsing
  }

  return { 
    pieces, 
    name, 
    author, 
    description 
  };
}

 