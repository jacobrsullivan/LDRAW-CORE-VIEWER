/**
 * ColorManager for LDraw colors
 * 
 * Manages the mapping between LDraw color codes and actual color values.
 */
export class LDrawColorManager {
  private static readonly COLOR_MAP: { [key: number]: number } = {
    0: 0x000000,   // Black
    1: 0x0055BF,   // Blue
    2: 0x009496,   // Green
    3: 0x00Af9b,   // Dark Turquoise
    4: 0xC91A09,   // Red
    5: 0xFF7D5B,   // Pink
    6: 0x5F2A0D,   // Brown
    7: 0x9BA19D,   // Light Gray
    8: 0x6D6E5C,   // Dark Gray
    9: 0xB4D2E3,   // Light Blue
    10: 0x4BC374,  // Bright Green
    11: 0x68C3B7,  // Turquoise
    12: 0xF47B30,  // Orange
    13: 0xF0EEEE,  // Pink
    14: 0xf6EA2C,  // Yellow
    15: 0xF8F8F8,  // White
    16: 0x1B2A34,  // Black - Main color (default)
    17: 0x00852B,  // Green
    18: 0xAF9F3C,  // Sandy Yellow
    19: 0xC15522,  // Tan
    20: 0xD4CACA,  // Light Gray
    21: 0x635A4F,  // Dark Gray
    22: 0xA5A5CB,  // Purple
    23: 0xBBCEED,  // Light Blue
    24: 0x0E3585,  // Medium Blue
    25: 0x3B9C2F,  // Medium Green
    26: 0xF4F4F4,  // White
  };

  /**
   * Get the hex color value for an LDraw color code
   * 
   * @param colorCode The LDraw color code
   * @returns The hex color value
   */
  public static getLDrawColorValue(colorCode: number): number {
    // Special cases
    if (colorCode >= 32 && colorCode <= 47) {
      // Semi-transparent versions of previous colors
      const baseColor = this.COLOR_MAP[colorCode - 32];
      return baseColor || 0x7F7F7F; // Fallback to medium gray
    }
    
    if (colorCode >= 256) {
      // Custom colors - use a notable color
      return 0x8a00a8; // Purple to indicate custom color
    }
    
    // Return the color from the map or default to medium gray for unknown colors
    return this.COLOR_MAP[colorCode] ?? 0x7F7F7F;
  }

  /**
   * Check if a color code is translucent (has alpha)
   * 
   * @param colorCode The LDraw color code
   * @returns True if the color is translucent
   */
  public static isTranslucentColor(colorCode: number): boolean {
    return colorCode >= 32 && colorCode <= 47;
  }

  /**
   * Get the opacity value for an LDraw color code
   * 
   * @param colorCode The LDraw color code
   * @returns The opacity value (0-1)
   */
  public static getColorOpacity(colorCode: number): number {
    if (this.isTranslucentColor(colorCode)) {
      return 0.5; // Standard translucent value
    }
    return 1.0;
  }

  /**
   * Get the complement/edge color for a given LDraw color code
   * Used for color 24 (edge color) inheritance
   * 
   * @param colorCode The parent LDraw color code
   * @returns The hex color value for edges
   */
  public static getComplementColor(colorCode: number): number {
    // For now, use a darker version of the main color for edges
    // TODO: Implement proper LDraw complement color lookup from LDConfig
    const mainColor = this.getLDrawColorValue(colorCode);
    
    // Extract RGB components
    const r = (mainColor >> 16) & 0xFF;
    const g = (mainColor >> 8) & 0xFF;
    const b = mainColor & 0xFF;
    
    // Darken by 30% for edge effect
    const darkenFactor = 0.7;
    const darkR = Math.floor(r * darkenFactor);
    const darkG = Math.floor(g * darkenFactor);
    const darkB = Math.floor(b * darkenFactor);
    
    return (darkR << 16) | (darkG << 8) | darkB;
  }
} 