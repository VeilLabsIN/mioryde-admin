/**
 * Elapsed time for the dispatch board.
 *
 * Split out of the page because two things here are arithmetic that is wrong
 * in ways nobody notices: the clock the numbers are measured against, and the
 * rounding used to display them. Both are worth a test, which they only are if
 * they live somewhere a test can reach.
 */

/**
 * How far this workstation's clock is ahead of the server's, in milliseconds.
 *
 * The board's entire value is that "waiting 22 minutes" is true. A machine
 * whose clock is four minutes fast would show every delivery as four minutes
 * older than it is — plausible, uniform, and completely wrong, which is worse
 * than an obvious error. Every response carries the server's `asOf`, so the
 * offset is measurable rather than assumed.
 *
 * Measured at the moment the response is received, so it includes half the
 * round trip as skew. On a LAN that is single-digit milliseconds; against a
 * number displayed in whole minutes it does not survive rounding.
 */
export function clockSkewMs(serverAsOf: string, receivedAtClient: number): number {
  const asOf = Date.parse(serverAsOf);
  // An unparseable timestamp means trusting the local clock, which is the
  // behaviour there was before this existed — degraded, not broken.
  return Number.isNaN(asOf) ? 0 : receivedAtClient - asOf;
}

/** Milliseconds between a server-side instant and now, corrected for skew. */
export function elapsedMs(
  since: string,
  clientNow: number,
  skew: number,
): number {
  const start = Date.parse(since);
  if (Number.isNaN(start)) return 0;
  // Never negative. A delivery that shows "-3m" reads as a bug in the panel
  // rather than as the sub-second clock disagreement it actually is.
  return Math.max(0, clientNow - skew - start);
}

/**
 * `1_500_000` → `"25m"`.
 *
 * Truncated, never rounded. An order at 4 minutes 50 seconds reads as `4m`,
 * because a dispatcher acting on a five-minute threshold should not be told
 * something crossed it before it did — the number may be a minute pessimistic
 * about age but never optimistic about urgency.
 *
 * Seconds only appear under a minute, where they are the only thing that
 * distinguishes a fresh order from a stuck one.
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    // Padded, so a column of these stays aligned — `1h 04m` beside `1h 30m`
    // rather than a ragged edge that makes them harder to compare at a glance.
    return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  }

  // A delivery in flight for over a day means something was never closed out,
  // and `170h 23m` is a number an operator has to do arithmetic on before they
  // can react to it. Minutes are dropped here because at this scale they are
  // not the point — that it has been a week is.
  const days = Math.floor(hours / 24);
  return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
}

/**
 * How long each status may last before it wants attention, in milliseconds.
 *
 * Not one number, because the statuses mean different things. An order nobody
 * has accepted after five minutes is a dispatch failure the customer is
 * already noticing. A partner who accepted twenty minutes ago and has not
 * reached the pickup is probably in traffic. A two-hour transit is either a
 * long haul or a driver who forgot to press a button, and the board cannot
 * tell — which is why this flags rather than alerts.
 *
 * Deliberately generous. A board where everything is flagged is a board where
 * nothing is.
 */
const ATTENTION_AFTER_MS: Record<string, number> = {
  pending: 5 * 60_000,
  assigned: 20 * 60_000,
  arriving_pickup: 20 * 60_000,
  picked_up: 15 * 60_000,
  in_transit: 120 * 60_000,
};

/**
 * Whether a delivery has sat in its current status too long.
 *
 * An unknown status returns false rather than flagging: a status this panel
 * has not been taught about is not evidence of a problem, and a new one
 * shipping as a screen full of warnings would train operators to ignore them.
 * Same direction as the apps' "unknown wire values fail safe".
 */
export function needsAttention(status: string, elapsed: number): boolean {
  const threshold = ATTENTION_AFTER_MS[status];
  return threshold !== undefined && elapsed >= threshold;
}

/**
 * The order a dispatch board should be read in.
 *
 * The board sorted by when each order was *placed*, while the duration it
 * displays and the flag it raises both measure time in the *current status*.
 * Three different notions of "waiting" on one screen, and they disagree the
 * moment an order progresses: a long haul placed this morning and collected
 * two minutes ago outranked a delivery nobody had accepted for eight minutes,
 * which is precisely inverted on the screen whose job is "who needs somebody".
 * It also made the visible duration column non-monotonic, so the list looked
 * mis-sorted even when it was doing what it was told.
 *
 * Flagged first, then longest in its current status. Attention wins over
 * duration because a pending order at six minutes is a dispatch failure a
 * customer is already noticing, while a two-hour transit is usually a long
 * trip — the flag encodes that judgement and the raw number does not.
 *
 * Sorting here rather than in SQL because the thresholds live in this file and
 * the elapsed time is corrected for this workstation's clock skew, neither of
 * which the server knows.
 */
export function boardOrder<T extends { status: string; statusSince: string }>(
  orders: readonly T[],
  now: number,
  skew: number,
): T[] {
  return [...orders].sort((a, b) => {
    const aElapsed = elapsedMs(a.statusSince, now, skew);
    const bElapsed = elapsedMs(b.statusSince, now, skew);
    const aFlagged = needsAttention(a.status, aElapsed);
    const bFlagged = needsAttention(b.status, bElapsed);
    if (aFlagged !== bFlagged) return aFlagged ? -1 : 1;
    return bElapsed - aElapsed;
  });
}
