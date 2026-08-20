"use client";

import Link from "next/link";
import { Card, Fact, PageHeader, SectionLabel } from "@/components/ui";
import { NAV_GROUPS } from "@/lib/nav";

/**
 * What this thing is.
 *
 * Written for the person who has just been given a login and has no idea what
 * they are looking at, and for the one debugging a report six months from now
 * who needs to know which version was on screen. Those two needs are the whole
 * page: orientation at the top, hard identifying facts at the bottom.
 *
 * The entity block is on `/legal` and is not repeated here — that page is the
 * authority for registration numbers, and two copies would disagree the first
 * time one changed.
 */
export default function AboutPage() {
  const pageCount = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="About Mioryde"
        subtitle="What the platform is, what this panel controls, and which version you are running."
      />

      <Card tone="raised" className="p-5">
        <SectionLabel>The product</SectionLabel>
        <p className="text-body text-fg-soft">
          Mioryde moves goods across a city on demand. A customer names a
          pickup and a drop, the platform prices the trip from a rate card for
          that zone and vehicle, and a delivery partner is dispatched to carry
          it. It runs in Ludhiana, Punjab.
        </p>
        <p className="mt-3 text-body text-fg-soft">
          This panel is the operations side of that — the {pageCount} screens
          the business is run from. It is the only surface where a delivery can
          be intervened in, a partner approved, or money settled, which is why
          every consequential action in it is recorded against a name.
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>What the platform is made of</SectionLabel>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact
            label="Customer app"
            value="Android and iOS. Places deliveries, tracks them, pays."
          />
          <Fact
            label="Partner app"
            value="Android and iOS. Duty status, job offers, navigation, earnings."
          />
          <Fact
            label="Operations panel"
            value="This. Web, staff accounts only, created by an administrator."
          />
          <Fact
            label="API"
            value="One service behind all three, holding the ledger and the record."
          />
        </dl>
      </Card>

      <Card className="p-5">
        <SectionLabel>Two things worth knowing</SectionLabel>
        <p className="text-body text-fg-soft">
          Both shape what this panel will and will not let you do, and both
          surprise people who assume otherwise.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact
            label="The money is a double-entry ledger"
            value="Every movement is postings that sum to zero, appended and never edited. A mistake is corrected by a further entry, which is why nothing here has a delete button."
          />
          <Fact
            label="Roles decide what opens"
            value="The nav hides what your role cannot use, and the API refuses it independently. A page you cannot see is not a page you can reach by typing its address."
          />
        </dl>
      </Card>

      <Card className="p-5">
        <SectionLabel>This build</SectionLabel>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact
            label="Panel version"
            value={process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.1.0"}
            mono
          />
          <Fact
            label="API"
            value={process.env["NEXT_PUBLIC_API_URL"] ?? "not configured"}
            mono
          />
          <Fact label="Operating entity" value="MIORIGIN PRIVATE LIMITED" />
          <Fact
            label="Built by"
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
        </dl>
        <p className="mt-3 text-meta text-fg-faint">
          Quote the version and the API host in any bug report — they are the
          two facts that decide whether a problem is reproducible. Registration
          numbers and the registered office are on{" "}
          <Link href="/legal" className="text-accent hover:underline">
            policies and legal
          </Link>
          .
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>Where to go next</SectionLabel>
        <ul className="grid gap-2 sm:grid-cols-2">
          <NextLink href="/help" label="Help topics" blurb="What each page is for." />
          <NextLink href="/support" label="Support" blurb="When something is wrong." />
          <NextLink href="/privacy" label="Privacy and data" blurb="What is held, and about whom." />
          <NextLink href="/readiness" label="Readiness" blurb="Whether we can take real money yet." />
        </ul>
      </Card>
    </div>
  );
}

function NextLink({
  href,
  label,
  blurb,
}: {
  href: string;
  label: string;
  blurb: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="motion-change group block border border-line p-3 transition-colors
                   hover:border-accent"
      >
        <span className="block text-body font-medium text-fg group-hover:text-accent">
          {label}
        </span>
        <span className="block text-meta text-fg-faint">{blurb}</span>
      </Link>
    </li>
  );
}
