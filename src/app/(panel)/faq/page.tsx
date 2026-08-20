"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import {
  type FaqPayload,
  type KnowledgeAudience,
  type KnowledgeEntry,
  api,
} from "@/lib/api";

/**
 * The browsable half of the knowledge base.
 *
 * WUDA answers a question you can already phrase. This is for the other case —
 * not knowing what to ask, which is most of a new operator's first fortnight.
 * Everything here is the same corpus the assistant answers from, filtered to
 * what your role may read, so the two can never disagree.
 *
 * ## Why filtering happens here and searching happens here too
 *
 * The list is small — tens of entries, not thousands — so the whole visible set
 * arrives in one request and every keystroke filters it in memory. That makes
 * search instant and works with the API down, which matters because "how do I
 * check whether the API is down" is one of the questions on this page.
 *
 * Scoring is deliberately cruder than the server's: a question-title match
 * outranks a body match and that is the whole rule. The server has Postgres
 * full-text and trigram similarity for the hard cases; this only has to beat
 * scrolling.
 */
const AUDIENCE_LABEL: Record<KnowledgeAudience, string> = {
  everyone: "All staff",
  internal: "Internal",
  restricted: "Owner only",
};

const AUDIENCE_TONE: Record<KnowledgeAudience, string> = {
  everyone: "border-edge text-fg-muted",
  internal: "border-accent/50 text-accent",
  restricted: "border-danger/50 text-danger",
};

export default function FaqPage() {
  const [data, setData] = useState<FaqPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .faq()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load the FAQ.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);

    return data.entries
      .filter((e) => (category ? e.category === category : true))
      .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.question.localeCompare(b.entry.question))
      .map((r) => r.entry);
  }, [data, query, category]);

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Questions and answers"
        subtitle={
          data
            ? `${data.entries.length} answers you can read. Ask WUDA if yours is not here.`
            : "How the business works, and how to use this panel."
        }
        actions={
          <Link
            href="/wuda"
            className="motion-change chamfer-sm grad-accent px-4 py-2 text-body
                       font-semibold text-on-accent-bright transition-opacity
                       hover:opacity-90"
          >
            Ask WUDA
          </Link>
        }
      />

      <Card tone="raised" className="p-4">
        <SectionLabel>Search</SectionLabel>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="cancel a delivery, cod, why can't a partner go on duty"
          aria-label="Search questions and answers"
          className="h-10 w-full border border-edge bg-surface rounded-xs px-3 text-body
                     text-fg outline-none transition-colors placeholder:text-fg-faint
                     focus:border-accent"
        />

        {/* Chips rather than a select: the whole point is seeing what
            categories exist without having to open something first. */}
        {data && data.categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip
              label="Everything"
              active={category === null}
              onClick={() => setCategory(null)}
            />
            {data.categories.map((c) => (
              <Chip
                key={c}
                label={c}
                active={category === c}
                onClick={() => setCategory(category === c ? null : c)}
              />
            ))}
          </div>
        )}

        {data && (
          <p className="mt-3 text-meta text-fg-faint">
            {results.length === data.entries.length
              ? `Showing all ${results.length}.`
              : `${results.length} of ${data.entries.length}.`}{" "}
            You are seeing entries marked{" "}
            {data.audiences.map((a) => AUDIENCE_LABEL[a]).join(", ").toLowerCase()}.
          </p>
        )}
      </Card>

      {error && (
        <Card tone="critical" className="p-5">
          <p className="text-body text-danger">{error}</p>
          <p className="mt-1 text-meta text-fg-muted">
            The answers live on the server, so this page needs it reachable.
          </p>
        </Card>
      )}

      {!data && !error && <SkeletonRows rows={6} />}

      {data && results.length === 0 && (
        <EmptyState
          title="Nothing matches that"
          hint="Try fewer words, or ask WUDA — it searches the same answers and can piece two of them together."
        />
      )}

      <div className="space-y-2">
        {results.map((entry) => (
          <Card key={entry.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(open === entry.id ? null : entry.id)}
              aria-expanded={open === entry.id}
              className="motion-change flex w-full items-start gap-3 px-4 py-3 text-left
                         transition-colors hover:bg-panel"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-label font-medium text-fg">
                  {entry.question}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-micro uppercase text-fg-faint">
                    {entry.category}
                  </span>
                  {entry.audience !== "everyone" && (
                    <span
                      className={`border px-1.5 font-mono text-micro uppercase ${AUDIENCE_TONE[entry.audience]}`}
                    >
                      {AUDIENCE_LABEL[entry.audience]}
                    </span>
                  )}
                  {/* Worth distinguishing: a curated answer was reviewed with
                      the code it describes, a note is somebody's word. */}
                  {entry.kind === "note" && (
                    <span className="border border-edge px-1.5 font-mono text-micro uppercase text-fg-faint">
                      Staff note
                    </span>
                  )}
                </span>
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden
                className="mt-1.5 shrink-0 text-fg-faint transition-transform duration-200
                           ease-[var(--ease-out-quint)] motion-reduce:transition-none"
                style={{
                  transform: open === entry.id ? "rotate(180deg)" : "none",
                }}
              >
                <path
                  d="M2 3.5L5 6.5l3-3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="square"
                />
              </svg>
            </button>

            {open === entry.id && (
              <div className="motion-enter border-t border-line px-4 py-3">
                <p className="whitespace-pre-line text-body leading-relaxed text-fg-soft">
                  {entry.answer}
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Every term must appear somewhere, and where it appears decides the weight.
 *
 * AND rather than OR across terms: "partner duty" should find the entry about
 * partners going on duty, not every entry mentioning either word. That was the
 * same fix the address search needed.
 */
function scoreEntry(entry: KnowledgeEntry, terms: string[]): number {
  if (terms.length === 0) return 1;

  const question = entry.question.toLowerCase();
  const tags = entry.tags.join(" ").toLowerCase();
  const answer = entry.answer.toLowerCase();

  let total = 0;
  for (const term of terms) {
    if (question.includes(term)) total += 4;
    else if (tags.includes(term)) total += 3;
    else if (answer.includes(term)) total += 1;
    else return 0;
  }
  return total;
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`motion-change chamfer-sm border px-2.5 py-1 font-mono text-micro
                  uppercase transition-colors ${
                    active
                      ? "border-accent bg-accent text-on-accent"
                      : "border-edge text-fg-muted hover:border-accent hover:text-accent"
                  }`}
    >
      {label}
    </button>
  );
}
