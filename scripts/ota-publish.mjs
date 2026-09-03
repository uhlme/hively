#!/usr/bin/env node
/**
 * Publish a Capgo OTA ZIP to Netlify Blobs for staging + production.
 *
 * Usage:
 *   node scripts/ota-publish.mjs --version 0.6.12 --zip ./bundle.zip --checksum <sha256>
 *   node scripts/ota-publish.mjs --version 0.6.12 --zip ./bundle.zip --checksum <sha256> --channels staging
 *
 * Env: NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OTA_CHANNELS,
  bundleKeyFor,
  getCiBlobCredentials,
  isOtaChannel,
  isValidOtaVersion,
  writeBundle,
  writeManifest
} from '../server/otaBlobs.js';

function parseArgs(argv) {
  const out = { channels: [...OTA_CHANNELS] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--version') out.version = argv[++i];
    else if (a === '--zip') out.zip = argv[++i];
    else if (a === '--checksum') out.checksum = argv[++i];
    else if (a === '--channels') {
      out.channels = String(argv[++i] || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    } else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/ota-publish.mjs --version 0.6.12 --zip ./file.zip --checksum <sha256> [--channels staging,production]`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!args.version || !args.zip || !args.checksum) {
    usage();
    process.exit(1);
  }
  if (!isValidOtaVersion(args.version)) {
    console.error(`Invalid version: ${args.version}`);
    process.exit(1);
  }

  const channels = args.channels.filter(isOtaChannel);
  if (channels.length === 0) {
    console.error('No valid channels (use staging and/or production)');
    process.exit(1);
  }

  const creds = getCiBlobCredentials();
  if (!creds) {
    console.error('Missing NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN');
    process.exit(1);
  }

  const zipPath = resolve(args.zip);
  const zipBytes = readFileSync(zipPath);
  const checksum = String(args.checksum).replace(/^sha256:/i, '');
  const publishedAt = new Date().toISOString();

  for (const channel of channels) {
    const bundleKey = bundleKeyFor(channel, args.version);
    console.log(`Uploading ${bundleKey} (${zipBytes.length} bytes)…`);
    await writeBundle(bundleKey, zipBytes, creds);
    await writeManifest(
      channel,
      {
        version: args.version,
        checksum,
        bundleKey,
        publishedAt
      },
      creds
    );
    console.log(`Published ${channel} → ${args.version}`);
  }

  console.log(JSON.stringify({ ok: true, version: args.version, channels, checksum }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
