import { describe, it, expect, vi } from 'vitest';
import {
  applyHistoryAction,
  buildHistoryState,
  isNestedView,
  resolveHistoryAction,
  shouldHistoryBackFromNested,
  viewFromHistoryState
} from '../src/navigationHistory.js';

describe('navigationHistory', () => {
  it('treats hive-detail as nested', () => {
    expect(isNestedView('hive-detail')).toBe(true);
    expect(isNestedView('dashboard')).toBe(false);
    expect(isNestedView('hives')).toBe(false);
  });

  it('pushes when entering hive-detail and replaces for tab switches', () => {
    expect(resolveHistoryAction('dashboard', 'hive-detail', 'auto')).toBe('push');
    expect(resolveHistoryAction('hives', 'hive-detail', 'auto')).toBe('push');
    expect(resolveHistoryAction('hive-detail', 'hive-detail', 'auto')).toBe('replace');
    expect(resolveHistoryAction('dashboard', 'hives', 'auto')).toBe('replace');
    expect(resolveHistoryAction('hives', 'dashboard', 'auto')).toBe('replace');
    expect(resolveHistoryAction('dashboard', 'hive-detail', 'skip')).toBe('skip');
    expect(resolveHistoryAction('dashboard', 'hives', 'push')).toBe('push');
  });

  it('builds history state with hive id only for nested views', () => {
    expect(buildHistoryState('hive-detail', { hiveId: 'hive_1' })).toEqual({
      hively: 1,
      view: 'hive-detail',
      hiveId: 'hive_1',
      nested: true
    });
    expect(buildHistoryState('dashboard', { hiveId: 'hive_1' })).toEqual({
      hively: 1,
      view: 'dashboard',
      hiveId: null,
      nested: false
    });
  });

  it('applies push/replace and skips when requested', () => {
    const historyApi = {
      pushState: vi.fn(),
      replaceState: vi.fn()
    };
    const state = buildHistoryState('hive-detail', { hiveId: 'h1' });

    applyHistoryAction('skip', state, historyApi);
    expect(historyApi.pushState).not.toHaveBeenCalled();
    expect(historyApi.replaceState).not.toHaveBeenCalled();

    applyHistoryAction('push', state, historyApi);
    expect(historyApi.pushState).toHaveBeenCalledOnce();
    expect(historyApi.pushState.mock.calls[0][0]).toEqual(state);

    applyHistoryAction('replace', buildHistoryState('hives'), historyApi);
    expect(historyApi.replaceState).toHaveBeenCalledOnce();
  });

  it('reads view from popstate payload with dashboard fallback', () => {
    expect(viewFromHistoryState({ view: 'hives', hiveId: null })).toEqual({
      view: 'hives',
      hiveId: null,
      nested: false
    });
    expect(viewFromHistoryState({ view: 'hive-detail', hiveId: 'x', nested: true })).toEqual({
      view: 'hive-detail',
      hiveId: 'x',
      nested: true
    });
    expect(viewFromHistoryState(null)).toEqual({
      view: 'dashboard',
      hiveId: null,
      nested: false
    });
  });

  it('only history-backs from nested hively states', () => {
    expect(shouldHistoryBackFromNested(buildHistoryState('hive-detail', { hiveId: '1' }))).toBe(true);
    expect(shouldHistoryBackFromNested(buildHistoryState('dashboard'))).toBe(false);
    expect(shouldHistoryBackFromNested(null)).toBe(false);
    expect(shouldHistoryBackFromNested({ view: 'hive-detail' })).toBe(false);
  });
});
