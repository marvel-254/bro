#!/usr/bin/env node
// Backfill real image dimensions on the meme catalogue.
//
// The seed script stored imgflip's declared width/height, which are the size of
// a template's *text boxes* rather than of the image. Every seeded meme then
// rendered at the wrong aspect ratio, showing black bars above and below the
// picture. This re-measures every row from the bytes already in R2, so nothing
// is re-uploaded.
//
// Usage:
//   ./scripts/backfill-meme-dimensions.mjs
//
// Idempotent: rows already correct are left alone and not written.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { imageSize } from "./image-size.mjs";

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    console.error("error: .env not found");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    if (process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publicBase = (process.env.EXPO_PUBLIC_R2_MEDIA_URL ?? "").replace(/\/$/, "");

if (!supabaseUrl || !secretKey || !publicBase) {
  console.error(
    "error: need SUPABASE_SECRET_KEY, EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_R2_MEDIA_URL",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("memes")
  .select("id, storage_path, width, height")
  .order("created_at", { ascending: true });

if (error || !data) {
  console.error(`error: could not read the catalogue (${error?.message})`);
  process.exit(1);
}

let fixed = 0;
let alreadyCorrect = 0;
let unreadable = 0;

for (const row of data) {
  let bytes;
  try {
    const response = await fetch(`${publicBase}/${row.storage_path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    unreadable += 1;
    console.log(`  skip ${row.storage_path}: ${err.message}`);
    continue;
  }

  const measured = imageSize(bytes);
  if (!measured) {
    unreadable += 1;
    console.log(`  skip ${row.storage_path}: unrecognised format`);
    continue;
  }

  if (measured.width === row.width && measured.height === row.height) {
    alreadyCorrect += 1;
    continue;
  }

  const { error: updateError } = await supabase
    .from("memes")
    .update({ width: measured.width, height: measured.height })
    .eq("id", row.id);

  if (updateError) {
    console.log(`  skip ${row.storage_path}: ${updateError.message}`);
    continue;
  }
  fixed += 1;
  console.log(
    `  ${row.storage_path}: ${row.width}x${row.height} -> ${measured.width}x${measured.height}`,
  );
}

console.log(
  `\ndone. corrected ${fixed}, already correct ${alreadyCorrect}, skipped ${unreadable}`,
);
