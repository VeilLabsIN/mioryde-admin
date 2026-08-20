"use client";

import Link from "next/link";
import { useAttention } from "@/components/Banner";
import { Card, Fact, PageHeader, Point, SectionLabel } from "@/components/ui";

/**
 * Where to go when something is wrong.
 *
 * ## Why the diagnosis comes before the contact details
 *
 * The obvious support page is an email address and a phone number. Most of
 * what gets reported to those is already answered by a page in this panel:
 * "payouts are stuck" is usually the outbox, "the numbers look wrong" is
 * usually the ledger, "I cannot open X" is usually a role. Each of those has a
 * screen that says so precisely, and a report that arrives having read it is
 * worth several that have not.
 *
 * So this leads with what to check, then what to send, then who to send it to.
 * The contact block is deliberately last and deliberately short.
 *
 * ## What is not here
 *
 * A ticket form. There is no ticketing system behind this panel, and a form
 * that posts nowhere is worse than an email address — somebody will fill it in
 * and wait.
 */
export default function SupportPage() {
  const { items, sources, loaded } = useAttention();

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Support"
        subtitle="What to check first, what to include in a report, and who to tell."
      />

      {/* The live answer to "is it just me". Anything the shell already knows
          is wrong is repeated here, because somebody arriving on this page has
          already decided something is broken and should not have to find the
          banner they scrolled past. */}
      <Card tone={items.length > 0 ? "warning" : "raised"} className="p-5">
        <SectionLabel>Right now</SectionLabel>
        {!loaded ? (
          <p className="text-body text-fg-muted">Checking the platform&rsquo;s own health…</p>
        ) : sources === 0 ? (
          <p className="text-body text-fg-muted">
            Your role cannot read the health checks, so this panel cannot tell
            you whether the problem is yours or everyone&rsquo;s. Say so in your
            report — it is useful information.
          </p>
        ) : items.length === 0 ? (
          <p className="text-body text-fg-soft">
            Nothing is reporting a fault. The ledger balances, no notifications
            have been abandoned, and no launch blocker is outstanding. If
            something still looks wrong, it is worth reporting precisely because
            the platform does not know about it.
          </p>
        ) : (
          <>
            <p className="text-body text-fg-soft">
              The platform is already reporting {items.length} problem
              {items.length === 1 ? "" : "s"}. Your issue may be one of these.
            </p>
            <ul className="mt-3 space-y-2.5">
              {items.map((item) => (
                <Point
                  key={item.id}
                  tone="warn"
                  title={item.title}
                  detail={
                    <>
                      {item.detail}{" "}
                      <Link
                        href={item.action.href}
                        className="text-accent hover:underline"
                      >
                        {item.action.label}
                      </Link>
                    </>
                  }
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card className="p-5">
        <SectionLabel>Check these first</SectionLabel>
        <p className="text-body text-fg-soft">
          Each of these answers a whole class of question on its own, and all
          four are faster than waiting for a reply.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            title="Readiness — “why can’t we go live / why is this invoice wrong”"
            detail={
              <>
                Computed from live configuration rather than remembered, so it
                is the authoritative answer to what is still missing.{" "}
                <Link href="/readiness" className="text-accent hover:underline">
                  Open readiness
                </Link>
              </>
            }
          />
          <Point
            title="Monitoring — “the money looks wrong / nobody was notified”"
            detail={
              <>
                The ledger, the outbox and the queues. An unbalanced ledger or a
                dead-lettered notification shows here before anyone reports it.{" "}
                <Link href="/monitoring" className="text-accent hover:underline">
                  Open monitoring
                </Link>
              </>
            }
          />
          <Point
            title="Audit log — “who changed this”"
            detail={
              <>
                Every consequential action with the name of whoever took it.
                Most “the system did this by itself” reports end here.{" "}
                <Link href="/audit" className="text-accent hover:underline">
                  Open the audit log
                </Link>
              </>
            }
          />
          <Point
            title="Help topics — “what is this page supposed to do”"
            detail={
              <>
                Written against the code, and covers the behaviour that is
                correct but surprising — which is where most reports come from.{" "}
                <Link href="/help" className="text-accent hover:underline">
                  Open help
                </Link>
              </>
            }
          />
        </ul>
      </Card>

      <Card className="p-5">
        <SectionLabel>What to include in a report</SectionLabel>
        <p className="text-body text-fg-soft">
          A report missing these takes a round trip to become useful, and the
          round trip usually costs a day.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            title="The identifier, not the description"
            detail="The delivery code, the payout id, the customer’s phone number. “A delivery in Model Town this morning” cannot be looked up; MYR-4821 can."
          />
          <Point
            title="The page you were on and what you clicked"
            detail="Copy the URL out of the address bar. It carries the filters and the tab you were on, which is usually half the reproduction."
          />
          <Point
            title="What you expected instead"
            detail="Several reported faults turn out to be behaviour that is deliberate — revenue counting delivered orders only, the board re-ranking on refresh. Saying what you expected separates a bug from a surprise in one line."
          />
          <Point
            title="The time, roughly, and your account"
            detail="Enough to find it in the logs. Do not share your password with anyone asking for it, including whoever is helping you — nobody needs it to investigate."
          />
        </ul>
      </Card>

      <Card className="p-5">
        <SectionLabel>Who to tell</SectionLabel>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact
            label="Operations"
            value={
              <a href="mailto:mioryde86@gmail.com" className="hover:text-accent">
                mioryde86@gmail.com
              </a>
            }
          />
          <Fact label="Registered phone" value="+91 97794 80280" mono />
          <Fact
            label="The panel itself — bugs and outages"
            value={
              <a
                href="https://veillabs.in"
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-accent"
              >
                VeilLabs — veillabs.in
              </a>
            }
          />
          <Fact label="Your own account and password" value={<Link href="/security" className="hover:text-accent">Account security</Link>} />
        </dl>
        <p className="mt-3 text-meta text-fg-faint">
          There is no ticketing system behind this page yet, so these are real
          mailboxes read by people rather than a queue with a response time. A
          grievance officer for data-protection requests has not been appointed —
          see{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            privacy and data
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
