import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callGeminiMock, blobToBase64Mock } = vi.hoisted(() => ({
  callGeminiMock: vi.fn(),
  blobToBase64Mock: vi.fn()
}));

vi.mock('../src/geminiApi.js', () => ({
  callGemini: callGeminiMock
}));

vi.mock('../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    blobToBase64: blobToBase64Mock
  };
});

describe('parseReceiptWithGemini', () => {
  beforeEach(() => {
    callGeminiMock.mockReset();
    blobToBase64Mock.mockReset();
    blobToBase64Mock.mockResolvedValue('base64-data');
    callGeminiMock.mockResolvedValue({
      description: 'Zucker',
      price: 12.5,
      date: '2026-08-01'
    });
  });

  it('sends image payload to Gemini and returns parsed fields', async () => {
    const { parseReceiptWithGemini } = await import('../src/receiptScanner.js');
    const file = new File(['img'], 'beleg.jpg', { type: 'image/jpeg' });

    const result = await parseReceiptWithGemini(file);

    expect(blobToBase64Mock).toHaveBeenCalledWith(file);
    expect(callGeminiMock).toHaveBeenCalledWith(
      'parse_receipt',
      { data: 'base64-data', mimeType: 'image/jpeg' },
      90000
    );
    expect(result).toEqual({
      description: 'Zucker',
      price: 12.5,
      date: '2026-08-01'
    });
  });

  it('defaults mimeType to image/jpeg when file.type is empty', async () => {
    const { parseReceiptWithGemini } = await import('../src/receiptScanner.js');
    const file = new File(['img'], 'beleg');
    Object.defineProperty(file, 'type', { value: '' });

    await parseReceiptWithGemini(file);

    expect(callGeminiMock).toHaveBeenCalledWith(
      'parse_receipt',
      { data: 'base64-data', mimeType: 'image/jpeg' },
      90000
    );
  });

  it('throws when no file is provided', async () => {
    const { parseReceiptWithGemini } = await import('../src/receiptScanner.js');
    await expect(parseReceiptWithGemini(null)).rejects.toThrow('Keine Bilddatei ausgewählt.');
  });

  it('throws when file exceeds 8 MB', async () => {
    const { parseReceiptWithGemini } = await import('../src/receiptScanner.js');
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', {
      type: 'image/jpeg'
    });
    await expect(parseReceiptWithGemini(file)).rejects.toThrow(/max\. 8 MB/);
  });

  it('throws for non-image types', async () => {
    const { parseReceiptWithGemini } = await import('../src/receiptScanner.js');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await expect(parseReceiptWithGemini(file)).rejects.toThrow(/Bild als Beleg/);
  });

  it('wraps Gemini failures with a German error message', async () => {
    callGeminiMock.mockRejectedValueOnce(new Error('timeout'));
    const { parseReceiptWithGemini } = await import('../src/receiptScanner.js');
    const file = new File(['img'], 'beleg.png', { type: 'image/png' });

    await expect(parseReceiptWithGemini(file)).rejects.toThrow(
      'Fehler bei der Beleg-Analyse: timeout'
    );
  });
});
