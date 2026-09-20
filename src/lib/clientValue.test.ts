import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStored,
  storeSnapshot,
  subscribeTo,
  writeStored,
} from "./clientValue";

/**
 * The store under the browser-only hooks.
 *
 * Tested as a store rather than through a renderer. The panel has no
 * DOM-rendering test setup, and adding one for a hook whose whole logic is
 * these three functions would be a dependency to carry forever — so the hooks
 * are kept to `useSyncExternalStore(subscribe, snapshot, () => serverValue)`
 * and everything worth being wrong about lives here.
 *
 * What actually matters, and is what these check:
 *
 *   - the snapshot is **stable** while nothing writes. `useSyncExternalStore`
 *     compares by identity and re-reads on every render, so a parse that
 *     allocated per call would re-render forever;
 *   - a write in **this** tab updates this tab. The browser fires `storage`
 *     everywhere except the window that wrote, which is the one an operator is
 *     looking at;
 *   - storage that **throws** leaves a working panel. A locked-down profile
 *     throws on `getItem`, not only on `setItem`.
 */

let store: Record<string, string>;
let handlers: Array<(event: StorageEvent) => void>;

function install({ throws = false } = {}) {
  store = {};
  handlers = [];
  const localStorage = {
    getItem: (k: string) => {
      if (throws) throw new Error("denied");
      return k in store ? (store[k] as string) : null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error("denied");
      store[k] = v;
    },
  };
  vi.stubGlobal("window", {
    localStorage,
    addEventListener: (_: string, h: (e: StorageEvent) => void) =>
      handlers.push(h),
    removeEventListener: (_: string, h: (e: StorageEvent) => void) => {
      handlers = handlers.filter((x) => x !== h);
    },
  });
}

/** What the browser does in the *other* tabs when a key changes. */
function otherTabWrote(key: string, value: string | null) {
  if (value === null) delete store[key];
  else store[key] = value;
  for (const h of [...handlers]) h({ key } as StorageEvent);
}

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

/** A parse that allocates, which is the case a naive snapshot breaks on. */
const asList = (stored: string | null): string[] =>
  stored ? stored.split(",") : [];

describe("the snapshot does not change under a render", () => {
  it("returns the identical value while nothing writes", () => {
    writeStored("groups", "a,b");
    const first = storeSnapshot("groups", asList);
    expect(first).toEqual(["a", "b"]);
    // Identity, not equality. This is the whole reason the cache exists.
    expect(storeSnapshot("groups", asList)).toBe(first);
    expect(storeSnapshot("groups", asList)).toBe(first);
  });

  it("returns a new value once something writes", () => {
    writeStored("groups", "a");
    const first = storeSnapshot("groups", asList);
    writeStored("groups", "a,b");
    expect(storeSnapshot("groups", asList)).not.toBe(first);
    expect(storeSnapshot("groups", asList)).toEqual(["a", "b"]);
  });
});

describe("a write reaches the tab that made it", () => {
  it("notifies local listeners", () => {
    const seen = vi.fn();
    subscribeTo("view")(seen);
    writeStored("view", "cards");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(storeSnapshot("view", (s) => s)).toBe("cards");
  });

  it("stops notifying once unsubscribed", () => {
    const seen = vi.fn();
    const stop = subscribeTo("view")(seen);
    stop();
    writeStored("view", "table");
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("another tab is heard", () => {
  it("re-reads when the browser reports that key", () => {
    const seen = vi.fn();
    subscribeTo("view")(seen);
    expect(storeSnapshot("view", (s) => s ?? "table")).toBe("table");

    otherTabWrote("view", "cards");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(storeSnapshot("view", (s) => s ?? "table")).toBe("cards");
  });

  it("ignores a key nobody here is watching", () => {
    const seen = vi.fn();
    subscribeTo("view")(seen);
    store["something-else"] = "x";
    for (const h of [...handlers]) h({ key: "something-else" } as StorageEvent);
    expect(seen).not.toHaveBeenCalled();
  });

  it("treats a cleared store as affecting every key", () => {
    // `storage` with a null key means the whole origin was wiped, usually by
    // the operator clearing site data. Every value we hold is now wrong.
    writeStored("view", "cards");
    const seen = vi.fn();
    subscribeTo("view")(seen);
    delete store["view"];
    for (const h of [...handlers]) h({ key: null } as StorageEvent);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(storeSnapshot("view", (s) => s ?? "table")).toBe("table");
  });
});

describe("storage that refuses leaves a working panel", () => {
  it("reads as absent rather than throwing", () => {
    install({ throws: true });
    expect(readStored("view")).toBeNull();
    expect(storeSnapshot("view", (s) => s ?? "table")).toBe("table");
  });

  it("still applies a choice for the session when the write fails", () => {
    install({ throws: true });
    const seen = vi.fn();
    subscribeTo("view")(seen);
    // The write cannot be persisted, but the listener must still fire —
    // otherwise the control the operator just clicked does not move.
    expect(() => writeStored("view", "cards")).not.toThrow();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
