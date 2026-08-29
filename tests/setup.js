import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Stub navigator.onLine and optional Network Information API fields.
 */
export function mockNavigatorNetwork({
  onLine = true,
  effectiveType = '4g',
  saveData = false,
  downlink = null,
  rtt = null
} = {}) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => onLine
  });

  const connection = {
    effectiveType,
    saveData,
    downlink,
    rtt,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
    writable: true
  });

  return connection;
}
