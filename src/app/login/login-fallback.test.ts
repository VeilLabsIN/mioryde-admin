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
 * ## What the operator is actually given
 *
 * Cloudflare's own widget, forced visible. The wrapper renders
 * `interaction-only` normally — invisible unless Cloudflare wants something —
 * and the form switches it to `always` the moment the silent check stalls, so
 * a real "Verify you are human" box appears and ticking it produces a real
 * token. A lookalike checkbox of our own would confirm nothing to the server.
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

  it("and the operator is given a real box to tick", () => {
    // Cloudflare's own widget, forced visible — not a checkbox of ours, which
    // would confirm nothing to the server. This is the whole handover.
    expect(pageCode).toContain(
      'appearance={checkStalled ? "always" : "interaction-only"}',
    );
    expect(page).toContain("Confirm you are");
    expect(page).toContain("not a bot");
  });

  it("and a way to ask for another one if that box is itself broken", () => {
    expect(pageCode).toContain("runCheckAgain");
    expect(pageCode).toContain("onClick={runCheckAgain}");
  });

  it("asking again gets a genuinely fresh challenge", () => {
    // A Turnstile token is single-use; retrying without a reset re-sends a
    // token Cloudflare has already seen.
    const fn = pageCode.slice(pageCode.indexOf("function runCheckAgain"));
    expect(fn.slice(0, 300)).toContain("turnstile.current?.reset()");
  });

  it("asking again stays in the visible mode", () => {
    // Clearing the stall here would drop the widget back to the silent mode
    // that has just failed, putting the operator on the same eight-second
    // wait with nothing to do. The stall is only cleared by a token arriving.
    const fn = pageCode.slice(pageCode.indexOf("function runCheckAgain"));
    expect(fn.slice(0, 300)).not.toContain("setCheckStalled(false)");
  });

  it("a token arriving retires the instruction", () => {
    // Otherwise "confirm you are not a bot" sits next to a check that has
    // already worked. Driven by the token rather than by clearing the stall,
    // which would tear the widget down at the moment it succeeded.
    expect(pageCode).toContain(
      "{challengeRequired && !turnstileToken && checkStalled ? (",
    );
  });

  it("the escalation only ever goes one way", () => {
    // `setCheckStalled(false)` anywhere would flip `appearance` back to the
    // silent mode that has already failed once — and would do it at the exact
    // moment the operator solved the visible box.
    expect(pageCode).not.toContain("setCheckStalled(false)");
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

  it("the form goes straight to the visible box on an error", () => {
    expect(pageCode).toContain("onError={() => setCheckStalled(true)}");
  });

  it("the widget can actually be shown, and re-renders when that changes", () => {
    // Cloudflare has no way to change the mode of a widget that already
    // exists, so `appearance` has to be a dependency of the effect that
    // renders it — the one dependency it is allowed to have.
    expect(widgetCode).toContain("appearance");
    expect(widgetCode).toMatch(/\}, \[appearance\]\);/);
  });
});
