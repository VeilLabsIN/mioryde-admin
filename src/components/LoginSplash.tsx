"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * Covers the handover from the sign-in form to the panel.
 *
 * ## What it is for
 *
 * Signing in succeeds instantly and the panel does not. `router.replace("/")`
 * begins fetching the overview, the live counts and the operator's identity,
 * and until those land the screen holds the login form with a spinner on a
 * button — so the last thing an operator sees after typing a correct password
 * is the password screen, unchanged, for as long as the dashboard takes. On a
 * cold start that reads as a failed sign-in, and the honest response to it is
 * to press the button again.
 *
 * This says "you are in, the panel is coming" for exactly as long as that is
 * true.
 *
 * ## Why it is not a spinner
 *
 * A spinner is a statement that something is slow. This is the one moment the
 * panel has the operator's full attention and nothing competing for it, and
 * the thing worth saying is which system they have just been let into — this
 * is an internal tool, often on a shared dispatch machine, and "which
 * environment am I in" is a real question at 6am.
 *
 * ## Why it has a floor and a ceiling
 *
 * A splash that flashes for 40ms on a warm cache is worse than none: it reads
 * as a glitch. A splash that outlives the thing it is covering is a lie. So it
 * holds for a minimum beat, and it is unmounted by the navigation rather than
 * by a timer — whichever is longer wins, and neither can strand the operator.
 *
 * Honours `prefers-reduced-motion`: the mark and the words still arrive, they
 * simply do not move.
 */
export function LoginSplash({ name }: { name?: string | null }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // One frame later, so the element mounts at its start value and has
    // something to animate *from*. Setting it during render produces no
    // transition at all — the same trap `EmptyState` in the apps documents.
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      // `alert` rather than `status`: this replaces the whole screen, and a
      // screen reader announcing it politely — after whatever it was already
      // reading — would describe a page that has gone.
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5
                 bg-bg text-center"
    >
      <div
        className={`motion-change transition-all duration-500 ease-[var(--ease-out-quint)] ${
          shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <BrandMark size={44} />
      </div>

      <div
        className={`motion-change transition-all delay-100 duration-500 ease-[var(--ease-out-quint)] ${
          shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <p className="font-mono text-micro uppercase tracking-[0.18em] text-fg-faint">
          Mioryde Operations
        </p>
        <p className="mt-2 text-body text-fg-mid">
          {/*
            Named when we know the name. The identity is already in hand from
            the sign-in response, and "Welcome back, Nikhil" on a shared
            dispatch machine answers "whose session is this" before the first
            click — which is the question that causes an accidental action
            under somebody else's account.
          */}
          {name ? `Welcome back, ${name}.` : "Signing you in…"}
        </p>
      </div>
    </div>
  );
}
