"use client";

import { useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { type Readiness, type ReadinessCheck, api } from "@/lib/api";

const CATEGORY_LABEL: Record<ReadinessCheck["category"], string> = {
  legal: "Legal",
  payments: "Payments",
  messaging: "Messaging",
  storage: "Storage",
  operations: "Operations",
};

/**
 * What still stands between this build and taking real orders.
 *
 * ## Why it is computed, not written down
 *
 * The launch blockers currently live in three documents — `context.md`,
 * `.env.example` and `Bugs.md` — and a list somebody has to remember to edit is
 * a list that is wrong exactly when it matters. Every row here is derived from
 * configuration and data at request time, so it cannot be stale.
 *
 * ## Blocking versus degraded
 *
 * The distinction is the whole point. A blocker means the platform cannot
 * legally or functionally operate; everything else means something is worse
 * than it should be. A checklist that treats "no masked calling" the same as
 * "no GST registration" is one nobody finishes reading.
 */
export default function ReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .readiness()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load readiness.",
        ),
      );
  };

  useEffect(load, []);

  const blockers = data?.checks.filter((c) => c.blocking && !c.ready) ?? [];
  const degraded = data?.checks.filter((c) => !c.blocking && !c.ready) ?? [];
  const done = data?.checks.filter((c) => c.ready) ?? [];

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Launch readiness"
        subtitle={
          data
            ? `${data.summary.ready} of ${data.summary.total} checks passing · ${data.summary.blockingOutstanding} of ${data.summary.blockingTotal} blockers outstanding`
            : "Checking configuration…"
        }
        actions={<GhostButton onClick={load}>Re-check</GhostButton>}
      />

      {error ? (
        <EmptyState title="Could not load readiness" hint={error} />
      ) : !data ? (
        <Card className="overflow-hidden">
          <SkeletonRows rows={6} />
        </Card>
      ) : (
        <>
          {/* The headline is the blocker count, not the passing count. A
              progress bar that reads 3/9 invites relief; "5 blockers" does
              not. */}
          <Card
            tone={data.summary.blockingOutstanding > 0 ? "critical" : "ok"}
            className="p-5"
          >
            <SectionLabel>
              {data.summary.blockingOutstanding > 0
                ? "Not ready to launch"
                : "No blockers outstanding"}
            </SectionLabel>
            <p className="text-body text-fg-soft">
              {data.summary.blockingOutstanding > 0 ? (
                <>
                  <span className="font-mono tabular-nums">
                    {data.summary.blockingOutstanding}
                  </span>{" "}
                  of {data.summary.blockingTotal} things the platform cannot
                  operate without are still missing. Each is a credential or a
                  document somebody has to obtain — none of them is code.
                </>
              ) : (
                <>
                  Every blocking requirement is satisfied. The degraded items
                  below are worth doing but do not stop a launch.
                </>
              )}
            </p>
          </Card>

          {blockers.length > 0 && (
            <section>
              <SectionLabel>Blocking</SectionLabel>
              <div className="space-y-2">
                {blockers.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </div>
            </section>
          )}

          {degraded.length > 0 && (
            <section>
              <SectionLabel>Degraded, but working</SectionLabel>
              <div className="space-y-2">
                {degraded.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <SectionLabel>Ready</SectionLabel>
              <div className="space-y-2">
                {done.map((check) => (
                  <CheckRow key={check.key} check={check} />
                ))}
              </div>
            </section>
          )}

          <p className="text-meta text-fg-faint">
            Checked {new Date(data.checkedAt).toLocaleString("en-IN")}. Every row
            is read from live configuration, so this page cannot go stale — but
            it can only see what is configurable. It cannot tell you whether a
            real GSTIN belongs to the right entity, or whether the agreement text
            has actually been through counsel.
          </p>
        </>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  return (
    <Card
      tone={check.ready ? "default" : check.blocking ? "critical" : "warning"}
      className="p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-medium">
            {check.label}
            <span className="ml-2 text-micro font-mono uppercase text-fg-faint">
              {CATEGORY_LABEL[check.category]}
            </span>
          </p>
          <p className="mt-0.5 text-meta text-fg-soft">{check.detail}</p>
        </div>

        {/* Words, not a tick. A green check and a red cross at 9px are the same
            shape to anyone who cannot distinguish the colours. */}
        <span
          className={`shrink-0 border px-2 py-0.5 text-micro font-mono uppercase ${
            check.ready
              ? "border-ok/40 text-ok"
              : check.blocking
                ? "border-danger/40 text-danger"
                : "border-warn/40 text-warn"
          }`}
        >
          {check.ready ? "Ready" : check.blocking ? "Blocking" : "Degraded"}
        </span>
      </div>
    </Card>
  );
}
