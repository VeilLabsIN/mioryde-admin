import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");
const viewer = readFileSync(join(SRC, "components/DocumentViewer.tsx"), "utf8");
const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");

/**
 * The bug this guards is the most expensive kind: everything is healthy and
 * nothing works. The bucket, the signature, the API and `check:storage` all
 * passed; the browser refused to paint the image because the panel's own
 * policy did not name the origin it came from.
 */
describe("documents are allowed to render", () => {
  it("names the document origin in img-src", () => {
    const imgSrc = proxy.slice(proxy.indexOf("`img-src"));
    expect(imgSrc.slice(0, 200)).toContain("documentOrigin");
  });

  it("reads that origin from configuration, not from a signed URL", () => {
    // The API signs these and the panel never sees one until long after the
    // header has been sent.
    expect(proxy).toContain('process.env["NEXT_PUBLIC_DOCUMENT_ORIGIN"]');
    expect(proxy).toContain("new URL(configured).origin");
  });

  it("degrades to no source rather than a broken policy", () => {
    // A malformed value must not take the whole CSP down with it.
    const block = proxy.slice(proxy.indexOf("let documentOrigin"));
    expect(block.slice(0, 400)).toContain("catch");
  });

  it("is documented where somebody deploying would look", () => {
    expect(example).toContain("NEXT_PUBLIC_DOCUMENT_ORIGIN");
  });
});

describe("a blocked image says it was blocked", () => {
  it("listens for the violation rather than guessing from onerror", () => {
    // A blocked image and a missing one are identical from `onerror`, and the
    // difference is a partner to chase versus a header to fix.
    expect(viewer).toContain('addEventListener("securitypolicyviolation"');
    expect(viewer).toContain('removeEventListener("securitypolicyviolation"');
  });

  it("only claims violations that are this image", () => {
    expect(viewer).toContain('event.effectiveDirective !== "img-src"');
    expect(viewer).toContain("src.startsWith(event.blockedURI)");
  });

  it("names the directive and the fix", () => {
    expect(viewer).toContain("NEXT_PUBLIC_DOCUMENT_ORIGIN");
    expect(viewer).toContain("the document itself is fine");
  });
});
