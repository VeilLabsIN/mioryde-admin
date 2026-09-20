"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Values that exist only in the browser, read without a hydration mismatch.
 *
 * ## The pattern this replaces
 *
 * A dozen components across the panel were written like this:
 *
 * ```ts
 * const [view, setView] = useState("table");
 * useEffect(() => setView(localStorage.getItem(KEY) ?? "table"), []);
 * ```
 *
 * The reasoning in each of their comments was correct and is worth keeping:
 * `localStorage` and `document` do not exist on the server, so reading them
 * during render produces markup the client immediately disagrees with, and
 * React discards the whole tree over it. Starting at a default and correcting
 * after mount avoids that.
 *
 * What it costs is a second render of the entire subtree on every mount, and
 * `react-hooks/set-state-in-effect` flags it for exactly that reason. React 19
 * has a purpose-built answer — `useSyncExternalStore` with a **server
 * snapshot** — which says the same thing declaratively: this is the value on
 * the server, this is the value in the browser, and here is how to hear about
 * it changing.
 *
 * ## What is gained beyond the warning
 *
 * Two things that were not true of the effect version:
 *
 *   - **Two tabs stay in step.** `storage` fires in every *other* tab of the
 *     origin, so an operator who collapses the rail in one window sees it
 *     collapse in the other. The effect version read once and never again.
 *   - **One reader, one answer.** Several components read the same key from
 *     different places. Sharing a store means they cannot disagree about it.
 *
 * ## What is deliberately not changed
 *
 * Every one of these still starts from the same default on the server that it
 * did before, and still swallows a `localStorage` that throws — a locked-down
 * profile or private mode must leave a working panel, not a blank one.
 */

/** Everything listening, keyed by storage key. */
const listeners = new Map<string, Set<() => void>>();

/**
 * The last string read for each key.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-reads on every
 * render, so a snapshot function that touched `localStorage` each time would
 * be fine for strings — but the parsed value on top of it would be a fresh
 * object each render and loop forever. This cache is what makes the parsed
 * form stable: the same string in gives the same parsed value out, until
 * something actually writes.
 */
const raw = new Map<string, string | null>();
const parsed = new Map<string, unknown>();

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // A locked-down profile can throw on access itself, not just on write.
    return null;
  }
}

function notify(key: string): void {
  raw.delete(key);
  parsed.delete(key);
  for (const listener of listeners.get(key) ?? []) listener();
}

/**
 * Writes a key and tells this tab about it.
 *
 * The browser fires `storage` in every tab **except** the one that wrote, so
 * without this the window an operator is actually looking at would be the only
 * one that did not update.
 */
export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembering is survivable; failing to apply the choice is not, and
    // the notify below still updates this tab for the session.
  }
  notify(key);
}

/**
 * The parsed value for a key, stable until something writes.
 *
 * Exported so it can be tested without a React renderer: the panel has no
 * DOM-rendering test setup, and adding one for a hook whose entire logic is
 * this function would be a dependency to carry forever.
 */
export function storeSnapshot<T>(
  key: string,
  parse: (stored: string | null) => T,
): T {
  const current = readStored(key);
  if (!raw.has(key) || raw.get(key) !== current) {
    raw.set(key, current);
    parsed.set(key, parse(current));
  }
  return parsed.get(key) as T;
}

/**
 * Subscribes to one key.
 *
 * Returned from a `useCallback` at every call site rather than built inline:
 * `useSyncExternalStore` unsubscribes and resubscribes whenever this function's
 * identity changes, so a fresh closure per render would tear down and rebuild
 * the listener on every single render.
 */
export function subscribeTo(
  key: string,
): (listener: () => void) => () => void {
  return (listener: () => void) => {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);

    const onStorage = (event: StorageEvent) => {
      // A null key means the whole store was cleared, which affects every key.
      if (event.key === null || event.key === key) notify(key);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(key);
      window.removeEventListener("storage", onStorage);
    };
  };
}

/**
 * A `localStorage`-backed value, with the server's answer stated explicitly.
 *
 * `parse` turns the stored string into the value the component wants and is
 * responsible for rejecting nonsense — a key set by an older build, or by
 * hand — by returning the fallback. It is called only when the stored string
 * has actually changed, so it may allocate.
 */
export function useStoredValue<T>(
  key: string,
  parse: (stored: string | null) => T,
  serverValue: T,
): [T, (next: string) => void] {
  const snapshot = useCallback((): T => {
    return storeSnapshot(key, parse);
  }, [key, parse]);

  const subscribe = useCallback(
    (listener: () => void) => subscribeTo(key)(listener),
    [key],
  );

  const value = useSyncExternalStore(subscribe, snapshot, () => serverValue);

  const write = useCallback((next: string) => writeStored(key, next), [key]);
  return [value, write];
}

/**
 * A browser-only fact that never changes after mount.
 *
 * `document.fullscreenEnabled`, the hour on the operator's clock, whether a
 * `matchMedia` query matched at load. `subscribe` is a no-op because nothing
 * will tell us; the value is read once per mount and then held.
 *
 * Use `useStoredValue` instead for anything that can change, and a real
 * subscription for anything the browser will announce.
 */
export function useClientOnce<T>(read: () => T, serverValue: T): T {
  // A ref, not a fresh object per render. `useSyncExternalStore` calls the
  // snapshot on every render and compares by identity: re-reading each time
  // would re-run the clock (so the greeting could change mid-render) and, for
  // anything that allocates, would loop forever.
  const cache = useRef<{ value: T } | null>(null);

  const snapshot = useCallback((): T => {
    cache.current ??= { value: read() };
    return cache.current.value;
    // `read` is expected to be stable for the life of the component; the
    // value is captured once regardless, which is the point of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useSyncExternalStore(noopSubscribe, snapshot, () => serverValue);
}

/** Nothing will tell us; see `useClientOnce`. Module-level so it is stable. */
const noopSubscribe = (): (() => void) => () => {};

/**
 * A `matchMedia` query, kept current.
 *
 * The server has no viewport, so `serverValue` is what the HTML is rendered
 * with — pick whichever answer makes the markup least wrong, not whichever is
 * more common.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribeToQuery = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribeToQuery,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
