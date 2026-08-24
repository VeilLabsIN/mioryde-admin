"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DetailDrawer } from "@/components/DetailDrawer";
import { RevealPhone } from "@/components/RevealPhone";
import {
  Card,
  Fact,
  SectionLabel,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import { type RiderDetail, type RiderTrip, api, formatMoney } from "@/lib/api";
import { riderStatusLabel, riderStatusStyle } from "@/lib/riderStatus";

/**
 * One partner, opened over the list.
 *
 * ## The phone number is masked here too, and that is not an oversight
 *
 * `RiderDetail.phone` arrives masked — `admin-riders.controller.ts` calls
 * `maskPhone` on both the list and the detail endpoint. So this renders
 * `RevealPhone`, which goes through `POST /admin/riders/:id/reveal-phone` and
 * writes `rider.phone_revealed` to the audit log with the operator's name and
 * IP.
 *
 * Printing `detail.phone` directly would show the mask, look like a bug, and
 * invite somebody to "fix" it by unmasking server-side — which is the change
 * that removes the audit trail. `test/admin-phone-masking.test.ts` fails if any
 * admin list assigns an unmasked phone; there is no equivalent guard against a
 * *component* doing something silly, so the reasoning lives here.
 *
 * ## Two requests, and only one of them may fail loudly
 *
 * The profile is the point of opening the drawer; the trip list is context. So
 * a failed profile fetch replaces the drawer body with an error, and a failed
 * trip fetch says so inside the Deliveries tab and leaves everything else
 * usable. Treating both as fatal would hide a partner's status because their
 * delivery history timed out.
 */
export function RiderDrawer({
  riderId,
  onClose,
}: {
  riderId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RiderDetail | null>(null);
  const [trips, setTrips] = useState<RiderTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tripsError, setTripsError] = useState<string | null>(null);

  // Reset during render rather than in the effect, so the previous partner's
  // detail is never painted under the new partner's name. Same reasoning as
  // OrderDrawer, and it matters more here: this screen carries a status
  // somebody is about to approve or reject.
  const [showingFor, setShowingFor] = useState<string | null>(riderId);
  if (riderId !== showingFor) {
    setShowingFor(riderId);
    setDetail(null);
    setTrips(null);
    setError(null);
    setTripsError(null);
  }

  useEffect(() => {
    if (!riderId) return;

    let cancelled = false;

    // Not Promise.all: the two are independent, and awaiting both would hold
    // the profile behind a slow trip query for no reason.
    api
      .riderById(riderId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load this partner.",
          );
        }
      });

    api
      .riderOrders(riderId)
      .then((data) => {
        if (!cancelled) setTrips(data.results);
      })
      .catch(() => {
        if (!cancelled) setTripsError("Could not load deliveries.");
      });

    return () => {
      cancelled = true;
    };
  }, [riderId]);

  return (
    <DetailDrawer
      open={riderId !== null}
      onClose={onClose}
      title={detail ? detail.name : "Loading…"}
      subtitle={
        detail ? (
          <span className="flex items-center gap-2">
            <span
              className={`inline-block border px-1.5 py-0.5 font-mono text-micro uppercase ${riderStatusStyle(
                detail.status,
              )}`}
            >
              {riderStatusLabel(detail.status)}
            </span>
            {detail.isOnline ? (
              <span className="text-ok inline-flex items-center gap-1">
                <span aria-hidden className="bg-ok size-1.5 rounded-full" />
                On duty
              </span>
            ) : null}
          </span>
        ) : null
      }
      tabs={
        detail
          ? [
              {
                key: "partner",
                label: "Partner",
                content: <PartnerTab detail={detail} />,
              },
              {
                key: "deliveries",
                label: "Deliveries",
                content: <DeliveriesTab trips={trips} error={tripsError} />,
              },
            ]
          : undefined
      }
      footer={
        detail ? (
          <Link
            href={`/riders/${detail.id}`}
            className="text-body text-accent underline-offset-2 hover:underline"
          >
            Open the full record →
          </Link>
        ) : null
      }
    >
      {error ? (
        <p className="text-warn text-body" role="alert">
          {error}
        </p>
      ) : (
        <SkeletonRows rows={5} />
      )}
    </DetailDrawer>
  );
}

function PartnerTab({ detail }: { detail: RiderDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="inset" className="p-3">
        <SectionLabel>Contact</SectionLabel>
        <div className="mt-2">
          <p className="text-fg-muted font-mono text-micro uppercase">Phone</p>
          {/* Audited reveal, never the raw value. See the note at the top. */}
          <RevealPhone riderId={detail.id} masked={detail.phone} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Fact label="Joined" value={formatDate(detail.joinedAt)} />
          <Fact
            label="Rating"
            value={detail.rating === null ? "Not rated" : detail.rating.toFixed(1)}
            mono={detail.rating !== null}
          />
        </dl>
      </Card>

      <Card tone="inset" className="p-3">
        <SectionLabel>Work</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Fact label="Delivered" value={String(detail.completed)} mono />
          <Fact
            label="Cancelled"
            value={String(detail.cancelled)}
            mono
          />
          <Fact
            label="Earnings"
            value={formatMoney(detail.earnings)}
            mono
          />
          <Fact
            label="Commission"
            // The *platform's* cut, not the partner's share. Labelled
            // explicitly because `payout = total × (1 − pct/100)`, and reading
            // it the other way round reports a quarter of what somebody earned
            // — which is exactly what BUG-043 was.
            value={`${detail.commissionPct}% to Mioryde`}
            mono
          />
        </dl>
      </Card>

      <Card tone="inset" className="p-3">
        <SectionLabel>Payouts</SectionLabel>
        {/*
          Presence, never the account. The number is AES-256-GCM encrypted at
          rest and an operator has no reason to read it — the API deliberately
          returns a boolean, and the drawer says what that boolean means rather
          than showing a bare "false".
        */}
        <p className="text-body text-fg-soft mt-2">
          {detail.hasBankDetails
            ? "Bank details are on file."
            : "No bank details yet — this partner cannot be paid."}
        </p>
      </Card>
    </div>
  );
}

function DeliveriesTab({
  trips,
  error,
}: {
  trips: RiderTrip[] | null;
  error: string | null;
}) {
  if (error) {
    // Said, not swallowed. An empty list and a failed request look identical
    // otherwise, and "this partner has never delivered" is a conclusion an
    // operator might act on.
    return (
      <p className="text-warn text-body" role="alert">
        {error}
      </p>
    );
  }

  if (trips === null) return <SkeletonRows rows={4} />;

  if (trips.length === 0) {
    return (
      <p className="text-fg-muted text-body">No deliveries recorded yet.</p>
    );
  }

  return (
    <ol className="flex flex-col">
      {trips.map((trip) => (
        <li
          key={trip.id}
          className="border-line flex flex-wrap items-start gap-2 border-b py-3 last:border-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/orders/${trip.id}`}
                className="text-fg-mid hover:text-accent font-mono text-meta underline-offset-2 hover:underline"
              >
                {trip.code}
              </Link>
              <StatusPill status={trip.status} />
            </div>
            <p className="text-fg-soft mt-1 truncate text-body">
              {trip.pickupAddress}
            </p>
            <p className="text-fg-faint truncate text-meta">
              → {trip.dropAddress}
            </p>
          </div>

          <div className="text-right">
            <p className="font-mono text-body tabular-nums">
              {formatMoney(trip.total)}
            </p>
            <p className="text-fg-faint text-meta">
              {(trip.distanceMeters / 1000).toFixed(1)} km
            </p>
            <p className="text-fg-faint text-meta">
              {formatDate(trip.placedAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
