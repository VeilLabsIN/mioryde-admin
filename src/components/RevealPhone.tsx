"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api";

/**
 * Shows a masked number, and reveals the real one on request.
 *
 * The masked value comes from the server already masked — this component never
 * receives the full number until somebody asks for it, so there is nothing here
 * for a screenshot, an extension or the network tab to pick up in the meantime.
 *
 * The reveal is audited server-side. Deliberately not mentioned in a tooltip or
 * a confirmation dialog: an operator calling a partner about a stuck delivery
 * is doing their job, and a warning prompt would imply otherwise. The record
 * exists for review after the fact, not to discourage the action.
 */
export function RevealPhone({
  riderId,
  masked,
  className = "",
}: {
  riderId: string;
  masked: string;
  className?: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    if (busy || revealed) return;
    setBusy(true);
    setError(null);
    try {
      const { phone } = await api.revealRiderPhone(riderId);
      setRevealed(phone);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Could not retrieve the number. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (revealed) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {/* Selectable: the point of revealing is usually to copy it. */}
        <span className="select-all font-mono text-[13px]">{revealed}</span>
        <span className="text-[10px] uppercase tracking-wide text-fg-faint">
          logged
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-mono text-[13px] text-fg-mid">{masked}</span>
      <button
        type="button"
        onClick={reveal}
        disabled={busy}
        // Named for what it does rather than "show": an operator should know
        // this is a request to the server, not a local toggle.
        aria-label="Reveal full phone number. This is recorded."
        className="border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide
                   text-fg-faint transition-colors duration-150
                   hover:border-accent hover:text-accent
                   disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "…" : "Reveal"}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
