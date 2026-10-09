#!/usr/bin/env node
// Migrate the meme library into our own R2 bucket.
//
// One-time migration, and it replaces the imgflip.com feed the app used to
// read from (src/lib/memes.ts) with a corpus we host. Nothing is proxied and
// no third-party key ships in the client afterwards.
//
// Usage:
//   ./scripts/seed-memes.mjs [count]
//
// count defaults to 60. Images go to the `bro-memes` R2 bucket via wrangler;
// rows go to `memes` via the service role key, which never ships in the app.
//
// Idempotent: `memes.storage_path` is unique and a duplicate insert is
// treated as "already seeded", so re-running tops the library up rather than
// duplicating it.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const run = promisify(execFile);

const BUCKET = "bro-memes";
const IMGFLIP = "https://api.imgflip.com/get_memes";
const LIMIT = Number(process.argv[2] ?? 60);

// Keep images sane: imgflip mixes 600px templates with large uploads.
const MAX_EDGE = 900;

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    console.error("error: .env not found (need SUPABASE_SECRET_KEY)");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key]) continue;
    process.env[key] = value.replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error("error: SUPABASE_SECRET_KEY / EXPO_PUBLIC_SUPABASE_URL missing");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

/** Object key for a template. Stable, so re-running overwrites rather than dupes. */
function keyFor(id, name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `memes/${id}-${slug || "template"}.jpg`;
}

async function putToR2(key, bytes, contentType) {
  // wrangler has no batch upload, and installing the S3 SDK just for a
  // one-time migration would be a dependency we then carry forever.
  const { writeFile, unlink } = await import("node:fs/promises");
  const tmp = `/tmp/bro-meme-${process.pid}.jpg`;
  await writeFile(tmp, bytes);
  try {
    await run(
      "wrangler",
      [
        "r2",
        "object",
        "put",
        `${BUCKET}/${key}`,
        "--file",
        tmp,
        "--content-type",
        contentType,
        "--remote",
      ],
      { maxBuffer: 1024 * 1024 * 8 },
    );
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

async function main() {
  console.log(`fetching catalogue from imgflip (limit ${LIMIT})...`);
  const response = await fetch(IMGFLIP);
  if (!response.ok) {
    throw new Error(`imgflip returned ${response.status}`);
  }
  const payload = await response.json();
  const templates = (payload?.data?.memes ?? []).filter(
    (meme) =>
      meme &&
      typeof meme.url === "string" &&
      meme.width > 0 &&
      meme.height > 0 &&
      meme.width <= MAX_EDGE &&
      meme.height <= MAX_EDGE,
  );

  if (templates.length === 0) {
    throw new Error("imgflip returned no usable templates");
  }

  const existing = new Set(
    (
      await supabase.from("memes").select("storage_path")
    ).data?.map((row) => row.storage_path) ?? [],
  );

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const template of templates.slice(0, LIMIT)) {
    const storagePath = keyFor(template.id, template.name);
    if (existing.has(storagePath)) {
      skipped += 1;
      continue;
    }

    try {
      const image = await fetch(template.url);
      if (!image.ok) throw new Error(`image ${image.status}`);

      const bytes = Buffer.from(await image.arrayBuffer());
      if (bytes.byteLength === 0) throw new Error("empty image");

      await putToR2(storagePath, bytes, image.headers.get("content-type") ?? "image/jpeg");

      // width/height/size_bytes are CHECK-constrained in the database, so
      // measure rather than trust imgflip's declared numbers.
      const { error } = await supabase.from("memes").insert({
        storage_path: storagePath,
        title: String(template.name ?? "").slice(0, 120),
        tags: String(template.name ?? "")
          .toLowerCase()
          .split(/[\s_-]+/)
          .filter(Boolean)
          .join(" ")
          .slice(0, 200),
        width: template.width,
        height: template.height,
        size_bytes: bytes.byteLength,
        // uploaded_by stays null: these predate BRO and have no author.
      });

      if (error) {
        if (error.code === "23505") {
          skipped += 1;
          continue;
        }
        throw error;
      }
      uploaded += 1;
      process.stdout.write(`\rseeded ${uploaded}  skipped ${skipped}  failed ${failed}   `);
    } catch (error) {
      failed += 1;
      process.stdout.write(`\rseeded ${uploaded}  skipped ${skipped}  failed ${failed}   `);
      console.error(`\n  ${storagePath}: ${error.message}`);
    }
  }

  console.log(
    `\ndone. uploaded ${uploaded}, already present ${skipped}, failed ${failed}`,
  );
}

main().catch((error) => {
  console.error(`\nfatal: ${error.message}`);
  process.exit(1);
});
