import { callGemini } from './geminiApi.js';

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
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }
  mediaRecorder = null;
}

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

export async function parseAudioWithGemini(audioBlob) {
  if (!audioBlob) {
    throw new Error('Keine Audiodatei vorhanden.');
  }

  const base64Audio = await blobToBase64(audioBlob);

  try {
    return await callGemini(
      'parse_audio',
      {
        data: base64Audio,
        mimeType: audioBlob.type || 'audio/webm'
      },
      90000
    );
  } catch (error) {
    console.error('Error parsing audio with Gemini:', error);
    throw new Error(`Fehler bei der KI-Analyse: ${error.message}`);
  }
}
