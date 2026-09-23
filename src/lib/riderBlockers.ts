import { ApiError } from "@/lib/api";

/**
 * The halves of a partner's setup that dispatch requires.
 *
 * Mirrors `DispatchGap` in the API's `admin-riders.controller.ts`.
 */
export type DispatchGap = "zone" | "vehicle";

const GAPS: DispatchGap[] = ["zone", "vehicle"];

/**
 * Which parts of a partner's setup an approval was refused for, if that is
 * what happened.
 *
 * `null` means "not that refusal" — a different error, or a network failure.
 * An **empty array** is a third answer and not the same as `null`: the
 * approval *was* refused for dispatch reachability, but the server could not
 * say which half, because the row changed underneath its own pre-check. The
 * panel shows the message and offers no inline remedy in that case, rather
 * than offering to fix something that may not be broken.
 *
 * Read from `code`, never from the sentence. The sentence is prose and will be
 * reworded; a match on it would fail silently and quietly withdraw the inline
 * fix that A18 exists to provide — the exact failure mode the API avoids by
 * recognising the trigger by SQLSTATE instead of by message.
 */
export function dispatchGapsOf(error: unknown): DispatchGap[] | null {
  if (!(error instanceof ApiError)) return null;
  if (error.body["code"] !== "dispatch_gaps") return null;
  const raw = error.body["gaps"];
  if (!Array.isArray(raw)) return [];
  // Filtered rather than cast. A gap kind this build does not know about has
  // no control to offer, and passing it through would render nothing while
  // claiming something is fixable here.
  return GAPS.filter((g) => raw.includes(g));
}
