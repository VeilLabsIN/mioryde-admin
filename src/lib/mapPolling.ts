import type { LiveMapSnapshot } from "@/lib/api";

/**
 * How often the live map should ask again.
 *
 * ## The problem this solves
 *
 * The map polled every four seconds, unconditionally, for as long as a tab was
 * open. That is around 7,200 requests per eight-hour shift per tab, and five
 * dispatchers is roughly a million a month — each one running queries against
 * an API that runs on half a CPU. Most of those requests learn nothing: a
 * production snapshot read `DELIVERING 0 · IDLE 0 · OFFLINE 0 · DARK 0 ·
 * UNASSIGNED 1`, which is 900 requests an hour spent re-establishing that
 * nothing is happening.
 *
 * ## Why the rate is derived from the fleet
 *
 * Four seconds is right when a van is moving through a junction, because a pin
 * that lags the vehicle is a pin a dispatcher stops trusting. It is pure waste
 * when nobody is on duty. So the interval follows the thing it is watching.
 *
 * ## Why this does not halt completely
 *
 * The audit proposed stopping entirely at zero riders online and waking on an
 * SSE event. That is the cheapest possible option and it has one bad failure
 * mode: if the event channel drops, the map stops updating and looks exactly
 * like a quiet night. A dispatcher cannot tell those apart, and this screen is
 * the one place that distinction matters — `dark` riders are incidents.
 *
 * Thirty seconds idle is already an 87% reduction with no silent-freeze state.
 * If the stream is later made a reliable wake source, halting becomes a safe
 * change on top of this rather than instead of it.
 */

/** A vehicle is moving. A pin that lags it is a pin nobody trusts. */
export const ACTIVE_MS = 4000;

/** Somebody is on duty but has nothing to do. Still worth watching. */
export const STANDBY_MS = 10000;

/** Nobody on duty, nothing in flight. */
export const IDLE_MS = 30000;

export function pollIntervalFor(snapshot: LiveMapSnapshot | null): number {
  // Nothing loaded yet: ask at the fast rate until there is something to base
  // a decision on. Backing off before the first snapshot would make a busy
  // evening take thirty seconds to appear.
  if (!snapshot) return ACTIVE_MS;

  // An order in flight is work happening whether or not a rider is attached to
  // it — an unassigned pickup is precisely what a dispatcher is waiting to act
  // on, so it must not slow the map down.
  if (snapshot.orders.length > 0) return ACTIVE_MS;

  const anyDelivering = snapshot.riders.some((r) => r.status === "delivering");
  if (anyDelivering) return ACTIVE_MS;

  // `dark` counts as present, deliberately. A partner who has gone silent
  // while on duty is the single most important pin on this map, and backing
  // off to thirty seconds is the wrong response to an unfolding incident.
  const anyPresent = snapshot.riders.some(
    (r) => r.status === "idle" || r.status === "dark",
  );
  if (anyPresent) return STANDBY_MS;

  return IDLE_MS;
}

/**
 * How long ago a position was reported, in seconds.
 *
 * The server used to compute this and send it, which made every response
 * different from the last and defeated the ETag before it was written. It
 * sends an instant now, and the age is derived here.
 *
 * Measured against the **server's** clock, carried on the snapshot, plus how
 * long the browser has held it. A dispatcher's machine with a clock ten
 * minutes out would otherwise show the whole fleet as dark, or — worse — show
 * a genuinely dark rider as fresh.
 */
export function secondsSinceFix(
  lastFixAt: string,
  serverNow: string,
  receivedAt: number,
  clientNow: number,
): number {
  const fix = Date.parse(lastFixAt);
  const asOf = Date.parse(serverNow);
  if (Number.isNaN(fix) || Number.isNaN(asOf)) return 0;

  const heldFor = Math.max(0, clientNow - receivedAt);
  return Math.max(0, Math.round((asOf - fix + heldFor) / 1000));
}
