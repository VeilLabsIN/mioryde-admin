"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageHeader, Card, SectionLabel } from "@/components/ui";
import { TopicBody } from "@/components/HelpDrawer";
import { HELP_TOPICS, searchHelp } from "@/lib/help";
import { useUrlParam } from "@/lib/useUrlState";

/**
 * Every help topic on one page.
 *
 * The drawer is for a question you have while working. This is for reading
 * through — a new operator on their first morning, or somebody deciding
 * whether a role should have access to something.
 *
 * Deliberately not in the sidebar: the nav is organised by capability and this
 * belongs to everyone. It is reachable from the ? in the top bar, from the
 * drawer, and by URL.
 */
export default function HelpPage() {
  const [query, setQuery] = useUrlParam("q", "");

  const topics = useMemo(
    () => (query.trim() ? searchHelp(query) : HELP_TOPICS),
    [query],
  );

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Help"
        subtitle="What every screen is for, and the behaviour that surprises people."
      />

      <Card className="p-4">
        <label
          htmlFor="help-search"
          className="mb-1 block font-mono text-micro uppercase text-fg-muted"
        >
          Search
        </label>
        <input
          id="help-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="blocking a customer, cash in hand, why can't a partner go on duty"
          className="motion-change w-full border border-edge bg-panel px-3 py-2
                     text-body text-fg outline-none transition-colors
                     placeholder:text-fg-faint focus:border-accent"
        />
        <p className="mt-2 text-meta text-fg-faint">
          Searches everything a topic says, not just its title — the answers to
          most questions live in the “worth knowing” notes.
        </p>
      </Card>

      {topics.length === 0 ? (
        <Card className="p-6">
          <p className="text-center text-meta text-fg-faint">
            Nothing about “{query.trim()}” yet. Try fewer words.
          </p>
        </Card>
      ) : (
        <Card tone="raised" className="divide-y divide-line">
          {topics.map((topic) => (
            <div key={topic.href} className="p-5">
              <TopicBody topic={topic} />
            </div>
          ))}
        </Card>
      )}

      <Card className="p-4">
        <SectionLabel>Shortcuts</SectionLabel>
        <dl className="grid gap-2 sm:grid-cols-2">
          <Shortcut keys="Ctrl K" what="Go to any page" />
          <Shortcut keys="?" what="Open help for the page you are on" />
          <Shortcut keys="Esc" what="Close whatever is open" />
        </dl>
      </Card>

      <p className="text-meta text-fg-faint">
        Something here wrong or missing?{" "}
        <Link href="/legal" className="text-accent hover:underline">
          Policies and contacts
        </Link>
        .
      </p>
    </div>
  );
}

function Shortcut({ keys, what }: { keys: string; what: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[64px] shrink-0">
        <kbd className="font-mono text-micro uppercase text-fg-mid">{keys}</kbd>
      </dt>
      <dd className="text-body text-fg-soft">{what}</dd>
    </div>
  );
}
