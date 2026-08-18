"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type BannerTone = "critical" | "warning";

export interface BannerItem {
  id: string;
  tone: BannerTone;
  title: string;
  detail: string;
  action: { label: string; href: string };
}

/**
 * How many are shown at once.
 *
 * Two. A banner is an interruption, and a stack of five is a wall the operator
 * learns to scroll past — at which point the one that mattered is hidden by the
 * four that did not.
 */
const MAX_VISIBLE = 2;

/** Re-checked occasionally; configuration does not change mid-shift. */
const POLL_MS = 5 * 60_000;

/**
 * Things wrong with the system, wherever the operator happens to be.
 *
 * The panel knew all of this already and said none of it unless you opened the
 * right page: monitoring knows when the ledger does not balance and when events
 * are being abandoned, readiness knows the GSTIN is a placeholder. An operator
 * working the payout queue had no way to learn any of it.
 *
 * Every banner carries an action. A notice that tells you something is wrong and
 * leaves you to find the page is a notice that gets ignored the second time.
 */
export function useAttention(): BannerItem[] {
  const [items, setItems] = useState<BannerItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const next: BannerItem[] = [];

      // Both are role-gated, and support can read neither. A 403 here is a
      // policy outcome, not a failure — it means this operator has no action
      // on any of it, so they get no banner rather than an error.
      const [monitoring, readiness] = await Promise.allSettled([
        api.monitoring(),
        api.readiness(),
      ]);

      if (monitoring.status === "fulfilled") {
        const m = monitoring.value;

        // First, and the only thing here that is about money being wrong
        // rather than something being slow or unconfigured.
        if (
          m.ledger.unbalancedTransactions > 0 ||
          m.ledger.driftingAccounts > 0 ||
          m.ledger.netMinor !== 0
        ) {
          next.push({
            id: "ledger",
            tone: "critical",
            title: "The ledger does not balance",
            detail:
              "Postings that do not sum to zero, or a stored balance that disagrees with its lines. Stop and investigate before settling anything.",
            action: { label: "Open monitoring", href: "/monitoring" },
          });
        }

        if (m.outbox.deadLettered > 0) {
          next.push({
            id: "outbox",
            tone: "warning",
            title: `${m.outbox.deadLettered} notification${m.outbox.deadLettered === 1 ? "" : "s"} abandoned`,
            detail:
              "These ran out of retries and the worker will never look at them again. Somebody was not told something.",
            action: { label: "See why", href: "/monitoring" },
          });
        }
      }

      if (readiness.status === "fulfilled") {
        const outstanding = readiness.value.checks.filter(
          (check) => check.blocking && !check.ready,
        );

        // One banner for all of them rather than one each. Six separate
        // notices about a system that is not launched yet is not six pieces of
        // information, it is one.
        if (outstanding.length > 0) {
          const gstin = outstanding.find((c) => c.key === "gstin");
          next.push({
            id: "readiness",
            // Critical only when invoices are actively being issued against a
            // placeholder registration — that produces invalid documents that
            // cannot be edited afterwards, only credited.
            tone: gstin ? "critical" : "warning",
            title: gstin
              ? "Invoices are being issued against a placeholder GSTIN"
              : `${outstanding.length} launch blocker${outstanding.length === 1 ? "" : "s"} outstanding`,
            detail: gstin
              ? `${gstin.detail} ${outstanding.length - 1} other blocker${outstanding.length === 2 ? "" : "s"} outstanding.`
              : outstanding.map((c) => c.label).join(", ") + ".",
            action: { label: "Open readiness", href: "/readiness" },
          });
        }
      }

      if (!cancelled) setItems(next);
    };

    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return items;
}

const TONE: Record<BannerTone, string> = {
  critical: "border-danger/60 bg-danger/10",
  warning: "border-warn/60 bg-warn/10",
};

const TONE_TEXT: Record<BannerTone, string> = {
  critical: "text-danger",
  warning: "text-warn",
};

/**
 * The banner strip, rendered above every page.
 *
 * Severity, consequence and remedy in one sentence with the remedy one click
 * away — the pattern the Google Workspace console uses for a pending payment or
 * an unverified domain, and it works because there is nothing to go and find.
 *
 * **Critical banners cannot be dismissed.** A warning can be acknowledged for
 * the session; an unbalanced ledger cannot, because the only thing that should
 * make it go away is it no longer being true.
 */
export function BannerStrip() {
  const items = useAttention();
  const [dismissed, setDismissed] = useState<string[]>([]);

  const visible = items
    .filter((item) => item.tone === "critical" || !dismissed.includes(item.id))
    // Critical first, so the worst thing is never below the fold.
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "critical" ? -1 : 1))
    .slice(0, MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 px-6 pt-4">
      {visible.map((item) => (
        <div
          key={item.id}
          role={item.tone === "critical" ? "alert" : "status"}
          className={`motion-enter corner-cut flex flex-wrap items-start justify-between
                      gap-3 border px-4 py-3 ${TONE[item.tone]}`}
        >
          <div className="min-w-0">
            <p className={`text-body font-medium ${TONE_TEXT[item.tone]}`}>
              {item.title}
            </p>
            <p className="text-meta text-fg-soft">{item.detail}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={item.action.href}
              className="motion-change border border-edge px-3 py-1.5 text-micro font-mono
                         uppercase text-fg-mid transition-colors hover:border-accent
                         hover:text-accent"
            >
              {item.action.label}
            </Link>
            {item.tone !== "critical" && (
              <button
                type="button"
                onClick={() => setDismissed((d) => [...d, item.id])}
                aria-label={`Dismiss: ${item.title}`}
                className="motion-change px-1.5 py-0.5 text-fg-faint transition-colors
                           hover:text-fg"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
