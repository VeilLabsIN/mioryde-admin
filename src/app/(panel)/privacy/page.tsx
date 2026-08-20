"use client";

import Link from "next/link";
import { Card, Fact, PageHeader, Point, SectionLabel } from "@/components/ui";

/**
 * Privacy and data.
 *
 * ## What this page is, and what it deliberately is not
 *
 * It is **not** a privacy policy. The customer-facing policy required by the
 * DPDP Act 2023 does not exist yet and needs counsel; writing plausible policy
 * text here and titling the page "Privacy" would produce exactly the thing
 * `/legal` refuses to produce — a document somebody relies on that nobody
 * approved. That gap is stated, not filled.
 *
 * What it *is*: an accurate description of the personal data this panel puts on
 * screen, what is recorded about the operator looking at it, and how long any
 * of it lasts. All of that is answerable from the code today, which is why it
 * belongs here and the policy does not.
 *
 * `/legal` owns the company and its obligations. This owns the data itself.
 * They cross-link rather than repeat each other.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Privacy and data"
        subtitle="What personal data this panel shows, what is recorded about your access to it, and how long it is kept."
      />

      <Card tone="warning" className="p-5">
        <SectionLabel>This is not the privacy policy</SectionLabel>
        <p className="text-body text-fg-soft">
          Mioryde has no published privacy policy. One is required under
          India&rsquo;s Digital Personal Data Protection Act 2023 before the
          apps reach a store, and it needs counsel rather than a draft written
          here — text that reads as binding but has not been approved is worse
          than an admitted gap, because somebody will act on it.
        </p>
        <p className="mt-3 text-meta text-fg-faint">
          Tracked as outstanding on{" "}
          <Link href="/legal" className="text-accent hover:underline">
            policies and legal
          </Link>
          , alongside the customer terms and the partner agreement. This page
          describes what the panel actually does with data in the meantime.
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>What this panel holds about other people</SectionLabel>
        <p className="text-body text-fg-soft">
          Every item here is real personal data about a living person, not a
          record in a test system.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            title="Customers — name, phone number, addresses"
            detail="Pickup and drop addresses accumulate into a movement history for a named person. That is more sensitive than any single delivery, and it is the reason the customer record is role-gated rather than open to everyone."
          />
          <Point
            title="Partners — identity documents and bank details"
            detail="Licences and identity proofs sit in a private bucket and are reached through short-lived signed links, so a URL copied out of the page stops working. Bank details exist to be paid, and are shown only where a payout is being settled."
          />
          <Point
            title="Deliveries — locations, times, money"
            detail="Where somebody was, when, and what they paid. Retained as the business record of the transaction."
          />
          <Point
            title="Card details — none"
            detail="Payments go through Razorpay and card numbers never reach Mioryde servers. There is nothing here to leak."
            tone="ok"
          />
        </ul>
      </Card>

      <Card className="p-5">
        <SectionLabel>What is recorded about you</SectionLabel>
        <p className="text-body text-fg-soft">
          Using this panel is itself logged. This is not incidental telemetry —
          it exists so that access to other people&rsquo;s data can be reviewed,
          and the review includes yours.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            title="Revealing a phone number"
            detail="Recorded against your name with a timestamp, every time, on the live board and on customer and partner records."
          />
          <Point
            title="Opening an identity document"
            detail="Recorded the same way. Looking at a licence is an event, not a page view."
          />
          <Point
            title="Interventions"
            detail="Cancelling a delivery, blocking a customer, settling a payout, changing a rate card — with the reason you gave, because the person affected may later need to know why."
          />
          <Point
            title="You can read your own trail"
            detail={
              <>
                The audit log is not hidden from the people in it.{" "}
                <Link href="/audit" className="text-accent hover:underline">
                  Open the audit log
                </Link>
              </>
            }
          />
        </ul>
      </Card>

      <Card className="p-5">
        <SectionLabel>How long it lasts</SectionLabel>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact
            label="Ledger and audit log"
            value="Append-only. Never deleted or edited — a mistake is corrected by a further entry."
          />
          <Fact
            label="Signed document links"
            value="Short-lived. Expire on their own; a copied URL stops working."
          />
          <Fact
            label="Your session"
            value="Access token in memory only, lost on reload. The refresh cookie is HttpOnly and cleared on sign-out."
          />
          <Fact
            label="Everything else"
            value="No retention schedule has been set."
          />
        </dl>
        <p className="mt-3 text-meta text-fg-faint">
          The last one is a real gap, not a formality: the DPDP Act expects
          personal data to stop being kept once the purpose it was collected for
          has ended, and nothing currently expires.
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>If somebody asks about their data</SectionLabel>
        <p className="text-body text-fg-soft">
          Customers and partners have rights under the DPDP Act to know what is
          held about them and to have it corrected. There is no process behind
          this yet and no grievance officer has been appointed, so do not
          promise a timeline.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            tone="warn"
            title="Pass the request on rather than answering it"
            detail={
              <>
                Send it to{" "}
                <a href="mailto:mioryde86@gmail.com" className="text-accent hover:underline">
                  mioryde86@gmail.com
                </a>{" "}
                with the person&rsquo;s phone number, and tell them it has been
                passed on. Do not export or email personal data to anyone in
                response to a request you cannot verify — including someone who
                sounds certain on the phone.
              </>
            }
          />
          <Point
            tone="warn"
            title="Nothing here can be deleted on request"
            detail="The ledger and audit log are append-only by design, and the delivery record is the evidence of a transaction. A deletion request needs a real answer from counsel, not an improvised one."
          />
        </ul>
      </Card>

      <Card className="p-5">
        <SectionLabel>Where it sits</SectionLabel>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Application and database" value="Render — Singapore" />
          <Fact label="Identity documents" value="Object storage, private bucket" />
          <Fact label="Payments" value="Razorpay" />
        </dl>
        <p className="mt-3 text-meta text-fg-faint">
          Document residency is an open legal question rather than a
          performance one — UIDAI rules on Aadhaar and the DPDP Act both bear on
          it. See{" "}
          <Link href="/legal" className="text-accent hover:underline">
            policies and legal
          </Link>{" "}
          for the operating entity and its registration numbers.
        </p>
      </Card>
    </div>
  );
}
