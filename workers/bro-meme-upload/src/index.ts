/**
 * BRO meme upload endpoint.
 *
 * The app cannot write to R2 itself: R2 rejects unsigned requests, and
 * shipping an R2 credential inside a mobile bundle would hand every user of
 * the app write access to the whole bucket. So the client hands the bytes to
 * this Worker, which holds the binding and does the four things a browser
 * cannot be trusted to do:
 *
 *   1. prove the caller is who they say they are (Supabase JWT, verified
 *      against the project's JWKS — not decoded and hoped for);
 *   2. enforce the per-day quota, because a limit the client checks is not a
 *      limit;
 *   3. check the bytes are actually an image of an allowed type, by sniffing
 *      the magic bytes rather than believing the multipart Content-Type;
 *   4. decide the object key, so the client cannot choose where it writes.
 *
 * The catalogue row is inserted with the service role key. That is the one
 * place this design gives up database-enforced authorship: the Worker is the
 * thing asserting `uploaded_by`, so the RLS insert policy on `memes` is
 * defence-in-depth here rather than the primary control. The alternative (a
 * presigned PUT) keeps that control in the database and costs SigV4 signing.
 */

export interface Env {
  MEMES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_AUDIENCE: string;
  MEME_PUBLIC_BASE: string;
  MAX_UPLOAD_BYTES: string;
  UPLOADS_PER_DAY: string;
}

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---------------------------------------------------------------------------
// authentication
// ---------------------------------------------------------------------------

interface Claims {
  sub?: string;
  aud?: string | string[];
  exp?: number;
}

/**
 * Verify a Supabase access token against the project's JWKS.
 *
 * Signature, expiry and audience are all checked. Decoding the token without
 * verifying the signature would let anyone mint a claim of being any user,
 * which is the entire reason this endpoint exists rather than trusting the
 * client.
 */
async function authenticate(
  request: Request,
  env: Env,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) return { ok: false, status: 401, error: "Missing bearer token" };

  const [header64, payload64, signature64] = token.split(".");
  if (!header64 || !payload64 || !signature64) {
    return { ok: false, status: 401, error: "Malformed token" };
  }

  // Decoding attacker-supplied base64 can throw, and a throw here would turn
  // a garbage token into a 500 instead of a 401. Treat anything unparseable as
  // a bad token rather than letting it escape as an unhandled error.
  const tokenHeader = decodeSegment(header64);
  const claims = decodeSegment<Claims>(payload64);
  if (!tokenHeader || !claims) {
    return { ok: false, status: 401, error: "Malformed token" };
  }
  // Only asymmetric algorithms, and only the two Supabase actually issues.
  // Refusing "none" and HMAC variants is the classic JWT bypass, and this
  // endpoint is the one place a forged token would actually matter.
  //
  // Both are supported because Supabase is not consistent about which it uses:
  // the legacy JWT keys sign RS256 and the newer sb- keys sign ES256. Pinning
  // one breaks the app whenever the project rotates to the other.
  const algorithm = algorithmFor(tokenHeader.alg ?? "");
  if (!algorithm) {
    return { ok: false, status: 401, error: "Unexpected token algorithm" };
  }

  const jwks = await fetchJwks(env);
  if (!jwks) return { ok: false, status: 503, error: "Cannot verify tokens" };

  const jwk = jwks.keys.find((candidate) => candidate.kid === tokenHeader.kid);
  if (!jwk) return { ok: false, status: 401, error: "Unknown signing key" };

  let key: CryptoKey;
  try {
    key = await importPublicKey(jwk, algorithm);
  } catch {
    return { ok: false, status: 401, error: "Unusable signing key" };
  }
  const valid = await verify(algorithm, key, `${header64}.${payload64}`, signature64);
  if (!valid) return { ok: false, status: 401, error: "Bad signature" };

  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    return { ok: false, status: 401, error: "Token expired" };
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.aud && !audiences.includes(env.SUPABASE_JWT_AUDIENCE)) {
    return { ok: false, status: 401, error: "Wrong audience" };
  }
  if (!claims.sub) return { ok: false, status: 401, error: "No subject" };

  return { ok: true, userId: claims.sub };
}

interface Jwk {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
}

/**
 * Import and verify take different shapes for ECDSA: importing needs
 * `namedCurve`, verifying needs `hash`. Passing one where the other is
 * expected fails at runtime, not at compile time, so they are kept separate
 * rather than sharing one object.
 */
