"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LanguagePreference } from "@/components/LanguagePreference";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { ApiError, type SettingRow, type SettingsResponse, api } from "@/lib/api";

/**
 * What this platform is configured to do.
 *
 * ## The question this answers
 *
 * Not "can we launch" — `/readiness` answers that, and every row there is
 * something missing. This answers **what are the numbers this business runs
 * on**: how long a job offer lives, how far dispatch reaches, how much cash a
 * partner may hold, what the smallest withdrawal is.
 *
 * Until this page those were knowable only by reading the source. An
 * operations lead asking "why has that partner stopped getting jobs" had no
 * way to discover an 8 km radius exists, and no way to check it without a
 * developer.
 *
 * ## Every row says where it is changed
 *
 * That is the part that makes it a settings page rather than trivia. A figure
 * with no provenance invites the question it was meant to answer; a figure
 * that names `CASH_IN_HAND_LIMIT_MINOR`, or links to `/pricing`, ends it.
 *
 * ## Read-only, and honestly so
 *
 * Most of these live in environment variables and code. A form that edited a
 * value the server reads from `process.env` would appear to work and change
 * nothing until the next deploy — which is precisely the confusion this page
 * exists to remove. Where something *is* editable, the row links to the page
 * that edits it.
 */
export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .settings()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "Could not load settings.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="Settings"
        subtitle={
          data === null
            ? "Loading…"
            : `What this platform is configured to do · ${data.environment}`
        }
      />

      {error ? (
        <EmptyState title="Could not load settings" hint={error} />
      ) : data === null ? (
        <SkeletonRows rows={8} />
      ) : (
        <>
          {/*
            A contents strip, because this page is long by design and the thing
            somebody arrived for is usually one row in one group. Anchors
            rather than tabs: the whole page stays printable and searchable
            with the browser's own find, which is how an operator actually
            hunts for "8 km".
          */}
          <nav
            aria-label="Sections"
            className="border-line mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y py-2"
          >
            {data.groups.map((group) => (
              <a
                key={group.key}
                href={`#${group.key}`}
                className="text-meta text-fg-muted hover:text-accent underline-offset-2 hover:underline"
              >
                {group.label}
              </a>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-4">
            {/* First, and client-side.
                Every other card on this page reflects server configuration;
                this one is a per-operator preference held in this browser. It
                is placed first because it is the only thing here somebody
                changes for themselves. */}
            <section id="language" className="scroll-mt-20">
              <Card size="lg" className="p-4">
                <SectionLabel>Language</SectionLabel>
                <p className="text-fg-muted text-meta mt-1 mb-3">
                  How this panel writes dates, times and amounts for you.
                </p>
                <LanguagePreference />
              </Card>
            </section>

            {data.groups.map((group) => (
              <section key={group.key} id={group.key} className="scroll-mt-20">
                <Card size="lg" className="p-4">
                  <SectionLabel>{group.label}</SectionLabel>
                  <p className="text-fg-muted text-meta mt-1 mb-3">
                    {group.detail}
                  </p>

                  <dl className="flex flex-col">
                    {group.rows.map((row) => (
                      <SettingLine key={row.label} row={row} />
                    ))}
                  </dl>
                </Card>
              </section>
            ))}
          </div>

          <p className="text-fg-faint text-meta mt-6 leading-relaxed">
            Values marked as an environment variable are set on the server and
            take effect on the next deploy. Nothing on this page is a secret —
            keys and passwords are never sent to the panel, only whether they
            are configured.
          </p>
        </>
      )}
    </div>
  );
}

function SettingLine({ row }: { row: SettingRow }) {
  return (
    <div className="border-line/60 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <dt className="text-body text-fg-soft">{row.label}</dt>
        <p className="text-fg-faint text-meta mt-0.5 leading-relaxed">
          {row.detail}
        </p>
      </div>

      <dd className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-fg font-mono text-body tabular-nums">
          {row.value}
        </span>
        <Provenance row={row} />
      </dd>
    </div>
  );
}

/**
 * Where the value comes from.
 *
 * Three kinds, and they are genuinely different actions: a panel page is a
 * click, an environment variable is a deploy, and a constant in code is a pull
 * request. Rendering them identically would flatten that into "somewhere
 * else", which is the answer people already had.
 */
function Provenance({ row }: { row: SettingRow }) {
  /*
   * Only an internal path becomes a link.
   *
   * `row.source` arrives from the server. It is built from a constant list
   * today, so nothing hostile can be in it — but this is the one href on the
   * page driven by response data rather than by a literal, and "the server
   * would never send that" is an assumption that survives exactly until
   * somebody makes the list configurable.
   *
   * A leading slash is the whole check: it admits `/pricing` and rejects
   * `javascript:`, `data:` and any absolute URL to somewhere else. Anything
   * that fails renders as plain text, which is the correct degradation — the
   * operator still learns where the setting lives.
   */
  const isInternalPath = row.source.startsWith("/") && !row.source.startsWith("//");

  if (row.sourceKind === "panel" && isInternalPath) {
    return (
      <Link
        href={row.source}
        className="text-accent text-meta underline-offset-2 hover:underline"
      >
        Change in {row.source} →
      </Link>
    );
  }

  return (
    <span
      className={`font-mono text-micro uppercase ${
        row.sourceKind === "env" ? "text-fg-muted" : "text-fg-faint"
      }`}
      title={
        row.sourceKind === "env"
          ? "Set on the server. Takes effect on the next deploy."
          : "A constant in the source. Changing it is a code change."
      }
    >
      {row.source}
    </span>
  );
}
