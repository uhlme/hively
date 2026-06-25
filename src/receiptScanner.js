import { GoogleGenerativeAI } from '@google/generative-ai';

// Convert File/Blob to Base64
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

// Send Image to Gemini API for OCR receipt extraction
export async function parseReceiptWithGemini(file) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API-Schlüssel fehlt. Bitte tragen Sie diesen in der .env Datei ein.');
  }

  const base64Image = await fileToBase64(file);
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Using gemini-2.5-flash which is multimodal and highly efficient for OCR
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Du bist ein Beleg-Scanner für eine Imker-App.
Analysiere das beigefügte Bild der Quittung/Rechnung.
Extrahiere die folgenden Informationen und gib sie als strukturiertes JSON-Objekt zurück:
- date: Das Belegdatum im Format YYYY-MM-DD (falls nicht auffindbar, nimm das heutige Datum im gleichen Format: YYYY-MM-DD).
- description: Eine kurze Zusammenfassung der wichtigsten gekauften Artikel (z.B. "10x Absperrgitter, Zander Beute").
- category: Weise dem Kauf eine der folgenden Kategorien zu: "Hardware", "Futter", "Bienen", "Imkereibedarf", "Sonstiges".
- price: Der Gesamtbetrag (Total/Endsumme) als Dezimalzahl (z.B. 129.50). Ignoriere Währungssymbole, liefere nur die reine Zahl.

Formatvorgabe (JSON):
{
  "date": "YYYY-MM-DD",
  "description": "Artikelbeschreibung",
  "category": "KategorieName",
  "price": 129.50
}

Wichtig:
- Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt.
- Füge keine Markdown-Formatierung wie \`\`\`json oder sonstigen Text hinzu.
- Verwende exakt die vorgegebenen Kategorienamen (Hardware, Futter, Bienen, Imkereibedarf, Sonstiges) - passe sie wenn nötig an.
- Setze nicht erkennbare Felder auf plausible Werte (z.B. heutigen Tag für Datum, "Unbekannter Beleg" für Beschreibung).`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: file.type
        }
      },
      { text: systemPrompt }
    ]);

    const responseText = result.response.text();
    console.log('Gemini receipt parse raw response:', responseText);
    
    const parsedData = JSON.parse(responseText.trim());
    return parsedData;
  } catch (error) {
    console.error('Error parsing receipt with Gemini:', error);
    throw new Error(`Fehler bei der Beleg-Analyse: ${error.message}`);
  }
}
