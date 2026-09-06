import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An operator is never left holding a button they cannot press.
 *
 * ## The failure this guards
 *
 * The login form disables **Sign in** while a Turnstile challenge is
 * outstanding. That is right, and it had exactly one escape hatch:
 * `turnstileDown`, set only when the Cloudflare **script fails to load**.
 *
 * The failure actually seen on Nikhil's screen is narrower and worse — the
 * script loads, the widget renders, and the token never arrives. A stalled
 * challenge, a proxy holding the request, a clock skewed far enough that
 * Cloudflare refuses it. The button then stays disabled under "Completing the
 * security check…" for as long as anyone is willing to wait, with nothing on
 * the page saying what to do. A lockout with a polite caption.
 *
 * ## Why signing in anyway is safe
 *
 * The server holds `TURNSTILE_SECRET_KEY` and is the authority on whether a
 * token is required. Letting the request through therefore produces either a
 * session or a specific server-side refusal — both of which an operator can
 * act on, unlike a dead button.
 *
 * These are source assertions rather than a rendered test because the fallback
 * only engages when a site key is configured, and there is none in local
 * development — so a render test here would exercise the branch that never
 * fires. Stated plainly so nobody mistakes this for end-to-end coverage: the
 * stalled path has **not** been exercised against a live Cloudflare widget.
 */
const ROOT = join(__dirname, "..", "..", "..");
const page = readFileSync(join(ROOT, "src/app/login/page.tsx"), "utf8");
const widget = readFileSync(
  join(ROOT, "src/components/Turnstile.tsx"),
  "utf8",
);

/** Source with `//` comments stripped — the notes quote the old behaviour. */
const code = (s: string) =>
  s
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n");

const pageCode = code(page);
const widgetCode = code(widget);

describe("a stalled security check hands over to the operator", () => {
  it("there is a stall state, not just a script-failure state", () => {
    expect(pageCode).toContain("checkStalled");
    // The old escape hatch stays — a script that never loads is a different
    // failure and still needs its own handling.
    expect(pageCode).toContain("turnstileDown");
  });

  it("it is reached on a timer rather than never", () => {
    expect(pageCode).toMatch(/setTimeout\(\(\) => setCheckStalled\(true\)/);
  });

  it("the budget is long enough not to race a healthy check", () => {
    // An invisible `interaction-only` challenge resolves in well under a
    // second. Anything under ~3s would start offering a manual retry to
    // people whose check was about to succeed.
    const match = pageCode.match(/setCheckStalled\(true\),\s*(\d+)\)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(3000);
  });

  it("the button stops being disabled once it stalls", () => {
    // The whole point. A disabled button that cannot explain itself is the
    // defect being fixed.
    expect(pageCode).toContain(
      "disabled={challengeRequired && !turnstileToken && !checkStalled}",
    );
  });

  it("and the operator is given something to click", () => {
    expect(pageCode).toContain("runCheckAgain");
    expect(page).toContain("Run it again");
    expect(page).toContain("did not finish on its own");
  });

  it("clicking it asks for a genuinely fresh challenge", () => {
    // A Turnstile token is single-use; retrying without a reset re-sends a
    // token Cloudflare has already seen.
    const fn = pageCode.slice(pageCode.indexOf("function runCheckAgain"));
    expect(fn.slice(0, 300)).toContain("turnstile.current?.reset()");
    expect(fn.slice(0, 300)).toContain("setCheckStalled(false)");
  });

  it("a token arriving retires the offer", () => {
    // Otherwise the retry button sits next to a check that is working.
    expect(pageCode).toContain("if (token) setCheckStalled(false)");
  });
});

describe("a challenge that errors does not wait out the timer", () => {
  it("the widget reports errors upward", () => {
    expect(widgetCode).toContain("onError");
    // `lastIndexOf`, not `indexOf`. The first occurrence is the *type*
    // declaration in `declare global`, which of course contains no
    // implementation — an unbounded slice from it fails against correct code.
    const cb = widgetCode.slice(widgetCode.lastIndexOf('"error-callback"'));
    expect(cb.slice(0, 250)).toContain("onErrorRef.current?.()");
  });

  it("the callback is held in a ref, like onToken", () => {
    // The widget effect deliberately has an empty dependency list; a prop read
    // directly inside it would be captured from the first render forever.
    expect(widgetCode).toContain("onErrorRef");
  });

  it("the form goes straight to the manual offer on an error", () => {
    expect(pageCode).toContain("onError={() => setCheckStalled(true)}");
  });
});
