/**
 * Meme feed for the Pulse card.
 *
 * Source is Imgflip's public `get_memes` endpoint: keyless, stable, and JSON,
 * which matters more than freshness for a card on the home screen. It returns
 * popular meme *templates* (the classic formats, e.g. two-panel Drake), not
 * captioned one-offs -- serving a real captioned feed needs an authenticated
 * provider (Tenor, Imgflip auth, self-hosted), which is a product decision
 * rather than something to fake here.
 *
 * Everything degrades quietly: the card hides itself rather than showing an
 * error, because a meme is not worth a red box on someone's home screen.
 */

export type Meme = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  boxCount: number;
};

const ENDPOINT = "https://api.imgflip.com/get_memes";

/** Cache the catalogue for the session so we do not refetch on every render. */
let catalogue: Meme[] | null = null;
let inFlight: Promise<Meme[]> | null = null;

/** Keep images sane: the endpoint occasionally returns very large templates. */
const MAX_EDGE = 900;

function toMeme(raw: {
  id: string;
  name: string;
  url: string;
  width?: number;
  height?: number;
  box_count?: number;
}): Meme {
  return {
    id: String(raw.id),
    name: String(raw.name),
    url: String(raw.url),
    width: raw.width ?? MAX_EDGE,
    height: raw.height ?? MAX_EDGE,
    boxCount: raw.box_count ?? 0,
  };
}

/** True when the endpoint handed us something we can actually render. */
function isRenderable(meme: Meme): boolean {
  return (
    meme.url.startsWith("https://") &&
    meme.name.length > 0 &&
    meme.width > 0 &&
    meme.height > 0 &&
    meme.width <= 4000 &&
    meme.height <= 4000
  );
}

export async function fetchMemes(): Promise<Meme[]> {
  if (catalogue) return catalogue;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const response = await fetch(ENDPOINT);
    if (!response.ok) {
      throw new Error(`Meme service returned ${response.status}`);
    }
    const payload: unknown = await response.json();
    const rows =
      payload && typeof payload === "object" && "data" in payload
        ? ((payload as { data: { memes?: unknown[] } }).data.memes ?? [])
        : [];

    const memes = rows
      .filter((row): row is Parameters<typeof toMeme>[0] =>
        Boolean(row && typeof row === "object" && "url" in row),
      )
      .map(toMeme)
      .filter(isRenderable);

    catalogue = memes;
    return memes;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/**
 * Pick a meme, avoiding the one already on screen so the shuffle button always
 * visibly changes something.
 */
export function pickMeme(memes: Meme[], currentId?: string): Meme | null {
  if (memes.length === 0) return null;
  if (memes.length === 1) return memes[0];

  const options = memes.filter((meme) => meme.id !== currentId);
  const pool = options.length > 0 ? options : memes;
  return pool[Math.floor(Math.random() * pool.length)];
}
