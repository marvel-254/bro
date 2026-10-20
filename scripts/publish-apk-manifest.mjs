#!/usr/bin/env node
/**
 * Publish `apk/latest.json`, a tiny pointer to the current APK builds.
 *
 * Why this exists: the download page links to stable pathnames
 * (`apk/app-arm64-v8a-release.apk`), which are overwritten on every release.
 * Vercel Blob serves objects with a long `max-age` by default, and a browser
 * that already downloaded an old APK will keep using its cached copy. The page
 * reads this manifest with `cache: "no-store"` and appends `?v=<builtAt>` to
 * the download URL, which both discovers the newest build and busts any cache
 * holding old bytes.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=... node scripts/publish-apk-manifest.mjs <arm64Url> [armeabiUrl]
 *
 * The URLs are the ones printed by upload-apk-blob.mjs. Either may be omitted
 * if that ABI was not built.
 */
import { put } from '@vercel/blob';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is not set');
  process.exit(1);
}

/** Only accept absolute http(s) URLs; anything else (e.g. a log line) is a bug. */
function cleanUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const [rawArm64, rawArmeabi] = process.argv.slice(2);
const arm64Url = cleanUrl(rawArm64);
const armeabiUrl = cleanUrl(rawArmeabi);
if (!arm64Url && !armeabiUrl) {
  console.error(`No usable APK URLs: arm64=${rawArm64 ?? ''} armeabi=${rawArmeabi ?? ''}`);
  process.exit(1);
}

const manifest = {
  arm64: arm64Url,
  armeabi: armeabiUrl,
  commit: process.env.GITHUB_SHA ?? null,
  ref: process.env.GITHUB_REF_NAME ?? null,
  builtAt: new Date().toISOString(),
};

try {
  const blob = await put('apk/latest.json', JSON.stringify(manifest, null, 2), {
    access: 'public',
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    // The manifest must be fresh; the page already bypasses caches but this
    // keeps any intermediary from pinning it.
    cacheControlMaxAge: 60,
  });
  console.log(`apk/latest.json -> ${blob.url}`);
} catch (err) {
  console.error(`Manifest upload failed: ${err.message}`);
  process.exit(1);
}
