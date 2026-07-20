import { beforeEach, describe, expect, it } from 'vitest';
import {
  setActiveOperation,
  clearActiveOperation,
  getActiveOperationId,
  getActiveOperationRole,
  isOperationOwner,
  canEditOperation,
  isOperationViewer,
  roleLabel,
  buildInviteLink
} from '../src/operations.js';

describe('operations local active state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and clears the active Betrieb', () => {
    setActiveOperation({
      id: 'op-1',
      name: 'Imkerei Test',
      address_line: 'Weg 1',
      postal_code: '8000',
      city: 'Zürich'
    }, 'owner');

    expect(getActiveOperationId()).toBe('op-1');
    expect(getActiveOperationRole()).toBe('owner');
    expect(isOperationOwner()).toBe(true);

    clearActiveOperation();
    expect(getActiveOperationId()).toBeNull();
    expect(isOperationOwner()).toBe(false);
  });

  it('builds a join link with the invite code', () => {
    const link = buildInviteLink('ABCD2345');
    expect(link).toContain('join=ABCD2345');
  });

  it('treats owner and editor as editable, viewer as read-only', () => {
    setActiveOperation({ id: 'op-1', name: 'Home' }, 'owner');
    expect(canEditOperation()).toBe(true);
    expect(isOperationViewer()).toBe(false);
    expect(roleLabel('owner')).toBe('Inhaber');

    setActiveOperation({ id: 'op-1', name: 'Home' }, 'editor');
    expect(canEditOperation()).toBe(true);
    expect(isOperationViewer()).toBe(false);
    expect(roleLabel('editor')).toBe('Mitarbeiter');

    setActiveOperation({ id: 'op-1', name: 'Home' }, 'viewer');
    expect(canEditOperation()).toBe(false);
    expect(isOperationViewer()).toBe(true);
    expect(roleLabel('viewer')).toBe('Betrachter');
  });
});
