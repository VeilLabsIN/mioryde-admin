"use client";

import { useEffect, useRef, useState } from "react";
import { api, type RiderDetail as Detail } from "@/lib/api";

/**
 * One partner, opened from the live map.
 *
 * ## What this screen is for
 *
 * Almost always one thing: somebody has gone quiet, and an operator needs to
 * find out where they were and ring them. Everything here is ordered by that —
 * the last position and its age first, the phone number next, the delivery they
 * were carrying after.
 *
 * ## Why every field has a copy button
 *
 * The next action after reading this is pasting it somewhere: a number into a
 * phone, coordinates into a map, an order code into a chat with the customer.
 * Retyping a ten-digit number from a screen is how a wrong number gets dialled
 * at the exact moment accuracy matters.
 */
export function RiderDetail({
  riderId,
  onClose,
}: {
  riderId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);

    api
      .riderDetail(riderId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Named rather than swallowed. A blank drawer is indistinguishable
        // from a partner with no data, and this route is `ops` only — so a
        // support operator opening it gets a 403 they need to understand
        // rather than an empty box they will report as a bug.
        setError(e instanceof Error ? e.message : "Could not load this partner.");
      });

    return () => {
      cancelled = true;
    };
  }, [riderId]);

  return (
    <aside className="flex h-full w-[340px] flex-col border-l border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-mono text-[11px] font-bold tracking-[1.5px] text-fg-muted">
          PARTNER
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close partner details"
          className="text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {!error && !detail && (
          <p className="text-[13px] text-fg-muted">Loading…</p>
        )}
        {detail && <Body detail={detail} />}
      </div>
    </aside>
  );
}

function Body({ detail }: { detail: Detail }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar name={detail.name} url={detail.photoUrl} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-fg">
            {detail.name}
          </div>
          <div className="text-[12px] text-fg-muted">
            {detail.vehicleName ?? "No vehicle on file"}
            {detail.rating !== null && ` · ★ ${detail.rating.toFixed(1)}`}
          </div>
        </div>
      </div>

      <LastSeen detail={detail} />

      <Field label="PHONE" value={detail.phone} href={`tel:${detail.phone}`} />

      {detail.vehicleNumber && (
        <Field label="VEHICLE NUMBER" value={detail.vehicleNumber} />
      )}

      {detail.activeOrder ? (
        <Field
          label="CARRYING"
          value={`${detail.activeOrder.code} · ${detail.activeOrder.status.replace(/_/g, " ")}`}
        />
      ) : (
        <Note>Not carrying a delivery.</Note>
      )}

      {/* Said out loud rather than left as an absent row. "No address shown"
          is a fact an operator can act on — by ringing instead — whereas a
          missing field reads as a screen that failed to load. */}
      <Note>
        No home address is held for partners. Onboarding does not ask for one,
        so the last known position above is the only location on file.
      </Note>
    </div>
  );
}

/**
 * The position, and how old it is.
 *
 * The age is the point. A pin is only as useful as the reader's confidence in
 * it, and "eleven minutes ago" is what turns a dot on a map into either a
 * dispatch decision or a phone call.
 */
function LastSeen({ detail }: { detail: Detail }) {
  const seen = detail.lastSeen;

  if (!seen) {
    return (
      <Note>
        This partner has never reported a position. They have not been on duty
        since the app was installed, or location was never granted.
      </Note>
    );
  }

  const coords = `${seen.lat.toFixed(6)}, ${seen.lng.toFixed(6)}`;
  const stale = seen.secondsAgo > 90;

  return (
    <div className="flex flex-col gap-2">
      <Field
        label="LAST KNOWN POSITION"
        value={coords}
        // Opens wherever the operator's browser sends geo links. Pasting
        // coordinates is the universal fallback; a link is the fast path.
        href={`https://www.google.com/maps/search/?api=1&query=${seen.lat},${seen.lng}`}
      />
      <div className={stale ? "text-[12px] text-danger" : "text-[12px] text-fg-muted"}>
        {stale
          ? `Silent for ${humanAge(seen.secondsAgo)} — they may have closed the app or lost signal.`
          : `Reported ${humanAge(seen.secondsAgo)} ago.`}
      </div>
    </div>
  );
}

/** A labelled value with a copy button, and optionally a link. */
function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  const valueRef = useRef<HTMLElement>(null);

  /**
   * Copy, and say so when it did not work.
   *
   * `navigator.clipboard` is permission-gated: it is refused without a user
   * gesture, over plain HTTP on some origins, and outright in embedded
   * browsers. Swallowing that — which the first version did — leaves an
   * operator clicking a button that does nothing, at the moment they are
   * trying to dial a number.
   *
   * So a failure selects the text instead and says which key to press. The
   * value always reaches the clipboard by one route or the other.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      window.setTimeout(() => setState("idle"), 1500);
      return;
    } catch {
      // Falls through to the selection path below.
    }

    const node = valueRef.current;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setState("select");
    window.setTimeout(() => setState("idle"), 4000);
  }

  return (
    <div>
      <div className="font-mono text-[11px] font-bold tracking-[1.5px] text-fg-muted">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {href ? (
          <a
            ref={valueRef as React.RefObject<HTMLAnchorElement>}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-[14px] text-accent-bright underline-offset-2 hover:underline"
          >
            {value}
          </a>
        ) : (
          <span
            ref={valueRef as React.RefObject<HTMLSpanElement>}
            className="min-w-0 flex-1 truncate text-[14px] text-fg"
          >
            {value}
          </span>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex-none rounded border border-line px-2 py-1 text-[11px] text-fg-muted hover:bg-panel hover:text-fg"
        >
          {state === "copied"
            ? "Copied"
            : state === "select"
              ? "Ctrl+C"
              : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    /*
     * A plain `<img>`, deliberately.
     *
     * The disable sits inside the fragment because the rule reports on the
     * element's own line — it was previously written above `return`, where it
     * looked like it applied and did not, which is why this warning survived
     * every earlier pass.
     *
     * Two reasons not to use `next/image` here. The URL is presigned and
     * expires, so there is no fixed host to put in `images.remotePatterns`.
     * And `next/image` would proxy and cache it through the panel — caching a
     * KYC photograph on a web server is not a trade worth making for an LCP
     * score on an internal tool.
     */
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="h-11 w-11 flex-none rounded-full object-cover"
        />
      </>
    );
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-panel text-[13px] font-bold text-fg-muted">
      {initials || "—"}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[12px] leading-[1.6] text-fg-muted">{children}</p>;
}

/**
 * Seconds as a duration, not a moment.
 *
 * Returns "23 min", never "23 min ago" — the caller supplies the preposition,
 * because the two readings need different ones. Baking "ago" in produced
 * "Silent for 23 min ago" on the first render, which is the kind of thing that
 * only shows up on screen.
 */
function humanAge(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}
