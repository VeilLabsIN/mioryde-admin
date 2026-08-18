"use client";

import { useState } from "react";
import { Button, Card, GhostButton, SectionLabel } from "./ui";
import { useToast } from "./ToastProvider";
import { ApiError } from "@/lib/api";

/**
 * An action that changes something, with the consequence stated before it.
 *
 * The house pattern for anything irreversible, generalised from the agreement
 * page — which already got this right by making the operator type the version
 * number and telling them how many partners would be stood down.
 *
 * Three rules, all of them learned from that screen:
 *
 * 1. **Say the consequence in numbers, not adjectives.** "This will stand down
 *    34 partners" is a decision; "this is irreversible" is a warning nobody
 *    reads twice.
 * 2. **A refusal explains itself.** When the server will not allow something,
 *    the button is disabled *and* the reason is beside it. A greyed-out control
 *    with no explanation reads as a broken panel.
 * 3. **Require a reason where one will be wanted later.** An intervention with
 *    no recorded why is one nobody can review.
 */
export function ActionPanel({
  title,
  description,
  consequence,
  actionLabel,
  disabledReason,
  requireReason,
  reasonPlaceholder,
  destructive = false,
  onConfirm,
  successMessage,
}: {
  title: string;
  description: string;
  /** What will happen, in concrete terms. Shown once the operator commits. */
  consequence?: string;
  actionLabel: string;
  /** Non-null disables the action and is shown in place of it. */
  disabledReason?: string | null;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  successMessage: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const blocked = Boolean(disabledReason);
  // Three characters is the server's own minimum, checked here so the operator
  // learns it before submitting rather than after typing a reason and losing it.
  const reasonOk = !requireReason || reason.trim().length >= 3;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      toast.success(successMessage);
      setConfirming(false);
      setReason("");
    } catch (caught: unknown) {
      // The server's sentence, not a generic failure. These refusals are
      // policy — already paid, already cancelled, already blocked — and each
      // one tells the operator something they need.
      setError(
        caught instanceof ApiError ? caught.message : "That did not work.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone={destructive ? "warning" : "default"} className="p-4">
      <SectionLabel>{title}</SectionLabel>
      <p className="text-body text-fg-soft">{description}</p>

      {blocked ? (
        // Disabled *and* explained. The explanation comes from the server, so
        // it cannot drift from the rule that produces it.
        <p className="mt-3 text-meta text-fg-faint">
          <span className="text-warn">Not available.</span> {disabledReason}
        </p>
      ) : !confirming ? (
        <div className="mt-3">
          <GhostButton
            onClick={() => setConfirming(true)}
            className={destructive ? "hover:border-danger hover:text-danger" : ""}
          >
            {actionLabel}
          </GhostButton>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {consequence && (
            <p className="text-meta text-warn">{consequence}</p>
          )}

          {requireReason && (
            <div>
              <label
                htmlFor={`reason-${title}`}
                className="mb-1 block text-micro font-mono uppercase text-fg-muted"
              >
                Reason (recorded in the audit log)
              </label>
              <textarea
                id={`reason-${title}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder={reasonPlaceholder}
                className="motion-change w-full border border-edge bg-panel px-3 py-2
                           text-body text-fg transition-colors placeholder:text-fg-faint
                           focus:border-accent"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-meta text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void confirm()}
              loading={busy}
              disabled={!reasonOk || busy}
            >
              {actionLabel}
            </Button>
            <GhostButton
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </GhostButton>
            {requireReason && !reasonOk && (
              <span className="text-meta text-fg-faint">
                A reason is required.
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
