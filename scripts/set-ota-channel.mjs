#!/usr/bin/env node
/**
 * Patch capacitor.config.json defaultChannel from VITE_OTA_CHANNEL (or argv).
 * Used by iOS/Android CI before `npx cap sync`.
 *
 * Usage: node scripts/set-ota-channel.mjs [staging|production]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ALLOWED = new Set(['staging', 'production']);
const channel = String(process.argv[2] || process.env.VITE_OTA_CHANNEL || 'production').trim();

if (!ALLOWED.has(channel)) {
  console.error(`Invalid OTA channel: ${channel}`);
  process.exit(1);
}

const path = resolve('capacitor.config.json');
const config = JSON.parse(readFileSync(path, 'utf8'));
config.plugins = config.plugins || {};
config.plugins.CapacitorUpdater = {
  ...(config.plugins.CapacitorUpdater || {}),
  defaultChannel: channel
};
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
console.log(`CapacitorUpdater.defaultChannel = ${channel}`);
