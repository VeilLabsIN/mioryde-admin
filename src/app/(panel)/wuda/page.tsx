"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnswerText } from "@/components/AnswerText";
import { useAdmin } from "@/components/AdminProvider";
import { Button, Card, PageHeader, SectionLabel, Spinner } from "@/components/ui";
import { type KnowledgeAudience, type WudaAnswer, api } from "@/lib/api";
import { can } from "@/lib/permissions";

/**
 * WUDA.
 *
 * ## What it is honest about
 *
 * Three answer modes, and the page shows which one you got. A **grounded**
 * answer was composed by a model from entries retrieved for your question. A
 * **retrieval** answer means the model was unavailable and you are looking at
 * the matching entries verbatim — useful, but it may not address what you
 * actually asked, and pretending otherwise is how an assistant loses the
 * benefit of the doubt. **Unanswered** means nothing matched.
 *
 * Sources are always listed. An answer you cannot check is an answer you have
 * to trust, and this panel moves real money.
 *
 * ## Why the transcript is not persisted
 *
 * It lives in component state and dies with the page. The questions themselves
 * are logged server-side — that is how the gaps get found — but a chat history
 * sitting in a browser on a shared machine is a small pile of "what was
 * everyone confused about" that nobody asked to keep.
 */
interface Turn {
  question: string;
  answer: WudaAnswer | null;
}

/**
 * How each mode is labelled.
 *
 * Every answer carries one, including the good case. A badge that only appears
 * when something is wrong trains people not to look at it; one that is always
 * there is read once and then trusted, which is the point — "WUDA answered
 * this" and "here is what matched your words" are different claims and the
 * reader is entitled to know which they are holding.
 */
const MODE: Record<
  WudaAnswer["mode"],
  { label: string; tone: string; note: string | null }
> = {
  grounded: {
    label: "Answered",
    tone: "border-accent-alt/50 text-accent-alt",
    note: null,
  },
  retrieval: {
    label: "From the knowledge base",
    tone: "border-warn/50 text-warn",
    note: "The assistant could not be reached, so these are the closest matching entries shown exactly as written. They may not answer what you actually asked.",
  },
  unanswered: {
    label: "Nothing found",
    tone: "border-edge text-fg-muted",
    note: null,
  },
};

