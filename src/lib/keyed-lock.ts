/**
 * Serialises async work per key.
 *
 * The outbox can attempt the same queued message twice: the automatic flush
 * retries on mount, and the user can tap the failed bubble while that flush is
 * still in flight. Idempotency keys stop the database from inserting two
 * messages, but two concurrent uploads still race the attachment link and can
 * leave duplicate media rows. Serialising by client id makes the second attempt
 * observe the first one's result and dedupe cleanly.
 */
export function createKeyedLock(): <T>(
  key: string,
  run: () => Promise<T>,
) => Promise<T> {
  const tails = new Map<string, Promise<void>>();

  return async function withKey<T>(
    key: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    tails.set(key, current);

    await previous;
    try {
      return await run();
    } finally {
      release();
      if (tails.get(key) === current) {
        tails.delete(key);
      }
    }
  };
}
