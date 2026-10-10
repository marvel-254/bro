/**
 * Read an image's intrinsic dimensions from its bytes.
 *
 * No dependency on purpose: this is ~50 lines for the two formats we accept,
 * and adding an image library to a repo that is otherwise dependency-light is
 * a worse trade than a small parser.
 *
 * This exists because imgflip reports the size of a template's *text boxes*,
 * not the size of the image. Storing those gave every seeded meme the wrong
 * aspect ratio, which rendered as black bars above and below the picture.
 */

function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers carry no length.
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    // SOF0..SOF15, excluding the DHT/DAC/DNL markers that share the range.
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => bytes[index] === byte)) return null;
  // IHDR is always the first chunk: 4 length + 4 type + 4 width + 4 height.
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function gifSize(bytes) {
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return null;
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function webpSize(bytes) {
  const isRiff = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF";
  const isWebp = String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isRiff || !isWebp) return null;

  const format = String.fromCharCode(...bytes.slice(12, 16));
  if (format === "VP8X") {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  }
  if (format === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Intrinsic size, or null when the bytes are not a format we can read. */
export function imageSize(bytes) {
  const view = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  for (const reader of [pngSize, jpegSize, gifSize, webpSize]) {
    try {
      const size = reader(view);
      if (size && size.width > 0 && size.height > 0) return size;
    } catch {
      // Malformed enough that this reader cannot make sense of it; try the next.
    }
  }
  return null;
}
