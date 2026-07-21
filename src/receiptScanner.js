import { callGemini } from './geminiApi.js';
import { blobToBase64 } from './utils.js';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);

export async function parseReceiptWithGemini(file) {
  if (!file) throw new Error('Keine Bilddatei ausgewählt.');
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error('Beleg-Bild ist zu gross (max. 8 MB).');
  }
  if (file.type && !ALLOWED_RECEIPT_TYPES.has(file.type) && !file.type.startsWith('image/')) {
    throw new Error('Bitte ein Bild als Beleg hochladen.');
  }

  try {
    return await callGemini(
      'parse_receipt',
      {
        data: await blobToBase64(file),
        mimeType: file.type || 'image/jpeg'
      },
      90000
    );
  } catch (error) {
    console.error('Error parsing receipt with Gemini:', error);
    throw new Error(`Fehler bei der Beleg-Analyse: ${error.message}`);
  }
}
