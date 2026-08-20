"use client";

import { useEffect, useState } from "react";

/**
 * The heading on the sign-in form.
 *
 * ## What makes it "live"
 *
 * Two things, both real rather than decorative:
 *
 *   - **It knows the time.** "Good morning" at 7am and "Good evening" at 9pm,
 *     from the operator's own clock. A dispatch panel is used across shifts and
 *     a fixed "Welcome back" is the one greeting that is never quite right.
 *   - **It knows who is typing.** Once an email is entered it greets the local
 *     part by name. Nothing is looked up and nothing is sent — the name comes
 *     out of the box the person just typed into, so it cannot leak whether an
 *     account exists. That distinction matters: a greeting that only appeared
 *     for *real* accounts would be an enumeration oracle, exactly the thing the
 *     rider sign-in goes to some trouble to avoid.
 *
 * ## Why it renders empty on the server
 *
 * The greeting depends on the viewer's clock, so rendering it during SSR would
 * produce markup the client immediately disagrees with — a hydration mismatch.
 * Starting empty and filling in after mount avoids that, and costs nothing
 * visually because the letters were going to animate in anyway.
 */

function greetingFor(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Working late";
}

/**
 * A display name out of an email local part.
 *
 * `nikhil.sharma@mioryde.com` → `Nikhil`. Returns null for anything that does
 * not look like a person's name — `ops`, `admin`, `no-reply`, a string of
 * digits — because "Good morning, Admin" reads worse than no name at all.
 */
export function nameFromEmail(email: string): string | null {
  const local = email.trim().split("@")[0];
  if (!local) return null;

  const first = local.split(/[.\-_+]/)[0] ?? "";
  if (first.length < 2 || first.length > 20) return null;
  if (!/^[a-z]+$/i.test(first)) return null;

  const GENERIC = new Set([
    "admin", "ops", "info", "support", "hello", "team", "mail", "noreply",
    "no", "contact", "billing", "finance", "accounts", "office", "help",
  ]);
  if (GENERIC.has(first.toLowerCase())) return null;

  return first[0]!.toUpperCase() + first.slice(1).toLowerCase();
}

/** Letters that rise in one after another. */
function Letters({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          aria-hidden
          className="inline-block animate-rise"
          style={{ animationDelay: `${delay + i * 26}ms` }}
        >
          {/* A collapsed space would close the gaps between words, because
              every letter is its own inline-block. */}
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

export function SignInGreeting({ email }: { email: string }) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  // Settled, not per-keystroke. Re-running the letter animation on every
  // character typed into the email box would be a twitch, not a flourish.
  useEffect(() => {
    const timer = setTimeout(() => setName(nameFromEmail(email)), 450);
    return () => clearTimeout(timer);
  }, [email]);

  const full = greeting ? `${greeting}${name ? `, ${name}` : ""}.` : "";

  return (
    <h2
      // The letters are individual spans, which a screen reader would
      // otherwise announce one at a time. The label carries the real sentence.
      aria-label={full || undefined}
      aria-live="polite"
      className="mb-1 mt-2 min-h-[1.25em] font-sans text-title"
    >
      {greeting && (
        <>
          <Letters text={greeting} />
          {/* Keyed on the name so only this half re-animates when it appears —
              the greeting itself stays put rather than replaying. */}
          {name ? (
            <span key={name}>
              <Letters text={`, ${name}`} />
            </span>
          ) : null}
          <span aria-hidden className="inline-block animate-rise">.</span>
        </>
      )}
    </h2>
  );
}
