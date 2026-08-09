/**
 * Browser / Android hardware-back history for in-app views.
 *
 * Capacitor's default Android back button uses window.history: if there is no
 * prior entry, the app exits. Nested views (e.g. hive-detail) must pushState
 * so Back returns to the previous screen instead of closing the app.
 */

export const NESTED_VIEWS = new Set(['hive-detail']);

export function isNestedView(viewName) {
  return NESTED_VIEWS.has(viewName);
}

/**
 * Decide how to sync History for a view transition.
 * @param {string} fromView
 * @param {string} toView
 * @param {'auto' | 'push' | 'replace' | 'skip'} mode
 * @returns {'push' | 'replace' | 'skip'}
 */
export function resolveHistoryAction(fromView, toView, mode = 'auto') {
  if (mode === 'skip' || mode === 'push' || mode === 'replace') return mode;
  if (isNestedView(toView) && fromView !== toView) return 'push';
  return 'replace';
}

/**
 * Build a history.state payload for a view.
 * @param {string} view
 * @param {{ hiveId?: string | null }} [extra]
 */
export function buildHistoryState(view, extra = {}) {
  return {
    hively: 1,
    view,
    hiveId: isNestedView(view) ? (extra.hiveId || null) : null,
    nested: isNestedView(view)
  };
}

/**
 * Apply push/replace for the current location (URL unchanged).
 * @param {'push' | 'replace' | 'skip'} action
 * @param {object} state
 * @param {{ pushState?: Function, replaceState?: Function }} [historyApi]
 */
export function applyHistoryAction(action, state, historyApi = globalThis.history) {
  if (!historyApi || action === 'skip') return;
  if (action === 'push') {
    historyApi.pushState(state, '', globalThis.location?.href);
  } else if (action === 'replace') {
    historyApi.replaceState(state, '', globalThis.location?.href);
  }
}

/**
 * Read view (+ optional hiveId) from a popstate / history state.
 * @param {object | null | undefined} state
 * @param {string} [fallbackView='dashboard']
 */
export function viewFromHistoryState(state, fallbackView = 'dashboard') {
  if (state && typeof state === 'object' && typeof state.view === 'string' && state.view) {
    return {
      view: state.view,
      hiveId: state.hiveId || null,
      nested: Boolean(state.nested)
    };
  }
  return { view: fallbackView, hiveId: null, nested: false };
}

/**
 * Whether the UI back control should call history.back().
 * @param {object | null | undefined} state
 */
export function shouldHistoryBackFromNested(state) {
  return Boolean(state && state.hively && state.nested);
}
