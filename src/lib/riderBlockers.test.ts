import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { dispatchGapsOf } from "@/lib/riderBlockers";

const blocker = (gaps: unknown) =>
  new ApiError(400, "This partner has no service zone assigned, so…", {
    code: "dispatch_gaps",
    gaps,
  });

describe("dispatchGapsOf", () => {
  it("reads the gaps the server named", () => {
    expect(dispatchGapsOf(blocker(["zone"]))).toEqual(["zone"]);
    expect(dispatchGapsOf(blocker(["vehicle"]))).toEqual(["vehicle"]);
    expect(dispatchGapsOf(blocker(["vehicle", "zone"]))).toEqual([
      "zone",
      "vehicle",
    ]);
  });

  it("distinguishes a different refusal from an unspecific one", () => {
    // null: not this refusal at all, so the row shows a plain message.
    expect(dispatchGapsOf(new ApiError(400, "Partner not found."))).toBeNull();
    expect(dispatchGapsOf(new Error("offline"))).toBeNull();
    expect(dispatchGapsOf(undefined)).toBeNull();
    // []: this refusal, but the server could not say which half.
    expect(dispatchGapsOf(blocker([]))).toEqual([]);
    expect(dispatchGapsOf(blocker(undefined))).toEqual([]);
  });

  it("does not decide from the message", () => {
    // A reworded sentence must not withdraw the inline fix, and a coincidental
    // one must not summon it.
    expect(
      dispatchGapsOf(
        new ApiError(400, "This partner has no service zone assigned."),
      ),
    ).toBeNull();
    expect(dispatchGapsOf(blocker(["zone"]))).toEqual(["zone"]);
  });

  it("ignores a gap kind this build cannot offer a control for", () => {
    expect(dispatchGapsOf(blocker(["zone", "insurance"]))).toEqual(["zone"]);
  });
});
