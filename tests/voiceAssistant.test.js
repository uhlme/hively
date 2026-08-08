import { describe, expect, it, vi, afterEach } from 'vitest';
import { pickRecordingMimeType, startAudioRecording } from '../src/voiceAssistant.js';

describe('pickRecordingMimeType', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers audio/mp4 over webm when both are supported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type) =>
        type === 'audio/mp4' || type === 'audio/webm' || type === 'audio/aac'
    });
    expect(pickRecordingMimeType()).toBe('audio/mp4');
  });

  it('falls back to webm when mp4/aac are unsupported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type) => type === 'audio/webm'
    });
    expect(pickRecordingMimeType()).toBe('audio/webm');
  });

  it('defaults to audio/mp4 when MediaRecorder API is missing', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(pickRecordingMimeType()).toBe('audio/mp4');
  });
});

describe('startAudioRecording cleanup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops media tracks when MediaRecorder construction fails', async () => {
    const stop = vi.fn();
    const track = { stop };
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [track]
        }))
      }
    });
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported() {
          return true;
        }
        constructor() {
          throw new Error('unsupported mime');
        }
      }
    );

    const onError = vi.fn();
    const onStatusChange = vi.fn();
    await startAudioRecording({ onError, onStatusChange });

    expect(stop).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith('idle');
  });
});
