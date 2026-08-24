import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The panel's half of the settings page's promise.
 *
 * The API has its own test asserting that no secret reaches the response —
 * `settings-no-secrets.test.ts` in `mioryde-api`. This asserts the other half:
 * that the page tells the operator so, and that the one href on it driven by
 * response data cannot become a link to anywhere.
 *
 * ## Why this lives here rather than there
 *
 * It used to be a single test in the API repo that read this file by walking
 * up and across into `../../mioryde-admin/…`. That works on a machine where
 * both repositories sit in one folder, and nowhere else — CI checks out one
 * repository, so the sibling does not exist and it failed with ENOENT after
 * passing locally every time.
 *
 * A test that reaches outside its own repository is not thorough; it is a test
 * that is green in the only place nobody needed it to be.
 */

const page = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("the settings page", () => {
  it("says out loud that nothing on it is a secret", () => {
    // The promise is printed on the page, so breaking it later is visibly a
    // lie rather than quietly a regression.
    expect(page).toContain("never sent to the panel");
  });

  it("only links a source that is an internal path", () => {
    /*
     * `row.source` arrives from the server and is the one href here not
     * written as a literal. It is built from a constant list today — but
     * "the server would never send that" is an assumption that survives
     * exactly until somebody makes the list configurable, and by then the
     * check is a `javascript:` URL away from being an XSS.
     */
    expect(page).toContain('row.source.startsWith("/")');
    expect(page).toContain('!row.source.startsWith("//")');
    expect(page).toContain("sourceKind === \"panel\" && isInternalPath");
  });

  it("distinguishes the three ways a setting is changed", () => {
    // A panel page is a click, an environment variable is a deploy, and a
    // constant in code is a pull request. Rendering them identically flattens
    // that into "somewhere else", which is the answer people already had.
    expect(page).toContain('sourceKind === "env"');
    expect(page).toContain("Takes effect on the next deploy");
  });
});
