import { callGemini } from './geminiApi.js';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function parseReceiptWithGemini(file) {
  if (!file) {
    throw new Error('Keine Bilddatei ausgewählt.');
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error('Beleg-Bild ist zu gross (max. 8 MB).');
  }
  if (file.type && !ALLOWED_RECEIPT_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    throw new Error('Bitte ein Bild als Beleg hochladen.');
  }

  const base64Image = await fileToBase64(file);

  try {
    return await callGemini(
      'parse_receipt',
      {
        data: base64Image,
        mimeType: file.type || 'image/jpeg'
      },
      90000
    );
  } catch (error) {
    console.error('Error parsing receipt with Gemini:', error);
    throw new Error(`Fehler bei der Beleg-Analyse: ${error.message}`);
  }
}
