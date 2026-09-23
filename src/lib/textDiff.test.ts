import { describe, expect, it } from "vitest";
import { MAX_DIFF_LINES, diffLines, diffSummary } from "@/lib/textDiff";

const kinds = (before: string, after: string) =>
  diffLines(before, after).map((l) => `${l.kind}:${l.text}`);

describe("diffLines", () => {
  it("reports nothing changed when nothing changed", () => {
    expect(kinds("a\nb", "a\nb")).toEqual(["same:a", "same:b"]);
    expect(diffSummary(diffLines("a\nb", "a\nb"))).toEqual({
      added: 0,
      removed: 0,
      unchanged: 2,
    });
  });

  it("keeps unchanged clauses out of the way", () => {
    expect(kinds("a\nb\nc", "a\nB\nc")).toEqual([
      "same:a",
      "removed:b",
      "added:B",
      "same:c",
    ]);
  });

  it("shows the old text above the new one for a changed line", () => {
    const out = diffLines("old", "new");
    expect(out[0]).toEqual({ kind: "removed", text: "old" });
    expect(out[1]).toEqual({ kind: "added", text: "new" });
  });

  it("handles a pure insertion and a pure deletion", () => {
    expect(kinds("a\nc", "a\nb\nc")).toEqual(["same:a", "added:b", "same:c"]);
    expect(kinds("a\nb\nc", "a\nc")).toEqual(["same:a", "removed:b", "same:c"]);
  });

  it("treats first publication as entirely new", () => {
    expect(kinds("", "a\nb")).toEqual(["removed:", "added:a", "added:b"]);
  });

  it("reconstructs the new text exactly", () => {
    // The property that matters: an operator confirming against this diff is
    // confirming against what will actually be stored.
    const before = "one\ntwo\nthree\nfour";
    const after = "one\ntwo and a half\nthree\nfive\nsix";
    const rebuilt = diffLines(before, after)
      .filter((l) => l.kind !== "removed")
      .map((l) => l.text)
      .join("\n");
    expect(rebuilt).toBe(after);
  });

  it("degrades coarsely rather than hanging on an enormous document", () => {
    const huge = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) =>
      String(i),
    ).join("\n");
    const out = diffLines(huge, huge);
    // Every line reported as replaced, and crucially it returned at all.
    expect(out.some((l) => l.kind === "same")).toBe(false);
    expect(out).toHaveLength((MAX_DIFF_LINES + 1) * 2);
  });
});
