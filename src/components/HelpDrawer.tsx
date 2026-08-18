"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type HelpTopic, helpForPath, searchHelp } from "@/lib/help";

/**
 * Answers "what is this screen for" without leaving the screen.
 *
 * A separate help *page* is where documentation goes to be unread: it costs a
 * navigation, and the thing you wanted explained is no longer in front of you.
 * This opens beside the page instead, already showing the entry for wherever
 * you are, with a search box for everything else.
 *
 * Opens on `?` — the shortcut people already try — and never while they are
 * typing into something, because `?` is also a character.
 *
 * Mounted only while open. That is what gives each opening a fresh search box
 * without an effect watching its own visibility to clear one.
 */
export function HelpDrawer({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const contextual = useMemo(() => helpForPath(pathname), [pathname]);
  const results = useMemo(() => searchHelp(query), [query]);
  const showing: HelpTopic[] = query.trim()
    ? results
    : contextual
      ? [contextual]
      : [];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        onClick={(event) => event.stopPropagation()}
        className="animate-slide-in absolute right-0 top-0 flex h-dvh
                   w-[min(440px,92vw)] flex-col border-l border-edge-strong
                   bg-raised shadow-2xl"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3
                        border-b border-line px-4">
          <span className="font-mono text-micro uppercase text-accent">
            Help
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="motion-change border border-edge px-2 py-1 font-mono
                       text-micro uppercase text-fg-muted transition-colors
                       hover:border-accent hover:text-accent"
          >
            Esc
          </button>
        </div>

        <div className="shrink-0 border-b border-line p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask about anything in the panel"
            aria-label="Search help"
            className="motion-change w-full border border-edge bg-panel px-3 py-2
                       text-body text-fg outline-none transition-colors
                       placeholder:text-fg-faint focus:border-accent"
          />
          {!query.trim() && contextual && (
            <p className="mt-2 text-meta text-fg-faint">
              Showing help for this page. Type to search everything.
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {showing.length === 0 ? (
            <p className="py-8 text-center text-meta text-fg-faint">
              {query.trim()
                ? `Nothing about “${query.trim()}” yet.`
                : "No help written for this page yet."}
            </p>
          ) : (
            <div className="space-y-6">
              {showing.map((topic) => (
                <TopicBody key={topic.href} topic={topic} onNavigate={onClose} />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-4 py-3">
          <Link
            href="/help"
            onClick={onClose}
            className="motion-change text-meta text-fg-muted transition-colors
                       hover:text-accent"
          >
            All help topics →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TopicBody({
  topic,
  onNavigate,
}: {
  topic: HelpTopic;
  onNavigate?: () => void;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="text-label font-semibold">{topic.title}</h3>
        <Link
          href={topic.href}
          onClick={onNavigate}
          className="motion-change shrink-0 font-mono text-micro uppercase
                     text-fg-muted transition-colors hover:text-accent"
        >
          Open
        </Link>
      </div>

      <p className="text-body text-fg-soft">{topic.purpose}</p>

      {topic.tasks && topic.tasks.length > 0 && (
        <>
          <p className="mt-3 font-mono text-micro uppercase text-fg-muted">
            What people do here
          </p>
          <ul className="mt-1 space-y-1">
            {topic.tasks.map((task) => (
              <li key={task} className="flex gap-2 text-body text-fg-soft">
                <span aria-hidden className="text-fg-faint">
                  ·
                </span>
                <span>{task}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {topic.notes && topic.notes.length > 0 && (
        <>
          {/* The section that actually prevents support calls: behaviour that
              is correct and unobvious. */}
          <p className="mt-3 font-mono text-micro uppercase text-fg-muted">
            Worth knowing
          </p>
          <ul className="mt-1 space-y-1.5">
            {topic.notes.map((note) => (
              <li
                key={note}
                className="border-l-2 border-edge pl-2.5 text-meta text-fg-mid"
              >
                {note}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