const IMPORT_PARAMS = {
  RS256: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  ES256: { name: "ECDSA", namedCurve: "P-256" },
} as const;

const VERIFY_PARAMS = {
  RS256: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  ES256: { name: "ECDSA", hash: "SHA-256" },
} as const;

type AlgorithmName = keyof typeof IMPORT_PARAMS;

/** Allowlist, not a pass-through: the token header must name one of these. */
function algorithmFor(name: string): AlgorithmName | null {
  return name === "RS256" || name === "ES256" ? name : null;
}

function importKeyParams(jwk: Jwk): AlgorithmName {
  if (jwk.kty === "EC") return "ES256";
  if (jwk.kty === "RSA") return "RS256";
  throw new Error(`Unsupported key type ${jwk.kty}`);
}

let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

async function fetchJwks(env: Env): Promise<{ keys: Jwk[] } | null> {
  // Cached briefly. Supabase rotates signing keys rarely, and a miss just
  // costs one extra fetch; caching forever would break the next rotation.
  if (jwksCache && jwksCache.expiresAt > Date.now()) {
    return { keys: jwksCache.keys };
  }
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    if (!response.ok) return null;
    const body = (await response.json()) as { keys?: Jwk[] };
    if (!body.keys?.length) return null;
    jwksCache = { keys: body.keys, expiresAt: Date.now() + 10 * 60 * 1000 };
    return { keys: body.keys };
  } catch {
    return null;
  }
}

function decodeSegment<T = { kid?: string; alg?: string }>(
  segment: string,
): T | null {
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function importPublicKey(jwk: Jwk, algorithm: AlgorithmName): Promise<CryptoKey> {
  const material =
    jwk.kty === "EC"
      ? { kty: jwk.kty, crv: "P-256", x: jwk.x, y: jwk.y }
      : { kty: jwk.kty, n: jwk.n, e: jwk.e };
  return crypto.subtle.importKey(
    "jwk",
    material,
    IMPORT_PARAMS[algorithm],
    false,
    ["verify"],
  );
}

async function verify(
  algorithm: AlgorithmName,
  key: CryptoKey,
  data: string,
  signature: string,
): Promise<boolean> {
  // JWT signatures are raw (r||s for ECDSA, not DER), which is what WebCrypto
  // expects. Node's crypto wants DER, so this would need re-encoding there.
  let signatureBytes: ArrayBuffer;
  try {
    const padded =
      signature.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (signature.length % 4)) % 4);
    const binary = atob(padded);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let index = 0; index < binary.length; index += 1) {
      view[index] = binary.charCodeAt(index);
    }
    signatureBytes = buffer;
  } catch {
    return false;
  }

  const payload = new TextEncoder().encode(data);
  try {
    // JWT ECDSA signatures are raw (r||s), which is what WebCrypto expects.
    if (
      await crypto.subtle.verify(
        VERIFY_PARAMS[algorithm],
        key,
        signatureBytes,
        payload,
      )
    ) {
      return true;
    }
  } catch {
    // fall through to the DER attempt below
  }

  if (algorithm !== "ES256") return false;

  // WebCrypto specifies raw (r||s) for ECDSA, but Workers has shipped both
  // behaviours across runtimes. Try the DER form too rather than failing every
  // upload on whichever runtime happens to disagree with the spec.
  const der = rawEcdsaToDer(new Uint8Array(signatureBytes));
  if (!der) return false;
  try {
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      der,
      payload,
    );
  } catch {
    return false;
  }
}

/** Wrap a raw 64-byte (r||s) ECDSA signature in the DER envelope Node wants. */
function rawEcdsaToDer(raw: Uint8Array): ArrayBuffer | null {
  if (raw.length !== 64) return null;
  const encodeInteger = (value: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start += 1;
    const trimmed = value.slice(start);
    // A leading high bit would be read as a negative number without the 0x00.
    const needsPad = trimmed[0] & 0x80;
    const out = new Uint8Array(trimmed.length + (needsPad ? 1 : 0));
    if (needsPad) out[0] = 0;
    out.set(trimmed, needsPad ? 1 : 0);
    return out;
  };
  const body = new Uint8Array(6 + 64 + 2);
  body[0] = 0x30;
  body[1] = 0x44; // 2 + (2 + 32) * 2
  body[2] = 0x02;
  body[3] = 0x20;
  body.set(raw.subarray(0, 32), 4);
  body[36] = 0x02;
  body[37] = 0x20;
  body.set(raw.subarray(32, 64), 38);
  return body.buffer;
}

