import { describe, it, expect, beforeEach } from 'vitest';
import { parseLDraw } from '../ldraw/LDrawParser';
import { serializeModel } from '../ldraw/LDrawSerializer';
import { v4 as mockUuid } from 'uuid';

const sampleLDraw = `0 Name: Test.ldr
1 4 10 20 30 1 0 0 0 1 0 0 0 1 3001.dat
1 16 0.5 0 0 1 0 0 0 1 0 0 0 1 3003.dat`;

describe('LDraw Parser and Serializer', () => {
  beforeEach(() => {
    // Define the sequence of UUIDs the mock will return
    (mockUuid as any).mockClear();
    (mockUuid as any).mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2');
  });

  it('should assign unique, deterministic IDs to each piece', () => {
    const model = parseLDraw(sampleLDraw);
    expect(model.pieces.length).toBe(2);
    expect(model.pieces[0].id).toBe('uuid-1');
    expect(model.pieces[1].id).toBe('uuid-2');
  });

  it('should parse piece properties correctly', () => {
    const model = parseLDraw(sampleLDraw);
    
    // First piece
    expect(model.pieces[0].colorCode).toBe(4);
    expect(model.pieces[0].position.x).toBe(10);
    expect(model.pieces[0].position.y).toBe(20);
    expect(model.pieces[0].position.z).toBe(30);
    expect(model.pieces[0].rotationMatrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(model.pieces[0].partId).toBe('3001.dat');

    // Second piece
    expect(model.pieces[1].colorCode).toBe(16);
    expect(model.pieces[1].position.x).toBe(0.5);
    expect(model.pieces[1].position.y).toBe(0);
    expect(model.pieces[1].position.z).toBe(0);
    expect(model.pieces[1].partId).toBe('3003.dat');
  });

  it('should parse metadata correctly', () => {
    const model = parseLDraw(sampleLDraw);
    expect(model.name).toBe('Test.ldr');
  });

  it('should serialize with clean formatting (integers and floats)', () => {
    const model = parseLDraw(sampleLDraw);
    const serialized = serializeModel(model);
    
    // Check that it includes metadata
    expect(serialized).toContain('0 Name: Test.ldr');
    
    // Check integer formatting
    expect(serialized).toContain('1 4 10 20 30 1 0 0 0 1 0 0 0 1 3001.dat');
    // Check float formatting (0.5 instead of 0.50000)
    expect(serialized).toContain('1 16 0.5 0 0 1 0 0 0 1 0 0 0 1 3003.dat');
  });

  it('should handle round-trip parsing and serialization', () => {
    const model = parseLDraw(sampleLDraw);
    const serialized = serializeModel(model);
    
    // Reset mock for round-trip
    (mockUuid as any).mockReturnValueOnce('uuid-3').mockReturnValueOnce('uuid-4');
    
    const roundTripModel = parseLDraw(serialized);
    
    // Should have same number of pieces
    expect(roundTripModel.pieces.length).toBe(model.pieces.length);
    
    // Should have same piece properties (excluding ID which is regenerated)
    for (let i = 0; i < model.pieces.length; i++) {
      const original = model.pieces[i];
      const roundTrip = roundTripModel.pieces[i];
      
      expect(roundTrip.colorCode).toBe(original.colorCode);
      expect(roundTrip.position.x).toBe(original.position.x);
      expect(roundTrip.position.y).toBe(original.position.y);
      expect(roundTrip.position.z).toBe(original.position.z);
      expect(roundTrip.rotationMatrix).toEqual(original.rotationMatrix);
      expect(roundTrip.partId).toBe(original.partId);
    }
  });

  it('should handle empty models', () => {
    const model = parseLDraw('0 Empty Model');
    expect(model.pieces.length).toBe(0);
    expect(model.name).toBe('Empty Model');
  });

  it('should skip invalid lines gracefully', () => {
    const invalidLDraw = `0 Test Model
// This is a comment
1 4 invalid line
1 4 10 20 30 1 0 0 0 1 0 0 0 1 3001.dat`;
    
    (mockUuid as any).mockReturnValue('uuid-valid');
    
    const model = parseLDraw(invalidLDraw);
    expect(model.pieces.length).toBe(1); // Only the valid line should be parsed
    expect(model.pieces[0].partId).toBe('3001.dat');
  });
}); 