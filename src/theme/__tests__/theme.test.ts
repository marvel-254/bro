import { COLORS, SEMANTIC_COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../index';

const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

describe('COLORS', () => {
  it('exports all color values as hex strings', () => {
    const colorKeys = Object.keys(COLORS);
    expect(colorKeys.length).toBeGreaterThan(0);
    for (const key of colorKeys) {
      const value = (COLORS as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        expect(value).toMatch(hexColorRegex);
      }
    }
  });

  it('has the expected semantic color keys', () => {
    expect(COLORS.semantic.canvasRoot).toBe('#090A0F');
    expect(COLORS.semantic.surfaceLevel1).toBe('#0E1118');
    expect(COLORS.semantic.textPrimary).toBe('#F2F5F9');
  });

  it('has primary colors defined', () => {
    expect(COLORS.primary).toBe('#dbfcff');
    expect(COLORS.onPrimary).toBe('#00363a');
    expect(COLORS.primaryContainer).toBe('#00f0ff');
  });

  it('has error colors defined', () => {
    expect(COLORS.error).toBe('#ffb4ab');
    expect(COLORS.onError).toBe('#690005');
  });
});

describe('SEMANTIC_COLORS', () => {
  it('matches the COLORS.semantic object', () => {
    expect(SEMANTIC_COLORS).toEqual(COLORS.semantic);
  });
});

describe('TYPOGRAPHY', () => {
  it('defines font families', () => {
    expect(TYPOGRAPHY.fontFamily.display).toBe('Outfit');
    expect(TYPOGRAPHY.fontFamily.body).toBe('Geist');
  });

  it('has consistent headline sizes (descending)', () => {
    expect(TYPOGRAPHY.headlineXL.fontSize).toBeGreaterThan(TYPOGRAPHY.headlineLG.fontSize);
    expect(TYPOGRAPHY.headlineLG.fontSize).toBeGreaterThan(TYPOGRAPHY.headlineSM.fontSize);
  });

  it('has consistent body sizes (descending)', () => {
    expect(TYPOGRAPHY.bodyLG.fontSize).toBeGreaterThan(TYPOGRAPHY.bodyMD.fontSize);
    expect(TYPOGRAPHY.bodyMD.fontSize).toBeGreaterThan(TYPOGRAPHY.bodySM.fontSize);
  });

  it('all typography entries have fontSize and lineHeight', () => {
    for (const [key, value] of Object.entries(TYPOGRAPHY)) {
      if (key === 'fontFamily') continue;
      const style = value as { fontSize: number; lineHeight: number; fontWeight: string };
      expect(style.fontSize).toBeDefined();
      expect(style.lineHeight).toBeDefined();
      expect(style.fontWeight).toBeDefined();
    }
  });
});

describe('SPACING', () => {
  it('has a consistent scale', () => {
    expect(SPACING.spaceXs).toBe(4);
    expect(SPACING.spaceSm).toBe(8);
    expect(SPACING.spaceMd).toBe(12);
    expect(SPACING.spaceLg).toBe(20);
    expect(SPACING.spaceXl).toBe(32);
  });
});

describe('RADIUS', () => {
  it('has a consistent scale', () => {
    expect(RADIUS.sm).toBe(8);
    expect(RADIUS.DEFAULT).toBe(16);
    expect(RADIUS.md).toBe(24);
    expect(RADIUS.lg).toBe(32);
    expect(RADIUS.xl).toBe(48);
    expect(RADIUS.full).toBe(9999);
  });
});