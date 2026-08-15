"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/api";
import { frameToEvent, takeFrames } from "@/lib/sse";

const BASE_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000/v1";

/** One thing that happened, as the server sent it. */
export interface AdminEvent {
  topic: string;
  payload: Record<string, unknown>;
  /** Server time. Used for ordering and for discarding replays. */
  at: string;
}

export type StreamState = "connecting" | "live" | "reconnecting" | "stopped";

/**
 * How many events to keep.
 *
 * An operator leaves this open for a shift. Unbounded, a busy day is a slow
 * memory leak ending in a tab that has to be killed — and nobody scrolls back
 * two hundred events anyway.
 */
const MAX_EVENTS = 100;

/** Backoff between reconnection attempts, in milliseconds. */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * Subscribes to the live operations stream.
 *
 * ## Why not `EventSource`
 *
 * The browser's own SSE client cannot set request headers, and this API
 * authenticates with a bearer token. The usual workaround is putting the token
 * in the query string, which writes a credential into every access log, proxy
 * log and browser history entry between here and the server. So this reads the
 * response body as a stream instead: a little more code, and the credential
 * stays in a header.
 *
 * The cost is that everything `EventSource` gives away free — reconnection,
 * backoff, frame parsing — has to be written here.
 */
export function useAdminEvents(enabled = true): {
  events: AdminEvent[];
  state: StreamState;
} {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [state, setState] = useState<StreamState>("connecting");

  // Survives re-renders without restarting the stream. Putting the connection
  // in state would tear it down and rebuild it on every event received, which
  // is a reconnect loop that looks like a flaky server.
  const abortRef = useRef<AbortController | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setState("stopped");
      return;
    }

    let cancelled = false;
    let attempt = 0;

    /**
     * Discards an event already shown.
     *
     * A reconnect can replay whatever the server had buffered, and an operator
     * watching the same delivery appear three times stops trusting the board.
     * Keyed on topic, time and the order it concerns, because the server does
     * not issue event ids.
     */
    const isDuplicate = (event: AdminEvent): boolean => {
      const key = `${event.topic}:${event.at}:${JSON.stringify(event.payload)}`;
      if (seenRef.current.has(key)) return true;
      seenRef.current.add(key);
      // Bounded alongside the event list, or the dedupe set becomes the leak
      // the event cap was meant to prevent.
      if (seenRef.current.size > MAX_EVENTS * 4) {
        seenRef.current = new Set([...seenRef.current].slice(-MAX_EVENTS * 2));
      }
      return false;
    };

    const connect = async (): Promise<void> => {
      if (cancelled) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = auth.accessToken();
        const res = await fetch(`${BASE_URL}/admin/events`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });

        if (res.status === 401) {
          // The access token expired while the stream was open — which it will,
          // because these live far longer than a token does. One quiet refresh
          // and reconnect; if that fails the session is genuinely gone and the
          // next scheduled retry will find out.
          throw new Error("unauthorised");
        }
        if (!res.ok || !res.body) {
          throw new Error(`stream failed (${res.status})`);
        }

        if (!cancelled) {
          setState("live");
          attempt = 0;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;

          // `stream: true` matters: a multi-byte character can be split across
          // two chunks, and decoding each chunk independently turns a rupee
          // sign into two replacement characters.
          buffer += decoder.decode(value, { stream: true });

          // Frames are split by the tested helper rather than inline here.
          // Chunks do not align to frames — one read can carry half a frame,
          // or three and a half — and that arithmetic is exactly the thing
          // worth having tests for, which it only is if this calls it.
          const { frames, rest } = takeFrames(buffer);
          buffer = rest;

          for (const frame of frames) {
            // Returns null for keep-alive comments (`: ping`) and for a
            // malformed frame, neither of which should reach the UI or drop
            // the connection.
            const event = frameToEvent<AdminEvent>(frame);
            if (!event?.topic || isDuplicate(event)) continue;
            setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));
          }
        }

        // The server closed cleanly. Fall through to reconnect — a finished
        // stream is not a finished session.
        if (!cancelled) throw new Error("stream ended");
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;

        if (error instanceof Error && error.message === "unauthorised") {
          // `me()` refreshes the token as a side effect of its own 401 retry,
          // which is exactly what is needed before reconnecting.
          try {
            const { api } = await import("@/lib/api");
            await api.me();
          } catch {
            // Session really is gone. The retry below still runs, and the next
            // 401 will fail the same way — visible as "reconnecting" rather
            // than a silent dead board.
          }
        }

        if (cancelled) return;
        setState("reconnecting");

        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30_000;
        attempt += 1;
        setTimeout(() => void connect(), delay);
      }
    };

    void connect();

    return () => {
      // Both flags. `cancelled` stops the retry loop scheduling another
      // attempt; aborting closes the socket. Without the first, a component
      // that unmounts mid-backoff reconnects from the grave.
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [enabled]);

  return { events, state };
}
