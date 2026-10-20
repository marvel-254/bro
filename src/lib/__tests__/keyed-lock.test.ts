import { createKeyedLock } from "../keyed-lock";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createKeyedLock", () => {
  it("runs the same key one at a time, in call order", async () => {
    const withKey = createKeyedLock();
    const firstGate = deferred();
    const order: string[] = [];

    const first = withKey("a", async () => {
      order.push("first:start");
      await firstGate.promise;
      order.push("first:end");
    });
    const second = withKey("a", async () => {
      order.push("second");
    });

    // The second must not start while the first is running.
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    firstGate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("does not block unrelated keys", async () => {
    const withKey = createKeyedLock();
    const gate = deferred();
    const order: string[] = [];

    const slow = withKey("a", async () => {
      order.push("a:start");
      await gate.promise;
      order.push("a:end");
    });
    await withKey("b", async () => {
      order.push("b");
    });

    expect(order).toEqual(["a:start", "b"]);
    gate.resolve();
    await slow;
    expect(order).toEqual(["a:start", "b", "a:end"]);
  });

  it("releases the key after a failure", async () => {
    const withKey = createKeyedLock();

    await expect(
      withKey("a", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(withKey("a", async () => "ok")).resolves.toBe("ok");
  });
});
