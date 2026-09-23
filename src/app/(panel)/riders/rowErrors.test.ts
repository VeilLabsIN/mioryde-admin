import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const page = read("app/(panel)/riders/page.tsx");
const rowError = read("components/RiderActionError.tsx");

/**
 * A17/A18. These are source assertions because the panel has no DOM test
 * harness; they are written to fail on the specific regressions that would
 * quietly undo the change, not merely to observe that the code exists.
 */
describe("a refused action names its row", () => {
  it("keeps refusals per partner, not one string for the page", () => {
    expect(page).toContain("Record<string, RowError>");
    // The regression this guards: reintroducing a single page-level action
    // error, which is what made the message ambiguous with two rows pending.
    expect(page).not.toContain("const [actionError, setActionError]");
  });

  it("shows load failures at the page and refusals in the row", () => {
    expect(page).toContain("const error = loadError;");
    expect(page).toContain("{actionErrors[rider.id] && (");
  });

  it("clears a partner's refusal once their action succeeds", () => {
    const review = page.slice(page.indexOf("async function review"));
    expect(review.slice(0, 900)).toContain("delete next[rider.id]");
  });

  it("does not carry refusals across a change of view", () => {
    // A message keyed to a partner who is no longer listed would otherwise
    // reappear when the filter came back to them.
    expect(page).toContain("setActionErrors({})");
    expect(page).toContain("const queryKey =");
  });
});

describe("a blocked approval can be unblocked in place", () => {
  it("offers the zone control on the row rather than a link away", () => {
    expect(rowError).toContain("<RiderZones");
    expect(rowError).toContain('gaps.includes("zone")');
  });

  it("re-runs the same action once the zone saves", () => {
    expect(rowError).toContain("onSaved={");
    expect(rowError).toContain("onRetry()");
    // The retry must repeat what was attempted, not assume "approve" — a
    // reinstatement hits the same blocker.
    expect(page).toContain("review(rider, actionErrors[rider.id]!.action)");
  });

  it("decides from the server's code, never from the sentence", () => {
    expect(page).toContain("dispatchGapsOf(e)");
    expect(rowError).not.toContain("no service zone assigned");
  });

  it("offers no inline fix for a gap it cannot actually close", () => {
    // A missing vehicle is documents and an inspection; a control here would
    // start a job it cannot finish.
    expect(rowError).toContain("vehicleOnly");
    expect(rowError).toContain("Open partner");
  });
});
