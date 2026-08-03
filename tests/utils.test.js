import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  statusToCssClass,
  safeJsonParse,
  parseGeminiJson,
  setButtonLoading,
  withButtonLoading,
  blobToBase64,
  makeId
} from '../src/utils.js';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml("it's")).toBe('it&#39;s');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('returns empty string for nullish values', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('statusToCssClass', () => {
  it('normalizes status strings for CSS classes', () => {
    expect(statusToCssClass('Varroa-Behandlung')).toBe('varroa-behandlung');
    expect(statusToCssClass('Schwarm Stimmung!')).toBe('schwarm-stimmung');
  });

  it('handles empty input', () => {
    expect(statusToCssClass('')).toBe('');
    expect(statusToCssClass(null)).toBe('');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse('[1,2]')).toEqual([1, 2]);
  });

  it('returns fallback for empty/invalid input', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
    expect(safeJsonParse('', {})).toEqual({});
    expect(safeJsonParse('{bad', { ok: false })).toEqual({ ok: false });
  });
});

describe('parseGeminiJson', () => {
  it('parses raw JSON', () => {
    expect(parseGeminiJson('{"notes":"ok"}')).toEqual({ notes: 'ok' });
  });

  it('strips markdown fences', () => {
    const fenced = '```json\n{"price":12.5}\n```';
    expect(parseGeminiJson(fenced)).toEqual({ price: 12.5 });
  });

  it('extracts JSON embedded in prose', () => {
    const text = 'Hier das Ergebnis:\n{"hiveNames":["Kasten 1"],"notes":"Brut ok"}\nEnde.';
    expect(parseGeminiJson(text)).toEqual({
      hiveNames: ['Kasten 1'],
      notes: 'Brut ok'
    });
  });

  it('throws on empty or non-JSON responses', () => {
    expect(() => parseGeminiJson('')).toThrow(/Leere/);
    expect(() => parseGeminiJson('keine daten')).toThrow(/Kein JSON/);
  });
});

describe('setButtonLoading / withButtonLoading', () => {
  it('shows a spinner and restores the original label', async () => {
    const button = document.createElement('button');
    button.innerHTML = 'Speichern';

    setButtonLoading(button, true, 'Speichern…');
    expect(button.disabled).toBe(true);
    expect(button.classList.contains('is-loading')).toBe(true);
    expect(button.querySelector('.btn-spinner')).toBeTruthy();
    expect(button.textContent).toContain('Speichern…');

    setButtonLoading(button, false);
    expect(button.disabled).toBe(false);
    expect(button.classList.contains('is-loading')).toBe(false);
    expect(button.innerHTML).toBe('Speichern');
  });

  it('restores the button even when the async action fails', async () => {
    const button = document.createElement('button');
    button.textContent = 'Speichern';

    await expect(
      withButtonLoading(button, async () => {
        throw new Error('fail');
      })
    ).rejects.toThrow('fail');

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Speichern');
  });
});

describe('blobToBase64', () => {
  it('returns raw base64 without the data-URL prefix', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const base64 = await blobToBase64(blob);
    expect(base64).toBe(btoa('hello'));
    expect(base64).not.toContain('data:');
  });
});

describe('makeId', () => {
  it('prefixes a UUID-like id', () => {
    const id = makeId('hive_');
    expect(id.startsWith('hive_')).toBe(true);
    expect(id.length).toBeGreaterThan('hive_'.length + 8);
  });

  it('produces unique ids', () => {
    expect(makeId('x_')).not.toBe(makeId('x_'));
  });
});

