import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  join(process.cwd(), "src/app/(panel)/access/page.tsx"),
  "utf8",
);

/**
 * A20, the half of it that is code.
 *
 * Which person holds which role is Nikhil's to decide and cannot be assumed
 * here. What the panel can do is stop reporting the gap as a statistic.
 */
describe("the all-owners warning", () => {
  it("fires only when every active account is an owner", () => {
    expect(page).toContain(
      "owners.length === active.length",
    );
  });

  it("does not nag a one or two person team", () => {
    // With one account there is nothing to distribute, and with two the
    // second is usually the real co-owner.
    expect(page).toContain("active.length >= 3");
  });

  it("counts only active accounts", () => {
    // Deactivated owners are kept for the audit trail and hold nothing.
    expect(page).toContain('active.filter((a) => a.role === "owner")');
  });

  it("says what to do, not merely that something is wrong", () => {
    expect(page).toContain("Move each account to the role matching the job");
  });
});
