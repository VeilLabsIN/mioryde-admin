import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOPIC_ALERTS,
  noteOwnAction,
  playAlert,
  resetAudioForTests,
  setSoundEnabled,
  soundEnabled,
  withinOwnAction,
} from "./alertSound";

/**
 * Every rule in this file is a rule about *not* making a noise, which is why
 * `playAlert` reports whether it decided to play: the decisions are the part
 * worth testing, and they can be tested without an audio device.
 */
function stubEnvironment({
  enabled = true,
  reducedMotion = false,
}: { enabled?: boolean; reducedMotion?: boolean } = {}) {
  const store: Record<string, string> = enabled
    ? { "mioryde-alert-sound": "true" }
    : {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: reducedMotion }),
  });

  // A context that records rather than sounds. `createOscillator` returning
  // real-enough objects is what lets the envelope code run unchanged.
  const started: number[] = [];
  class FakeContext {
    currentTime = 0;
    state = "running";
    destination = {};
    resume() {}
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect: (n: unknown) => n,
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 0 },
        connect: (n: { connect: (x: unknown) => unknown }) => n,
        start: (t: number) => started.push(t),
        stop() {},
      };
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  // The module caches its context; without this a later case plays into an
  // earlier case's fake and counts nothing.
  resetAudioForTests();
  return { started };
}

beforeEach(() => {
  // Push the "own action" marker well into the past between cases.
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("what makes a noise, and what does not", () => {
  it("is silent until somebody opts in", () => {
    // A dispatch tool that makes noise out of the box gets muted at the OS
    // level, which takes every other alert with it.
    stubEnvironment({ enabled: false });
    expect(playAlert("placed")).toBe(false);
  });

  it("plays once enabled", () => {
    stubEnvironment();
    expect(playAlert("placed")).toBe(true);
  });

  it("stays silent under prefers-reduced-motion", () => {
    // Not a perfect proxy for "do not startle me", but it is the only standard
    // signal there is, and somebody who set it has said as much as the
    // platform lets them.
    stubEnvironment({ reducedMotion: true });
    expect(playAlert("placed")).toBe(false);
  });

  it("does not chime at an operator for their own action", () => {
    // Cancelling in the panel comes straight back down the same stream the
    // panel is listening to. Without this the click chimes a second later,
    // which reads as a second cancellation.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    stubEnvironment();
    noteOwnAction();
    expect(withinOwnAction()).toBe(true);
    expect(playAlert("cancelled")).toBe(false);
  });

  it("lets the suppression expire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    stubEnvironment();
    noteOwnAction();
    vi.advanceTimersByTime(7000);
    expect(withinOwnAction()).toBe(false);
    expect(playAlert("cancelled")).toBe(true);
  });

  it("never suppresses the urgent sound", () => {
    // A failed ledger check is not less important because the operator
    // happened to click something six seconds ago.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    stubEnvironment();
    noteOwnAction();
    expect(playAlert("urgent")).toBe(true);
  });

  it("only the urgent sound repeats", () => {
    // Repetition is what makes a sound impossible to ignore. Spending it on a
    // routine event is how the urgent one stops working.
    // Measured as deltas inside one environment, because the module caches a
    // single `AudioContext` on purpose — one context per sound would leak a
    // hardware resource per event on a board that runs all shift. Re-stubbing
    // mid-test hands back the first fake, so the counts have to be diffed
    // rather than read fresh.
    const { started } = stubEnvironment();

    const before = started.length;
    playAlert("placed");
    const placedNotes = started.length - before;

    playAlert("cancelled");
    const cancelledNotes = started.length - before - placedNotes;

    playAlert("urgent");
    const urgentNotes =
      started.length - before - placedNotes - cancelledNotes;

    expect(placedNotes).toBe(1);
    expect(cancelledNotes).toBe(2);
    expect(urgentNotes).toBeGreaterThan(4);
  });

  it("can be forced past the preference, for the confirmation beep", () => {
    // Turning sound on writes the preference and plays one note to prove it
    // worked; that note has to bypass the check it just satisfied.
    stubEnvironment({ enabled: false });
    expect(playAlert("placed", { force: true })).toBe(true);
  });

  it("remembers the preference", () => {
    stubEnvironment({ enabled: false });
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
  });
});

describe("which events have a sound", () => {
  it("covers arrivals and cancellations only", () => {
    expect(TOPIC_ALERTS["order.placed"]).toBe("placed");
    expect(TOPIC_ALERTS["order.cancelled"]).toBe("cancelled");
  });

  it("says nothing about deliveries or assignments", () => {
    // Sound is for what needs attention when nobody is looking. A delivery
    // completing is good news that can wait for a glance.
    expect(TOPIC_ALERTS["order.delivered"]).toBeUndefined();
    expect(TOPIC_ALERTS["order.assigned"]).toBeUndefined();
    expect(TOPIC_ALERTS["job.offered"]).toBeUndefined();
  });

  it("gives the urgent voice to a dead letter", () => {
    // A dead letter is somebody not being told something — a customer who
    // never learns their delivery was cancelled. Nothing about the running
    // system looks wrong afterwards, which is exactly what the urgent voice
    // is for: reaching an operator who is not looking at the screen.
    expect(TOPIC_ALERTS["outbox.dead_lettered"]).toBe("urgent");
  });

  it("and to nothing else", () => {
    // The urgent sound repeats and is never suppressed. A second topic
    // wearing it is how the first one stops meaning anything.
    const urgent = Object.entries(TOPIC_ALERTS).filter(
      ([, kind]) => kind === "urgent",
    );
    expect(urgent).toHaveLength(1);
  });

  it("still has no topic for a failed ledger check", () => {
    // Not published to the admin stream. A topic name wired here on the guess
    // that it might be one day is a sound that can never fire and a test that
    // can never fail.
    expect(TOPIC_ALERTS["ledger.check_failed"]).toBeUndefined();
  });
});
