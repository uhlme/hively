import { beforeEach, describe, expect, it } from 'vitest';
import {
  setActiveOperation,
  clearActiveOperation,
  getActiveOperationId,
  getActiveOperationRole,
  isOperationOwner,
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
});
