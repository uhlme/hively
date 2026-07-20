import { beforeEach, describe, expect, it } from 'vitest';
import {
  saveOfflineMemo,
  getOfflineMemos,
  deleteOfflineMemo,
  blobToBase64,
  base64ToBlob
} from '../src/offlineAI.js';

describe('offlineAI IndexedDB cache', () => {
  beforeEach(async () => {
    // Clear any leftover memos between tests
    const memos = await getOfflineMemos();
    await Promise.all(memos.map((m) => deleteOfflineMemo(m.id)));
  });

  it('round-trips blob <-> base64', async () => {
    const original = new Blob(['hello-bees'], { type: 'text/plain' });
    const base64 = await blobToBase64(original);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    const restored = base64ToBlob(base64, 'text/plain');
    expect(restored.type).toBe('text/plain');
    expect(await restored.text()).toBe('hello-bees');
  });

  it('saves, lists, and deletes offline memos', async () => {
    const saved = await saveOfflineMemo('voice', 'YWJj', 'audio/webm', { hiveHint: 'Kasten 1' });
    expect(saved.id).toMatch(/^memo_/);
    expect(saved.type).toBe('voice');

    const listed = await getOfflineMemos();
    expect(listed).toHaveLength(1);
    expect(listed[0].mediaData).toBe('YWJj');
    expect(listed[0].additionalData.hiveHint).toBe('Kasten 1');

    await deleteOfflineMemo(saved.id);
    expect(await getOfflineMemos()).toHaveLength(0);
  });

  it('stores receipt memos separately from voice memos', async () => {
    await saveOfflineMemo('voice', 'dm9pY2U=', 'audio/webm');
    await saveOfflineMemo('receipt', 'cmVjZWlwdA==', 'image/jpeg');

    const memos = await getOfflineMemos();
    expect(memos).toHaveLength(2);
    expect(memos.map((m) => m.type).sort()).toEqual(['receipt', 'voice']);
  });
});
