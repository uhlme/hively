import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { pickRecordingMimeType } from '../src/voiceAssistant.js';

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
