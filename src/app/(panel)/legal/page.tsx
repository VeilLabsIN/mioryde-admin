"use client";

import Link from "next/link";
import { useAdmin } from "@/components/AdminProvider";
import { Card, Fact, PageHeader, Point, SectionLabel } from "@/components/ui";
import { can } from "@/lib/permissions";

/**
 * The legal and policy hub.
 *
 * Two different things live here and it matters that they are not confused:
 *
 *   - **Facts.** The operating entity, its registration numbers, where the
 *     data sits. These are taken from the incorporation documents and are
 *     true today.
 *   - **Documents that do not exist yet.** The customer terms, the privacy
 *     policy and the partner agreement all need counsel. They are listed as
 *     outstanding rather than filled with plausible text, because plausible
 *     text on a page headed "Legal" is worse than an admitted gap — somebody
 *     will rely on it.
 *
 * Not in the sidebar. The nav is organised by capability; this belongs to
 * everyone and is reached from the ? menu in the top bar.
 */
export default function LegalPage() {
  const admin = useAdmin();

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Policies and legal"
        subtitle="The operating entity, your obligations when using this panel, and what is still outstanding."
      />

      {/*
        The company's PAN used to be here, beside the CIN, visible to every
        support account that opened the page. It has been removed outright
        rather than hidden: a PAN is a confidential identifier used to
        authenticate the company to banks and the tax department, it is never
        needed to operate a delivery, and no amount of role-gating justifies
        shipping it to a browser that has no use for it.

        What is left is public or near-public and stays:

          - **CIN** is on the MCA register. Companies are required to print it
            on letterheads and invoices, so anyone can look it up from the
            company name. Hiding it would be theatre.
          - **Udyam** appears on MSME invoices, so every customer already has
            it.
          - **Registered office** is a matter of public record.

        Gated to `access.manage` anyway — owner only. Not because any single
        line is dangerous, but because the block as a whole is company
        administration rather than delivery operations, and support has no
        errand here. The narrower the audience for a page like this, the fewer
        chances there are for the next value added to it to be another PAN.
      */}
      {can(admin?.role, "access.manage") ? (
        <Card tone="raised" className="p-5">
          <SectionLabel>Operating entity</SectionLabel>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label="Legal name" value="MIORIGIN PRIVATE LIMITED" />
            <Fact label="CIN" value="U49224PB2026PTC066792" mono />
            <Fact label="Udyam" value="UDYAM-PB-12-0279716" mono />
            <Fact label="Incorporated" value="6 January 2026" />
            <Fact
              label="Registered office"
              value="#7125A, St No 8, Samrala Chowk, Guru Arjan Dev Nagar, Millerganj, Ludhiana, Punjab 141003"
            />
          </dl>
          <p className="mt-3 text-meta text-fg-faint">
            Registration identifiers only. Tax and banking credentials — the
            company PAN, bank account numbers, signing keys — are deliberately
            not held anywhere in this panel.
          </p>
        </Card>
      ) : null}

      <Card tone="warning" className="p-5">
        <SectionLabel>Not yet in place</SectionLabel>
        <p className="text-body text-fg-soft">
          These are listed rather than drafted. Text that reads as binding but
          has not been through counsel is worse than a stated gap, because
          somebody will act on it.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            tone="warn"
            title="GST registration"
            detail="No GSTIN has been supplied. Every invoice the platform issues carries a placeholder and is not a valid tax invoice. Invoices are immutable and consecutively numbered by law, so these cannot be corrected later — only credited."
          />
          <Point
            tone="warn"
            title="Customer terms of service and privacy policy"
            detail="Required before the apps go to a store. India's DPDP Act 2023 governs the personal data already being collected."
          />
          <Point
            tone="warn"
            title="Partner agreement"
            detail="Publishable from the Agreement page once counsel supplies the text. Version 1.0 was used in testing, so the real terms must go out under a new version number."
          />
        </ul>
        <p className="mt-3 text-meta text-fg-faint">
          <Link href="/readiness" className="text-accent hover:underline">
            Readiness
          </Link>{" "}
          is computed from live configuration and is the authoritative view of
          what is outstanding. This page is written by hand and can fall behind
          it.
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>Using this panel</SectionLabel>
        <p className="text-body text-fg-soft">
          This is an internal tool holding real people&rsquo;s names, phone
          numbers, addresses and identity documents. Four things follow from
          that, and they are enforced rather than requested.
        </p>
        <ul className="mt-3 space-y-2.5">
          <Point
            title="Look only at what you need"
            detail="Revealing a phone number and opening an identity document are both recorded against your name, with a timestamp. The record exists so that access can be reviewed — including yours."
          />
          <Point
            title="Your account is yours"
            detail="Do not share it. Roles decide what can be reached, so a shared login makes the audit log say the wrong name about who did something."
          />
          <Point
            title="Interventions need a reason"
            detail="Cancelling a delivery or blocking a customer asks for one because somebody will later need to know why — usually the person affected."
          />
          <Point
            title="Nothing here is deletable"
            detail="The ledger and the audit log are append-only by design. A mistake is corrected by a further entry, never by rewriting what happened."
          />
        </ul>
      </Card>

      <Card className="p-5">
        <SectionLabel>Where the data lives</SectionLabel>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Fact label="Application and database" value="Render — Singapore" />
          <Fact label="Identity documents" value="Object storage, private bucket, short-lived signed links" />
          <Fact label="Payments" value="Razorpay — card details never reach our servers" />
        </dl>
        <p className="mt-3 text-meta text-fg-faint">
          Identity-document residency is a live decision: UIDAI rules on Aadhaar
          and the DPDP Act make storage location a legal question, not a
          performance one.
        </p>
      </Card>

      <Card className="p-5">
        <SectionLabel>Contact</SectionLabel>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Fact label="Operator" value="mioryde86@gmail.com" />
          <Fact label="Registered phone" value="+91 97794 80280" mono />
          <Fact label="Built by" value="Technobyte Developers" />
        </dl>
        <p className="mt-3 text-meta text-fg-faint">
          A grievance officer must be named publicly before launch. That has not
          been appointed.
        </p>
      </Card>
    </div>
  );
}
