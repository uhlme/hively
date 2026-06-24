import { GoogleGenerativeAI } from '@google/generative-ai';

let recognition = null;
let isRecording = false;

// Initialize speech recognition
function getSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech Recognition API not supported in this browser.');
    return null;
  }
  return new SpeechRecognition();
}

export function startSpeechRecognition({ onResult, onError, onStatusChange }) {
  if (isRecording && recognition) {
    recognition.stop();
    return;
  }

  recognition = getSpeechRecognition();
  if (!recognition) {
    onError('Spracherkennung wird von diesem Browser nicht unterstützt. Bitte verwenden Sie Chrome, Safari oder Edge.');
    return;
  }

  recognition.lang = 'de-CH';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = false; // Stop when the user stops speaking

  recognition.onstart = () => {
    isRecording = true;
    onStatusChange('listening');
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    isRecording = false;
    onStatusChange('idle');
    if (event.error === 'not-allowed') {
      onError('Mikrofon-Zugriff wurde verweigert. Bitte erlauben Sie den Mikrofon-Zugriff.');
    } else {
      onError(`Fehler bei der Spracherkennung: ${event.error}`);
    }
  };

  recognition.onend = () => {
    isRecording = false;
    onStatusChange('processing');
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const transcript = finalTranscript || interimTranscript;
    onResult(transcript, event.results[0] && event.results[0].isFinal);
  };

  recognition.start();
}

export function stopSpeechRecognition() {
  if (recognition && isRecording) {
    recognition.stop();
  }
}

// Call Gemini API to extract structured fields from the transcription text
export async function parseInspectionWithGemini(transcriptionText) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API-Schlüssel fehlt. Bitte tragen Sie diesen in der .env Datei ein.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Using gemini-2.5-flash which is extremely fast and perfect for structured JSON extraction
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Du bist eine KI zur Analyse von gesprochenen Imker-Protokollen bei einer Durchsicht eines Bienenvolks.
Extrahiere die relevanten Daten aus dem folgenden Protokoll-Text und liefere ein strukturiertes JSON-Objekt zurück.

Formatvorgabe (JSON):
{
  "hiveName": "Erkannter Name des Volks oder Kastens (z.B. 'Kasten 1', 'Apfelwiese' oder null wenn nicht genannt)",
  "temperament": 5, // Ganzzahl von 1 bis 5 (1 = sehr wild/aggressiv, 3 = normal/mäßig, 5 = sehr sanft). Falls nicht genannt, verwende null.
  "broodStatus": "Zusammenfassung des Brutstatus (z.B. 'Stifte vorhanden', 'Brut in allen Stadien', 'Keine Königin gefunden' oder null)",
  "honeySuper": "Zustand oder Anzahl des Honigraums (z.B. '1 Honigraum aufgesetzt', 'Honigraum fast voll' oder null)",
  "feeding": "Fütterungs-Details (z.B. 'Zuckerwasser 1:1', '2 Liter Sirup', 'Nein' oder null)",
  "varroa": "Varroabehandlung (z.B. 'Ameisensäure', 'Oxalsäure', 'Nein' oder null)",
  "notes": "Zusammenfassung der restlichen Arbeiten, Besonderheiten oder Beobachtungen (z.B. 'Wabenbau geordnet', 'Königin gezeichnet' oder null)"
}

Wichtig:
- Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt.
- Füge keine Markdown-Formatierung wie \`\`\`json oder sonstigen Text hinzu.
- Setze nicht erwähnte Felder auf null.`;

  try {
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nProtokoll-Text:\n"${transcriptionText}"` }] }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = result.response.text();
    console.log('Gemini raw response:', responseText);
    
    // Parse response as JSON
    const parsedData = JSON.parse(responseText.trim());
    return parsedData;
  } catch (error) {
    console.error('Error parsing transcription with Gemini:', error);
    throw new Error(`Fehler bei der KI-Analyse: ${error.message}`);
  }
}