export default function WudaPage() {
  const admin = useAdmin();
  const [starters, setStarters] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .starters()
      .then((r) => {
        if (!cancelled) setStarters(r.starters);
      })
      .catch(() => {
        // Starters are a convenience. Losing them leaves a working input box,
        // which is the part that matters.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);
    setInput("");
    setTurns((t) => [...t, { question: q, answer: null }]);

    try {
      const answer = await api.ask(q);
      setTurns((t) =>
        t.map((turn, i) => (i === t.length - 1 ? { ...turn, answer } : turn)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach WUDA.");
      // The pending turn is removed rather than left spinning forever.
      setTurns((t) => t.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-[900px] flex-col gap-5">
      <PageHeader
        title="WUDA"
        subtitle="Ask anything about how Mioryde works or how to use this panel. Answers come from a reviewed knowledge base, and every one shows its sources."
        actions={
          <Link
            href="/faq"
            className="motion-change border border-edge px-3 py-2 font-mono text-micro
                       uppercase text-fg-mid transition-colors hover:border-accent
                       hover:text-accent"
          >
            Browse all answers
          </Link>
        }
      />

      {turns.length === 0 && (
        <Card tone="raised" className="p-5">
          <SectionLabel>Start with one of these</SectionLabel>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="motion-change group border border-line p-3 text-left
                           transition-colors hover:border-accent"
              >
                <span className="block text-body text-fg-soft group-hover:text-accent">
                  {s}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-meta text-fg-faint">
            WUDA answers from what it has been told, and says so when it has not
            been told. It cannot cancel a delivery, release a payout, or give
            out anyone&rsquo;s personal details.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {turns.map((turn, i) => (
          <div key={i} className="motion-enter space-y-2.5">
            {/* The question, offset right and quieter than the answer. A
                transcript where both sides look the same is one you have to
                read to navigate. */}
            <div className="flex justify-end">
              <p
                className="chamfer-sm max-w-[80%] border border-line bg-panel px-3.5 py-2
                           text-body text-fg-soft"
              >
                {turn.question}
              </p>
            </div>

            {turn.answer === null ? (
              <div className="flex items-center gap-2.5">
                <WudaMark />
                <span className="flex items-center gap-2 text-meta text-fg-muted">
                  <Spinner className="size-3.5" />
                  Looking it up…
                </span>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <WudaMark />

                <Card
                  tone={turn.answer.mode === "unanswered" ? "warning" : "default"}
                  className="min-w-0 flex-1 p-4"
                >
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`border px-1.5 font-mono text-micro uppercase ${MODE[turn.answer.mode].tone}`}
                    >
                      {MODE[turn.answer.mode].label}
                    </span>
                    {turn.answer.sources.length > 0 && (
                      <span className="font-mono text-micro uppercase text-fg-faint">
                        {turn.answer.sources.length} source
                        {turn.answer.sources.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  {MODE[turn.answer.mode].note && (
                    <p className="mb-3 border-l-2 border-warn pl-3 text-meta text-warn">
                      {MODE[turn.answer.mode].note}
                    </p>
                  )}

                  <AnswerText text={turn.answer.answer} />

                  {turn.answer.sources.length > 0 && (
                    <details className="group mt-4 border-t border-line pt-3">
                      {/* Collapsed by default. The sources matter and should be
                          one click away, but printed in full under every answer
                          they become the thing you scroll past to reach the
                          next question. */}
                      <summary
                        className="motion-change cursor-pointer list-none font-mono text-micro
                                   uppercase text-fg-faint transition-colors hover:text-accent"
                      >
                        Answered from {turn.answer.sources.length} entr
                        {turn.answer.sources.length === 1 ? "y" : "ies"}
                        <span aria-hidden className="ml-1 inline-block transition-transform group-open:rotate-180">
                          ▾
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {turn.answer.sources.map((s) => (
                          <li key={s.id} className="text-meta text-fg-muted">
                            {s.question}
                            <span className="text-fg-faint"> · {s.category}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Card>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="border-l-2 border-danger pl-3 text-body text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="sticky bottom-0 flex gap-2 border-t border-line bg-bg pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask WUDA anything about Mioryde…"
          aria-label="Your question"
          className="h-11 min-w-0 flex-1 border border-edge bg-surface rounded-xs px-3 text-body
                     text-fg outline-none transition-colors placeholder:text-fg-faint
                     focus:border-accent"
        />
        <Button type="submit" loading={busy} className="shrink-0">
          Ask
        </Button>
      </form>

      {can(admin?.role, "access.manage") && <TeachWuda />}
    </div>
  );
}

/**
 * Teaching it something new.
 *
 * Owner-only, and the audience is a required choice rather than a default.
 * Defaulting to the narrowest would quietly bury useful operational knowledge
 * where only an owner could find it; defaulting to the widest would make the
 * first careless note company-wide. Neither is a decision the form should make
 * on somebody's behalf.
 */
/** WUDA's mark, so the answer side of the transcript is scannable at a glance. */
function WudaMark() {
  return (
    <span
      aria-hidden
      className="grad-accent chamfer-sm mt-0.5 grid size-7 shrink-0 place-items-center
                 font-mono text-micro font-bold text-on-accent-bright"
    >
      W
    </span>
  );
}

function TeachWuda() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("general");
  const [audience, setAudience] = useState<KnowledgeAudience>("internal");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveNote({ question, answer, category, audience });
      setSaved(true);
      setQuestion("");
      setAnswer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-change self-start text-meta text-fg-muted transition-colors
                   hover:text-accent"
      >
        + Teach WUDA something
      </button>
    );
  }

  return (
    <Card tone="raised" className="p-5">
      <SectionLabel>Teach WUDA</SectionLabel>
      <p className="mb-3 text-meta text-fg-faint">
        For the things the code cannot know — which vendor services the tempos,
        who to call when a hub is shut. It will be searched alongside everything
        else and shown as a staff note.
      </p>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block font-mono text-micro uppercase text-fg-muted">
            The question people will ask
          </span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Who services the tempos?"
            className="h-10 w-full border border-edge bg-surface rounded-xs px-3 text-body text-fg
                       outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-micro uppercase text-fg-muted">
            The answer
          </span>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Sharma Motors on Gill Road. Ask for Ravi. Booked a day ahead."
            className="w-full resize-y border border-edge bg-surface rounded-xs px-3 py-2 text-body
                       text-fg outline-none focus:border-accent"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-mono text-micro uppercase text-fg-muted">
              Category
            </span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full border border-edge bg-surface rounded-xs px-3 text-body text-fg
                         outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-mono text-micro uppercase text-fg-muted">
              Who may read it
            </span>
            <select
              value={audience}
              onChange={(e) =>
                setAudience(e.target.value as KnowledgeAudience)
              }
              className="h-10 w-full border border-edge bg-surface rounded-xs px-3 text-body text-fg
                         outline-none focus:border-accent"
            >
              <option value="everyone">All staff</option>
              <option value="internal">Internal — ops, finance, owner</option>
              <option value="restricted">Owner only</option>
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="border-l-2 border-danger pl-3 text-meta text-danger">
            {error}
          </p>
        )}
        {saved && (
          <p className="border-l-2 border-ok pl-3 text-meta text-ok">
            Saved. WUDA will use it from the next question.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            loading={busy}
            onClick={() => void save()}
            disabled={question.trim().length < 4 || answer.trim().length < 4}
          >
            Save
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="motion-change px-3 text-meta text-fg-muted transition-colors
                       hover:text-fg"
          >
            Close
          </button>
        </div>

        <p className="text-meta text-fg-faint">
          Do not put passwords, keys, the company PAN or anyone&rsquo;s personal
          details here. Notes are searched, ranked and may be read by a model.
        </p>
      </div>
    </Card>
  );
}
