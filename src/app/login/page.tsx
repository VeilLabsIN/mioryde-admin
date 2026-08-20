"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoginScene } from "@/components/LoginScene";
import { SignInGreeting } from "@/components/SignInGreeting";
import { Button, Input } from "@/components/ui";
import { ApiError, api, auth } from "@/lib/api";

/**
 * Staff sign-in.
 *
 * ## Why it is two columns
 *
 * It was one narrow form centred in a very large empty page, which is what a
 * sign-in looks like when nobody has decided what else belongs on it. The
 * split gives the left side a job — say what this is and who it belongs to,
 * for the person who has just been sent a link and a password and has never
 * seen the product — and lets the form stay the same deliberate 380px it
 * always was. A wider form is not a better form.
 *
 * On narrow screens the scene collapses to a band above the form rather than
 * disappearing, so the page still identifies itself on a phone.
 *
 * ## What is deliberately absent
 *
 * No "forgot password" and no "create account". Neither exists: staff accounts
 * are made by an owner from the access page, and a reset is a conversation
 * with one. Offering a link that goes nowhere is worse than the sentence at
 * the bottom explaining the real process.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(false);
  // Tracked rather than styled with `:focus-visible` on a peer, for the
  // same reason the tick is — see the note on the control below.
  const [rememberFocus, setRememberFocus] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in — skip the form.
  //
  // Asks the server rather than checking storage: the refresh cookie is
  // HttpOnly and unreadable here, so the only way to know whether a session
  // survives is to try to restore it. A failure is the ordinary first-visit
  // case and leaves the form on screen.
  useEffect(() => {
    let cancelled = false;
    void api.restoreSession().then((identity) => {
      if (!cancelled && identity) router.replace("/");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), password, remember);
      router.replace("/");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not reach the server.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* ── Left: what this is ─────────────────────────────────────────── */}
      <section className="relative isolate flex flex-col justify-between overflow-hidden
                          border-b border-line bg-panel p-8 lg:border-b-0 lg:border-r lg:p-12">
        <LoginScene />

        <div aria-hidden className="hazard absolute inset-x-0 top-0 h-1 opacity-60" />

        <div className="relative animate-rise">
          <div className="flex items-center gap-3">
            <div className="grad-accent chamfer grid size-11 place-items-center">
              <span className="font-mono text-lg font-bold text-on-accent-bright">M</span>
            </div>
            <div>
              <p className="font-sans text-lg font-semibold leading-tight">Mioryde</p>
              <p className="font-mono text-micro uppercase text-fg-muted">
                Operations
              </p>
            </div>
          </div>
        </div>

        {/* The middle is deliberately mostly the scene. This is three lines of
            orientation, not a marketing page. */}
        <div className="relative my-10 max-w-[420px] lg:my-0">
          <h1 className="font-sans text-title">
            The panel the business runs on.
          </h1>
          <p className="mt-2 text-body text-fg-muted">
            Dispatch, partners, payouts and the ledger for Mioryde&rsquo;s
            intra-city delivery network in Ludhiana.
          </p>

          <dl className="stagger mt-6 grid grid-cols-3 gap-4 border-t border-line pt-5">
            <Stat value="Live" label="Dispatch board" />
            <Stat value="Double-entry" label="Money ledger" />
            <Stat value="Audited" label="Every action" />
          </dl>
        </div>

        {/*
          No links to /privacy or /legal here, though they belong on a sign-in
          page. Both live inside the panel's auth guard, so a link to either
          would bounce a signed-out visitor straight back to this page — the
          exact dead end the rest of the panel is careful not to ship. Making
          the policy pages publicly reachable needs a layout outside the guard;
          until that exists, this says who the tool belongs to and stops.
        */}
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-mono text-micro uppercase text-fg-faint">
            Miorigin Pvt Ltd
          </p>
          <span aria-hidden className="text-fg-faint">·</span>
          <p className="font-mono text-micro uppercase text-fg-faint">
            Internal tool — authorised staff only
          </p>
        </div>
      </section>

      {/* ── Right: the form ────────────────────────────────────────────── */}
      <section className="grid place-items-center px-6 py-10 lg:px-12">
        <div className="animate-rise w-full max-w-[380px]">
          <p className="flex items-center gap-2 font-mono text-micro uppercase text-accent">
            {/* A live dot rather than a static bullet: this is the one element
                on the page that says the panel is running and reachable. */}
            <span aria-hidden className="relative grid size-1.5 place-items-center">
              <span className="absolute size-1.5 rounded-full bg-accent motion-safe:animate-ping" />
              <span className="size-1.5 rounded-full bg-accent" />
            </span>
            Staff sign-in
          </p>

          <SignInGreeting email={email} />

          <p className="mb-7 text-body text-fg-muted">
            Use the account your administrator created for you.
          </p>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block font-mono text-micro uppercase text-fg-muted"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mioryde.com"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label
                  htmlFor="password"
                  className="block font-mono text-micro uppercase text-fg-muted"
                >
                  Password
                </label>
                {/*
                  Reveal, not a permanent plaintext field. A mistyped password
                  on a locking account is worth one glance, and the button says
                  which state it is in rather than relying on a crossed-out eye.
                */}
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  className="motion-change font-mono text-micro uppercase text-fg-faint
                             transition-colors hover:text-accent"
                >
                  {reveal ? "Hide" : "Show"}
                </button>
              </div>
              <Input
                id="password"
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) =>
                  setCapsOn(e.getModifierState?.("CapsLock") ?? false)
                }
                placeholder="••••••••••••"
              />
              {/*
                Caps lock is the single most common reason a correct password
                is rejected, and this account locks after a handful of tries.
                Saying so before the third attempt is cheaper than unlocking it.
              */}
              {capsOn && !reveal && (
                <p className="animate-slide-in mt-1.5 text-meta text-warn">
                  Caps lock is on.
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="animate-slide-in border-l-2 border-danger pl-3 text-body text-danger"
              >
                {error}
              </p>
            )}

            {/*
              A real checkbox underneath, not a div pretending to be one: the
              label click, the space key and the form semantics all come free,
              and rebuilding them on a <div role="checkbox"> is the standard
              way this control ends up unusable by keyboard.

              The *appearance* is driven from React state rather than Tailwind's
              `peer-checked:` variants. Both would work; this one is chosen
              because the rendered state is readable in this file. `peer-*`
              styling puts the on/off appearance in a sibling selector that only
              exists if the class scanner found the literal string, so the
              question "what does this look like when ticked" is answered by the
              build rather than by the code — and the same applies to the focus
              ring, which is why that is tracked here too rather than left to
              `peer-focus-visible`.
            */}
            <label className="group mt-1 flex cursor-pointer items-start gap-2.5 select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                onFocus={() => setRememberFocus(true)}
                onBlur={() => setRememberFocus(false)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`chamfer-sm mt-0.5 grid size-4 shrink-0 place-items-center border
                            transition-colors duration-150 ${
                              remember
                                ? "border-accent bg-accent"
                                : "border-edge bg-surface group-hover:border-accent"
                            } ${
                              rememberFocus
                                ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                                : ""
                            }`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="text-on-accent transition-transform duration-150
                             ease-[var(--ease-spring)] motion-reduce:transition-none"
                  style={{ transform: remember ? "scale(1)" : "scale(0)" }}
                >
                  <path
                    d="M1.5 5.2L3.8 7.5L8.5 2.8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>

              <span className="min-w-0">
                <span className="block text-body text-fg-soft">Remember me</span>
                {/*
                  Says what it actually does, and changes as it is toggled.
                  "Remember me" on its own means nothing specific, and on a tool
                  holding customer phone numbers the length of the session is
                  the whole decision being made.
                */}
                <span className="block text-meta text-fg-faint">
                  {remember
                    ? "Stay signed in on this device for 7 days."
                    : "Signed in for 1 day. Tick only on a device that is yours alone."}
                </span>
              </span>
            </label>

            <Button type="submit" loading={busy} className="mt-2 w-full">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-meta leading-relaxed text-fg-faint">
            Staff accounts are created by an administrator. Repeated failed
            attempts lock the account for 15 minutes. Signing out ends the
            session immediately, and it expires on its own either way.
          </p>
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-sans text-label font-semibold text-fg">{value}</dt>
      <dd className="font-mono text-micro uppercase text-fg-muted">{label}</dd>
    </div>
  );
}
