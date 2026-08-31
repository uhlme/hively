/**
 * UI preferences (visual only, separate from network prefs).
 */
import { safeJsonParse } from './utils.js';

const PREFS_KEY = 'hively_ui_prefs';
const DEFAULT_PREFS = {
  /** Larger touch targets in inspection form (glove-friendly) */
  gloveMode: false
};

export function getUiPrefs() {
  const stored = safeJsonParse(localStorage.getItem(PREFS_KEY), null);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...stored };
}

export function saveUiPrefs(partial) {
  const next = { ...getUiPrefs(), ...partial };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export function isGloveModeEnabled() {
  return !!getUiPrefs().gloveMode;
}
