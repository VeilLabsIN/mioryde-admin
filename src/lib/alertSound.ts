"use client";

/**
 * Sound, for the one thing sound is good at.
 *
 * ## What was rejected
 *
 * Audio on every click. A dispatcher has this open for a whole shift, often in
 * a room with other people, and per-action sound is the first thing anybody
 * turns off. It also carries no information — you already know you clicked.
 *
 * What audio *is* good for is an event that needs attention **when nobody is
 * looking at the screen**, which on a dispatch board is most of the time. So
 * there are three sounds and no others.
 *
 * ## Rules
 *
 * Off by default and opt-in. Never for an action the operator themselves just
 * took. Generated rather than shipped, so there are no files to load, cache or
 * fail. Suppressed under `prefers-reduced-motion` — not a perfect proxy, but it
 * is the only standard signal for "do not startle me", and somebody who has set
 * it has said as much as the platform lets them.
 */

const ENABLED_KEY = "mioryde-alert-sound";

/** How long after an operator's own action its sound is suppressed. */
const OWN_ACTION_WINDOW_MS = 6000;

export type AlertKind = "placed" | "cancelled" | "urgent";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSoundEnabled(next: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(next));
  } catch {
    // Not remembering is survivable; the control still works this session.
  }
}

/**
 * The last moment this operator did something that will come back as an event.
 *
 * Module-level rather than React state: the suppression has to be readable
 * from the stream handler, which is not in the component that fired the
 * action, and threading a timestamp through context to mute a chime is more
 * machinery than the problem deserves.
 */
let ownActionAt = 0;

/**
 * Called by a control whose effect the operator will hear back.
 *
 * Cancelling an order in the panel emits `order.cancelled` on the same stream
 * the panel is listening to, so without this the operator's own click chimes at
 * them a second later — which reads as a second cancellation and is exactly the
 * behaviour that makes people mute an app for good.
 */
export function noteOwnAction(): void {
  ownActionAt = Date.now();
}

export function withinOwnAction(now = Date.now()): boolean {
  return now - ownActionAt < OWN_ACTION_WINDOW_MS;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * One shared context, created on first use.
 *
 * Browsers refuse to start an `AudioContext` before a user gesture and leave it
 * `suspended`. That is fine here: enabling the sound is itself a click, and by
 * the time any event arrives the context has been resumed. `resume()` is called
 * anyway on each play, because a backgrounded tab can be suspended again.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Test-only: drops the module's two pieces of retained state.
 *
 * Both are deliberate in production and both bleed between test cases. The
 * cached context outlives a stubbed constructor, so a later case keeps playing
 * into an earlier case's fake and counts nothing. `ownActionAt` outlives the
 * case that set it, so a later case starts inside a suppression window it never
 * asked for — which is the more insidious of the two, because it makes a
 * *silent* result look like correct behaviour.
 *
 * Mirrors `resetEnvCache` in the API for the same reason.
 */
export function resetAudioForTests(): void {
  ctx = null;
  ownActionAt = 0;
}

/**
 * A single note.
 *
 * Sine, and a gain envelope with a real attack and release. A bare
 * `start()`/`stop()` on an oscillator produces a click at each end — the
 * discontinuity is a step change in the waveform — and a click is precisely
 * the sound quality that makes generated audio feel cheap.
 */
function tone(
  at: number,
  frequency: number,
  durationMs: number,
  peak: number,
): void {
  const context = audio();
  if (!context) return;

  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;

  const start = context.currentTime + at / 1000;
  const end = start + durationMs / 1000;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(context.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

/**
 * The three sounds.
 *
 * Pitched apart rather than merely different, because they are heard from
 * across a room and often without looking: low and soft for the routine good
 * news, a falling pair for something that went away, and a repeated high pair
 * for the one thing that must not be missed. Only the urgent one repeats —
 * repetition is what makes a sound impossible to ignore, and spending it on
 * a routine event is how the urgent one stops working.
 */
const VOICES: Record<AlertKind, () => void> = {
  // Short, soft, low. Orders arrive all day; this has to be liveable.
  placed: () => tone(0, 330, 140, 0.05),

  // Two-tone and falling, so it is distinguishable from `placed` without
  // being alarming — a cancellation is normal business, not a fault.
  cancelled: () => {
    tone(0, 520, 110, 0.055);
    tone(120, 392, 160, 0.055);
  },

  // The only one that repeats, and the only one that is loud.
  urgent: () => {
    for (const offset of [0, 260, 520]) {
      tone(offset, 880, 90, 0.09);
      tone(offset + 100, 1175, 110, 0.09);
    }
  },
};

/**
 * Plays an alert, unless any of the reasons not to apply.
 *
 * Returns whether a sound was actually made, which is what makes this testable
 * without a real audio device: every rule that suppresses a sound is worth a
 * test, and "did it decide to play" is the part that carries the decisions.
 */
export function playAlert(
  kind: AlertKind,
  options: { force?: boolean } = {},
): boolean {
  if (!options.force) {
    if (!soundEnabled()) return false;
    if (prefersReducedMotion()) return false;
    // Only the operator's own doing is suppressed, and only briefly. An
    // urgent alert is never suppressed: a failed ledger check is not less
    // important because somebody happened to click something.
    if (kind !== "urgent" && withinOwnAction()) return false;
  }

  const context = audio();
  if (!context) return false;
  if (context.state === "suspended") void context.resume();

  VOICES[kind]();
  return true;
}

/** Which stream topics have a sound, and which. */
export const TOPIC_ALERTS: Record<string, AlertKind> = {
  "order.placed": "placed",
  "order.cancelled": "cancelled",
  // A dead letter is somebody not being told something — a customer who will
  // never learn their delivery was cancelled, a partner who never saw an
  // offer. Nothing about the running system looks wrong afterwards, which is
  // exactly the case the urgent voice exists for: it has to reach an operator
  // who is not looking at the screen.
  //
  // It is also the only alert that is never suppressed by
  // `withinOwnAction()`, and that is right here — an operator retrying
  // something is not a reason to go quiet about the retry failing.
  "outbox.dead_lettered": "urgent",
  // Still no entry for a failed ledger check. That one is not published to
  // the admin stream, and a topic name wired here on the guess that it might
  // be one day is a sound that can never fire and a test that can never fail.
};
