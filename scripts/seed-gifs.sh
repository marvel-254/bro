#!/usr/bin/env bash
# Curate GIFs into the self-hosted library.
#
# The picker reads from `gif_library` plus the public `gifs` bucket, and the
# app has no write policy on either by design. This script is the curation
# path: it runs with the service role key, which never ships in the app.
#
# Usage:
#   ./scripts/seed-gifs.sh ./my-gifs
#
# Every GIF in the directory is uploaded and catalogued. `title` comes from the
# filename and `tags` from a sibling `tags.txt` if you want to curate them.

set -euo pipefail

DIR="${1:-}"
if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
  echo "usage: $0 <directory-of-gifs>" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "error: .env not found (need SUPABASE_SECRET_KEY and EXPO_PUBLIC_SUPABASE_URL)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY is not set}"
: "${EXPO_PUBLIC_SUPABASE_URL:?EXPO_PUBLIC_SUPABASE_URL is not set}"

node - "$DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const dir = process.argv[2];
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const BUCKET = "gifs";

/** Tag file: one "name<TAB>tags" pair per line, keyed by filename. */
function readTags() {
  const file = path.join(dir, "tags.txt");
  if (!fs.existsSync(file)) return new Map();
  const map = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [name, ...rest] = trimmed.split(/\t|\s{2,}/);
    if (name && rest.length) map.set(name.trim(), rest.join(" ").trim().toLowerCase());
  }
  return map;
}

/** Title from the filename, minus extension and any numeric prefix. */
function titleFrom(file) {
  return path
    .basename(file, path.extname(file))
    .replace(/^\d+[-_ ]*/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/**
 * GIF dimensions live in the header, not the filename. We read the logical
 * screen descriptor rather than trusting the byte size to be close.
 */
function gifSize(buf) {
  if (buf.length < 10) return { width: 0, height: 0 };
  if (buf.toString("latin1", 0, 3) !== "GIF") return { width: 0, height: 0 };
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

(async () => {
  const tags = readTags();
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".gif"))
    .sort();

  if (files.length === 0) {
    console.error(`no .gif files found in ${dir}`);
    process.exit(1);
  }

  let uploaded = 0;
  let failed = 0;

  for (const name of files) {
    const bytes = fs.readFileSync(path.join(dir, name));
    const { width, height } = gifSize(bytes);
    // Slug keeps the catalogue tidy and the storage_path safe by construction.
    const slug = name
      .toLowerCase()
      .replace(/\.gif$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) continue;
    const storagePath = `${slug}.gif`;
    const title = titleFrom(name);
    const tagText = tags.get(name) ?? title.toLowerCase();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: "image/gif", upsert: true });

    if (uploadError) {
      console.error(`  upload failed ${name}: ${uploadError.message}`);
      failed += 1;
      continue;
    }

    const { error: rowError } = await supabase
      .from("gif_library")
      .upsert(
        {
          storage_path: storagePath,
          title,
          tags: tagText,
          width,
          height,
          size_bytes: bytes.length,
          is_listed: true,
        },
        { onConflict: "storage_path" },
      );

    if (rowError) {
      console.error(`  catalogue failed ${name}: ${rowError.message}`);
      failed += 1;
      continue;
    }

    uploaded += 1;
    console.log(`  ok ${storagePath} (${width}x${height}, ${bytes.length}b)`);
  }

  console.log(`\ncatalogued ${uploaded}, failed ${failed}`);
  process.exit(failed > 0 && uploaded === 0 ? 1 : 0);
})();
NODE
