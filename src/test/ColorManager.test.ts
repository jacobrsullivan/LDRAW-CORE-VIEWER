import { describe, it, expect } from 'vitest';
import { LDrawColorManager } from '../ldraw/ColorManager';

describe('LDrawColorManager', () => {
  // Test color initialization
  it('should provide predefined LDraw colors', () => {
    const blackColor = LDrawColorManager.getLDrawColorValue(0);
    const blueColor = LDrawColorManager.getLDrawColorValue(1);
    
    expect(blackColor).toBe(0x000000);
    expect(blueColor).toBe(0x0055BF);
  });

  // Test getting color by code
  it('should return the correct color for a given code', () => {
    const color = LDrawColorManager.getLDrawColorValue(0);
    expect(color).toBe(0x000000);
  });

  // Test translucent colors
  it('should handle translucent color variants correctly', () => {
    const opaqueColor = LDrawColorManager.getLDrawColorValue(1); // Blue
    const translucentColor = LDrawColorManager.getLDrawColorValue(33); // Translucent Blue
    
    expect(opaqueColor).toBe(0x0055BF);
    expect(translucentColor).toBe(0x0055BF); // Same color value, just translucent
    expect(LDrawColorManager.isTranslucentColor(33)).toBe(true);
    expect(LDrawColorManager.getColorOpacity(33)).toBe(0.5);
  });

  // Test custom colors
  it('should handle custom colors (codes >= 256)', () => {
    const customColor = LDrawColorManager.getLDrawColorValue(256);
    expect(customColor).toBe(0x8a00a8); // Purple to indicate custom color
  });

  // Test unknown colors
  it('should return a default color for unknown standard color codes', () => {
    const unknownColor = LDrawColorManager.getLDrawColorValue(200); // A color code < 256 that's not in the map
    expect(unknownColor.toString(16)).toBe('7f7f7f'); // Default medium gray
  });
}); 