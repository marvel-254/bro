import { ICONS } from '../icons';

describe('ICONS', () => {
  it('contains expected icon keys', () => {
    expect(Object.keys(ICONS)).toContain('pulse');
    expect(Object.keys(ICONS)).toContain('people');
    expect(Object.keys(ICONS)).toContain('create');
    expect(Object.keys(ICONS)).toContain('spaces');
    expect(Object.keys(ICONS)).toContain('you');
    expect(Object.keys(ICONS)).toContain('search');
    expect(Object.keys(ICONS)).toContain('back');
    expect(Object.keys(ICONS)).toContain('settings');
  });

  it('each icon has a name and library', () => {
    for (const icon of Object.values(ICONS)) {
      expect(icon).toHaveProperty('name');
      expect(icon).toHaveProperty('library');
      expect(typeof icon.name).toBe('string');
      expect(icon.library).toBeDefined();
    }
  });
});