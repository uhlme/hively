import { callGemini } from './geminiApi.js';
import { blobToBase64 } from './utils.js';

let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;

function pickRecordingMimeType() {
  if (!MediaRecorder.isTypeSupported) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac';
  return '';
}

export async function startAudioRecording({ onError, onStatusChange }) {
  try {
    audioChunks = [];
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = pickRecordingMimeType();
    mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstart = () => onStatusChange('listening');

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
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
  mediaRecorder = null;
}

export async function parseAudioWithGemini(audioBlob) {
  if (!audioBlob) throw new Error('Keine Audiodatei vorhanden.');

  try {
    return await callGemini(
      'parse_audio',
      {
        data: await blobToBase64(audioBlob),
        mimeType: audioBlob.type || 'audio/webm'
      },
      90000
    );
  } catch (error) {
    console.error('Error parsing audio with Gemini:', error);
    throw new Error(`Fehler bei der KI-Analyse: ${error.message}`);
  }
}