// ---------------------------------------------------------------------------
// content sniffing
// ---------------------------------------------------------------------------

/**
 * Identify an image from its magic bytes.
 *
 * The client-declared Content-Type is checked first as a cheap reject, but
 * never trusted on its own: it is attacker-controlled and a worker that
 * trusts it will happily store a `.png` that is an HTML file, which is how a
 * bucket ends up serving stored XSS off your own domain.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  const startsWith = (...magic: number[]) =>
    magic.every((byte, index) => bytes[index] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// ---------------------------------------------------------------------------
// catalogue + quota
// ---------------------------------------------------------------------------

async function countTodayUploads(env: Env, userId: string): Promise<number> {
  // Derived from the table itself rather than a counter, so the quota cannot
  // drift out of step with reality — no counter to reset, increment wrongly,
  // or lose when a row is deleted.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/memes?select=id&uploaded_by=eq.${encodeURIComponent(userId)}&created_at=gte.${since.toISOString()}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    },
  );

  if (!response.ok) return 0;
  const range = response.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function insertCatalogueRow(
  env: Env,
  row: {
    storagePath: string;
    title: string;
    tags: string;
    width: number;
    height: number;
    sizeBytes: number;
    userId: string;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/memes`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      storage_path: row.storagePath,
      title: row.title,
      tags: row.tags,
      width: row.width,
      height: row.height,
      size_bytes: row.sizeBytes,
      uploaded_by: row.userId,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, error: detail.slice(0, 300) };
  }
  const body = (await response.json()) as Array<{ id: string }>;
  return { ok: true, id: body[0]?.id ?? "" };
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: "Use POST" }, 405);
    }

    const auth = await authenticate(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const limit = Number(env.UPLOADS_PER_DAY ?? "30");
    const used = await countTodayUploads(env, auth.userId);
    if (used >= limit) {
      return json(
        {
          error: `You have used your ${limit} uploads for today. Try again tomorrow.`,
          limit,
          used,
        },
        429,
      );
    }

    const maxBytes = Number(env.MAX_UPLOAD_BYTES ?? "5242880");
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      return json({ error: `That image is over ${maxBytes} bytes` }, 413);
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await request.arrayBuffer());
    } catch {
      return json({ error: "Could not read the upload" }, 400);
    }
    if (bytes.byteLength === 0) {
      return json({ error: "Empty upload" }, 400);
    }
    if (bytes.byteLength > maxBytes) {
      return json({ error: `That image is over ${maxBytes} bytes` }, 413);
    }

    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      return json({ error: "That is not a PNG, JPEG, WEBP or GIF" }, 415);
    }
    const declaredType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
    if (declaredType && ALLOWED.has(declaredType) && declaredType !== sniffed) {
      // Mismatch is worth rejecting rather than trusting either side.
      return json({ error: "That file's contents do not match its type" }, 415);
    }

    const extension = ALLOWED.get(sniffed) ?? "bin";
    const key = `memes/${crypto.randomUUID()}.${extension}`;

    await env.MEMES.put(key, bytes, {
      httpMetadata: { contentType: sniffed },
    });

    const title = (request.headers.get("x-meme-title") ?? "").slice(0, 140);
    const row = await insertCatalogueRow(env, {
      storagePath: key,
      title,
      tags: title
        .toLowerCase()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .join(" ")
        .slice(0, 200),
      // The database CHECKs these, and the client is not the only writer, so
      // they are sent as safe defaults the catalogue does not depend on.
      width: 1,
      height: 1,
      sizeBytes: bytes.byteLength,
      userId: auth.userId,
    });

    if (!row.ok) {
      // The object is already in the bucket. Removing it keeps the catalogue
      // and the bucket consistent; an orphan object is invisible but it is
      // still someone else's storage.
      await env.MEMES.delete(key);
      return json({ error: "Could not catalogue that upload" }, 500);
    }

    return json(
      {
        ok: true,
        id: row.id,
        storagePath: key,
        url: `${env.MEME_PUBLIC_BASE.replace(/\/$/, "")}/${key}`,
        uploadsToday: used + 1,
        limit,
      },
      201,
    );
  },
};
