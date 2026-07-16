import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseGeminiJson } from './utils.js';

let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let isRecording = false;

export async function startAudioRecording({ onError, onStatusChange }) {
  try {
    audioChunks = [];
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Choose supported MIME type
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = 'audio/aac';
      } else {
        mimeType = ''; // fallback to default browser format
      }
    }

    const options = mimeType ? { mimeType } : {};
    mediaRecorder = new MediaRecorder(audioStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstart = () => {
      isRecording = true;
      onStatusChange('listening');
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      onError('Fehler bei der Audioaufnahme: ' + event.error);
      cleanup();
      onStatusChange('idle');
    };

    mediaRecorder.start();
  } catch (err) {
    console.error('getUserMedia error:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      onError('Mikrofon-Zugriff wurde verweigert. Bitte erlauben Sie den Mikrofon-Zugriff.');
    } else {
      onError('Mikrofon konnte nicht gestartet werden: ' + err.message);
    }
    onStatusChange('idle');
  }
}

export function stopAudioRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      cleanup();
      resolve(audioBlob);
    };

    mediaRecorder.stop();
  });
}

function cleanup() {
  isRecording = false;
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  mediaRecorder = null;
}

// Convert Blob to Base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Send Audio to Gemini API
export async function parseAudioWithGemini(audioBlob) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API-Schlüssel fehlt. Bitte tragen Sie diesen in der .env Datei ein.');
  }

  const base64Audio = await blobToBase64(audioBlob);
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Using gemini-2.5-flash which is multimodal and handles audio + dialect perfectly
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Du bist eine KI zur Analyse von gesprochenen Imker-Protokollen bei einer Durchsicht von Bienenvölkern.
Höre dir die beigefügte Audiodatei genau an. Sie ist auf Schweizerdeutsch (Mundart) gesprochen.
Verstehe den Dialekt, übersetze ihn gedanklich ins Hochdeutsche und extrahiere die relevanten Daten.
Liefere ein strukturiertes JSON-Objekt zurück.

Formatvorgabe (JSON):
{
  "hiveNames": ["Array von erkannten Kasten-Namen, z.B. ['Kasten 1', 'Kasten 2']. Falls der Benutzer explizit 'alle' oder 'bei allen' sagt, liefere ['alle'] zurück. Leeres Array [], wenn keine genannt wurden."],
  "notes": "Eine übersichtliche, strukturierte Zusammenfassung der gesamten Durchsicht auf Hochdeutsch. Fasse alle beobachteten Details wie Brutstatus, Honigraum, Sanftmut, Fütterung, Varroabehandlung und sonstige Arbeiten in lesbaren, strukturierten Notizen zusammen."
}

Wichtig:
- Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt.
- Füge keine Markdown-Formatierung wie \`\`\`json oder sonstigen Text hinzu.
- Setze nicht erwähnte Felder auf ein leeres Array oder null.`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Audio,
          mimeType: audioBlob.type
        }
      },
      { text: systemPrompt }
    ]);

    const responseText = result.response.text();
    const parsedData = parseGeminiJson(responseText);

    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('Ungültiges Antwortformat der KI');
    }

    return {
      hiveNames: Array.isArray(parsedData.hiveNames) ? parsedData.hiveNames.map(String) : [],
      notes: typeof parsedData.notes === 'string' ? parsedData.notes : ''
    };
  } catch (error) {
    console.error('Error parsing audio with Gemini:', error);
    throw new Error(`Fehler bei der KI-Analyse: ${error.message}`);
  }
}
