/**
 * Capgo live updates — native only.
 * Web/PWA keeps using the Service Worker; Capacitor ships assets in the binary
 * and pulls JS/CSS/HTML OTA bundles via @capgo/capacitor-updater.
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { trackEvent } from './analytics.js';

const OTA_CHANNELS = new Set(['staging', 'production']);

/** @returns {'staging' | 'production'} */
export function getOtaChannel() {
  const raw = String(import.meta.env.VITE_OTA_CHANNEL || 'production').trim();
  return OTA_CHANNELS.has(raw) ? raw : 'production';
}

/**
 * Call once after the app UI is ready. Prevents Capgo from rolling back the
 * newly applied bundle when notifyAppReady() is never reached.
 */
export async function initOtaUpdates() {
  if (!Capacitor.isNativePlatform()) return;

  const channel = getOtaChannel();
  const started = performance.now();

  try {
    // Align Capgo's defaultChannel with the channel baked into this native build
    // (TestFlight/Play Internal → staging, production store → production).
    try {
      await CapacitorUpdater.setChannel({ channel, triggerAutoUpdate: false });
    } catch (err) {
      // Self-hosted backends may reject channel_self; defaultChannel in
      // capacitor.config.json still goes out on update POSTs.
      console.warn('[ota] setChannel skipped:', err?.message || err);
    }

    await CapacitorUpdater.notifyAppReady();
    trackEvent('ota_update_check', {
      channel,
      ok: true,
      duration_ms: Math.round(performance.now() - started)
    });
  } catch (err) {
    console.error('[ota] notifyAppReady failed:', err);
    trackEvent('ota_update_failed', {
      channel,
      stage: 'notifyAppReady',
      message: String(err?.message || err).slice(0, 200),
      duration_ms: Math.round(performance.now() - started)
    });
  }

  try {
    CapacitorUpdater.addListener('updateAvailable', (info) => {
      trackEvent('ota_update_applied', {
        channel,
        to_version: info?.bundle?.version || info?.version || '',
        from_cache: false
      });
    });
    CapacitorUpdater.addListener('downloadFailed', (info) => {
      trackEvent('ota_update_failed', {
        channel,
        stage: 'download',
        message: String(info?.version || info?.error || 'downloadFailed').slice(0, 200)
      });
    });
    CapacitorUpdater.addListener('updateFailed', (info) => {
      trackEvent('ota_update_failed', {
        channel,
        stage: 'apply',
        message: String(info?.bundle?.version || info?.error || 'updateFailed').slice(0, 200)
      });
    });
  } catch (err) {
    console.warn('[ota] listeners skipped:', err?.message || err);
  }
}
