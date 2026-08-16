"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  GhostButton,
  SectionLabel,
  SkeletonRows,
  PageHeader,
} from "@/components/ui";
import { ApiError, type PendingBankAccount, api } from "@/lib/api";

/**
 * Bank account verification.
 *
 * ## Why this screen decides whether anybody gets paid
 *
 * The nightly payout batch pays only verified accounts. Until somebody
 * approves an account here it is a guess about where money should go, and the
 * batch skips it — so with no screen, the batch pays nobody, ever.
 *
 * ## What an approval actually asserts
 *
 * That this account belongs to this partner. Today that is a human judgement
 * against the KYC name; §4.11 wants a penny-drop through a verification vendor,
 * which is the only thing that proves it. The distinction matters when reading
 * the change count below: a partner who has repointed their account three times
 * in a week is the pattern account takeover produces, and it is the one signal
 * this screen has that a name check does not give.
 */
export default function BankingPage() {
  const [accounts, setAccounts] = useState<PendingBankAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response landing after a newer one and repainting
  // the list with stale rows.
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setError(null);
    setAccounts(null);

    api
      .pendingBankAccounts()
      .then((result) => {
        if (id === requestId.current) setAccounts(result?.results ?? []);
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load accounts waiting to be checked.",
        );
      });
  }, []);

  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank verification"
        subtitle="Partners are paid only into accounts checked here. Anything left unchecked is skipped by the nightly payout run."
      />

      {error ? (
        <Card>
          <p className="text-warn text-sm">{error}</p>
          <Button className="mt-3" onClick={load}>
            Try again
          </Button>
        </Card>
      ) : null}

      {accounts === null ? (
        <SkeletonRows />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          hint="Every partner account has been checked."
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.riderId}
              account={account}
              onDone={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  account,
  onDone,
}: {
  account: PendingBankAccount;
  onDone: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      await api.verifyBankAccount(account.riderId, approve, note || undefined);
      onDone();
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : "Could not save that.",
      );
      setBusy(false);
    }
  };

  // First submission versus a repointed account. The second is the shape
  // account takeover takes, and it deserves a different reading.
  const isChange = account.changeCount > 1;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <SectionLabel>Partner</SectionLabel>
          <p className="font-medium">{account.riderName}</p>
        </div>

        <div className="space-y-1">
          <SectionLabel>Account</SectionLabel>
          {/* Tabular figures so a reviewer can compare digits down a column. */}
          <p className="font-mono tabular-nums">{account.accountMasked}</p>
          <p className="text-fg-faint font-mono text-sm">{account.ifsc}</p>
        </div>

        <div className="space-y-1">
          <SectionLabel>Holder name</SectionLabel>
          <p>{account.holderName}</p>
          <p className="text-fg-faint text-xs">
            Must match their KYC documents
          </p>
        </div>
      </div>

      {isChange ? (
        <p className="text-warn mt-4 text-sm">
          Changed {account.changeCount} times. A recently repointed account is
          how a taken-over partner account is drained — check this against their
          documents rather than approving on the name alone.
        </p>
      ) : null}

      {problem ? <p className="text-warn mt-3 text-sm">{problem}</p> : null}

      {rejecting ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What is wrong with it? The partner does not see this — it is for the next reviewer."
            rows={2}
            maxLength={300}
            className="border-edge bg-bg w-full rounded border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={() => decide(false)} disabled={busy}>
              Confirm rejection
            </Button>
            <GhostButton onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </GhostButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => decide(true)} disabled={busy}>
            Approve for payout
          </Button>
          <GhostButton onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </GhostButton>
        </div>
      )}
    </Card>
  );
}
