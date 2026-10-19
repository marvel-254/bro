#!/usr/bin/env node
/**
 * Upload the built APK to Vercel Blob under a STABLE pathname so the website
 * can link to one permanent URL that always serves the latest build.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=... node scripts/upload-apk-blob.mjs [apkPath] [pathname]
 *
 * `pathname` defaults to `apk/<basename>`. Pass it to publish the same build
 * under a stable alias the site links to (e.g. `apk/app-release.apk`).
 *
 * Prints the public URL to stdout and sets APK_PUBLIC_URL in GitHub Actions.
 */
import { put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is not set');
  process.exit(1);
}

const apkPath =
  process.argv[2] ?? 'android/app/build/outputs/apk/release/app-release.apk';

let body;
try {
  body = await readFile(apkPath);
} catch {
  console.error(`APK not found at ${apkPath}`);
  process.exit(1);
}

const pathname = process.argv[3] ?? `apk/${path.basename(apkPath)}`;

try {
  const blob = await put(pathname, body, {
    access: 'public',
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/vnd.android.package-archive',
  });
  console.log(`${pathname} -> ${blob.url}`);
  if (process.env.GITHUB_ENV) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_ENV, `APK_PUBLIC_URL=${blob.url}\n`);
  }
} catch (err) {
  console.error(`Upload failed: ${err.message}`);
  process.exit(1);
}
