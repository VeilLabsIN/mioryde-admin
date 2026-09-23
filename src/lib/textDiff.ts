/**
 * A line diff, for reviewing terms before they become permanent.
 *
 * ## Why this and not a library
 *
 * The panel needs one thing: which lines of the agreement changed. A diff
 * package brings word-level highlighting, patch formats and a few tens of
 * kilobytes to a route that is opened a handful of times a year, and the
 * algorithm underneath is fifteen lines. The cost of the dependency is paid on
 * every build and every audit; the benefit is highlighting nobody asked for.
 *
 * ## Why lines and not words
 *
 * The question in front of the operator is "is this the text legal approved",
 * and that is answered by seeing whole clauses. Word-level marks inside a
 * changed paragraph make the paragraph harder to read, not easier.
 */

export type DiffKind = "same" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/**
 * Longest common subsequence over lines, then walked back into a diff.
 *
 * O(n·m) in time and memory, which for two agreement bodies — hundreds of
 * lines — is nothing. Guarded anyway: past the cap this reports the whole text
 * as replaced rather than allocating a matrix big enough to hang the tab. A
 * coarse diff is a fair answer for a document that size; a frozen panel during
 * an irreversible action is not.
 */
export const MAX_DIFF_LINES = 2000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i…] and b[j…].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      // Removals before additions at the same point, so a changed line reads
      // as the old text struck out above the new one.
      out.push({ kind: "removed", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "added", text: b[j]! });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: "removed", text: a[i++]! });
  while (j < b.length) out.push({ kind: "added", text: b[j++]! });

  return out;
}

/** How much changed, for a one-line summary above the diff. */
export function diffSummary(lines: DiffLine[]): {
  added: number;
  removed: number;
  unchanged: number;
} {
  return {
    added: lines.filter((l) => l.kind === "added").length,
    removed: lines.filter((l) => l.kind === "removed").length,
    unchanged: lines.filter((l) => l.kind === "same").length,
  };
}
