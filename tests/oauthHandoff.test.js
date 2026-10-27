import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = {
  data: new Map(),
  async setJSON(key, value) {
    this.data.set(key, value);
  },
  async get(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  },
  async delete(key) {
    this.data.delete(key);
  }
};

vi.mock('@netlify/blobs', () => ({
  connectLambda: vi.fn(),
  getStore: vi.fn(() => store)
}));

import {
  claimOAuthHandoff,
  normalizeHandoffId,
  storeOAuthHandoff
} from '../server/oauthHandoff.js';

describe('oauthHandoff', () => {
  beforeEach(() => {
    store.data.clear();
  });

  it('accepts UUID and opaque handoff ids', () => {
    expect(normalizeHandoffId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(normalizeHandoffId('h-abc123def456ghi7')).toBe('h-abc123def456ghi7');
    expect(normalizeHandoffId('nope')).toBeNull();
  });

  it('stores and claims a code once', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const stored = await storeOAuthHandoff({ id, code: 'oauth-code-1', mode: 'sign-in' });
    expect(stored.ok).toBe(true);

    const claimed = await claimOAuthHandoff(id);
    expect(claimed).toEqual({
      ok: true,
      status: 200,
      body: { code: 'oauth-code-1', mode: 'sign-in' }
    });

    const again = await claimOAuthHandoff(id);
    expect(again.ok).toBe(false);
    expect(again.status).toBe(404);
  });

  it('rejects invalid payloads', async () => {
    const bad = await storeOAuthHandoff({ id: 'x', code: 'abc' });
    expect(bad.status).toBe(400);
  });
});
