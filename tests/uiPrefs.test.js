import { describe, expect, it, beforeEach } from 'vitest';
import { getUiPrefs, saveUiPrefs, isGloveModeEnabled } from '../src/uiPrefs.js';

describe('ui prefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(getUiPrefs()).toEqual({ gloveMode: false });
  });

  it('returns defaults when stored JSON is corrupt', () => {
    localStorage.setItem('hively_ui_prefs', '{not-json');
    expect(getUiPrefs().gloveMode).toBe(false);
  });

  it('persists glove mode and merges partial updates', () => {
    const prefs = saveUiPrefs({ gloveMode: true });
    expect(prefs.gloveMode).toBe(true);
    expect(isGloveModeEnabled()).toBe(true);
    const merged = saveUiPrefs({});
    expect(merged.gloveMode).toBe(true);
  });
});
