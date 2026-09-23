import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(
  join(process.cwd(), "src/components/DocumentViewer.tsx"),
  "utf8",
);
const page = readFileSync(
  join(process.cwd(), "src/app/(panel)/kyc/page.tsx"),
  "utf8",
);

describe("a document that will not display", () => {
  it("stops claiming it is still loading", () => {
    // The bug: `loaded` was a boolean, so a failed image left it false and the
    // centred "Loading the document…" sat on top of the browser's broken-image
    // placeholder forever. The two overlapped into an unreadable smear.
    expect(viewer).toContain('"loading" | "loaded" | "failed"');
    expect(viewer).toContain('setPhase("failed")');
    expect(viewer).toContain("This document could not be displayed.");
  });

  it("covers the broken-image placeholder rather than sitting on it", () => {
    const overlay = viewer.slice(viewer.indexOf('{phase !== "loaded" ?'));
    expect(overlay.slice(0, 400)).toContain("bg-bg");
  });

  it("keeps the approval gate shut when the image fails", () => {
    // The whole point of the gate: no pixels, no approval.
    expect(viewer).toContain('setPhase("loaded");\n              onLoad();');
  });

  it("does not diagnose a cause it cannot know", () => {
    // It used to blame the expiry, which is one cause of several — a missing
    // object or an unreachable bucket look identical from here, and "reopen
    // it" then sends the reviewer round a loop that cannot succeed.
    expect(page).not.toContain("The link may have expired — reopen it.");
    expect(page).toContain("the file itself is unreadable");
  });
});

describe("the queue's checkbox column", () => {
  it("is reserved on every row of a list that has one", () => {
    // A checkbox on some rows and not others shifts those rows right by its
    // own width, which reads as a rendering fault. It did.
    expect(page).toContain(
      '<span aria-hidden className="ml-1 h-3.5 w-3.5 shrink-0" />',
    );
    expect(page).toContain("if (!gutter) return row;");
  });
});
