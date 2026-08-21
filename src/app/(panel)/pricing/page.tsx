"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  GhostButton,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import {
  type RateCard,
  type VehicleType,
  type Zone,
  api,
  formatMoney,
} from "@/lib/api";
import { type Column, DataTable } from "@/components/DataTable";
import { RateCardEditor } from "@/components/RateCardEditor";
import { useCan } from "@/components/AdminProvider";


/**
 * Fare components, per vehicle.
 *
 * Every money column is right-aligned with tabular figures — a column of fares
 * that does not line up on the decimal point is one nobody can scan for the
 * odd one out, which is the only reason to look at this page.
 */
const BASE_COLUMNS: readonly Column<RateCard>[] = [
  {
    key: "vehicle",
    header: "Vehicle",
    cell: (card) => (
      <span className="text-body font-medium">
        {card.vehicle.name}
        {card.includedKm > 0 && (
          <span className="ml-2 font-mono text-meta text-fg-faint">
            {card.includedKm} km included
          </span>
        )}
      </span>
    ),
  },
  {
    key: "base",
    header: "Base",
    width: "116px",
    align: "right",
    cell: (card) => (
      <span className="font-mono text-meta tabular-nums">
        {formatMoney(card.baseFare, { alwaysShowDecimals: true })}
      </span>
    ),
  },
  {
    key: "perKm",
    header: "Per km",
    width: "116px",
    align: "right",
    // Accented because it is the number that moves a fare most, and the one an
    // operator is usually here to check.
    cell: (card) => (
      <span className="font-mono text-meta tabular-nums text-accent">
        {formatMoney(card.perKm, { alwaysShowDecimals: true })}
      </span>
    ),
  },
  {
    key: "perMinute",
    header: "Per min",
    width: "116px",
    align: "right",
    cell: (card) => (
      <span className="font-mono text-meta tabular-nums text-fg-muted">
        {formatMoney(card.perMinute, { alwaysShowDecimals: true })}
      </span>
    ),
  },
  {
    key: "minFare",
    header: "Min fare",
    width: "96px",
    align: "right",
    cell: (card) => (
      <span className="font-mono text-meta tabular-nums text-fg-muted">
        {formatMoney(card.minFare, { alwaysShowDecimals: true })}
      </span>
    ),
  },
  {
    key: "gst",
    header: "GST",
    width: "76px",
    align: "right",
    cell: (card) => (
      <span className="font-mono text-meta tabular-nums text-fg-muted">
        {card.gstPercent}%
      </span>
    ),
  },
];

/**
 * Columns, plus the edit affordance when the operator may use it.
 *
 * Built per render rather than declared once because the last column depends
 * on the role. A column that is always present and sometimes empty leaves a
 * ragged gap in the table for everyone who cannot act on it.
 */
function columnsFor(
  onEdit: ((card: RateCard) => void) | null,
): readonly Column<RateCard>[] {
  if (!onEdit) return BASE_COLUMNS;
  return [
    ...BASE_COLUMNS,
    {
      key: "edit",
      header: "",
      width: "88px",
      align: "right",
      cell: (card) => (
        <GhostButton
          className="h-7 px-2 text-meta"
          onClick={() => onEdit(card)}
          aria-label={`Change rates for ${card.vehicle.name} in ${card.zone.name}`}
        >
          Change
        </GhostButton>
      ),
    },
  ];
}

export default function PricingPage() {
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<VehicleType[]>([]);
  // `null` — not editing. A card — superseding that one. `"new"` — a zone and
  // vehicle that have no live card yet, which is what a fresh city is.
  const [editing, setEditing] = useState<RateCard | "new" | null>(null);
  const canEdit = useCan("pricing.edit");

  const load = useCallback(() => {
    return api
      .rateCards()
      .then((res) => {
        setCards(res.results);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load rate cards.");
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Only for the people who can publish: an operator who is here to read a
  // fare should not pay for two queries that only a form uses.
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    void Promise.all([api.zones(), api.vehicleTypes()])
      .then(([z, v]) => {
        if (cancelled) return;
        setZones(z.results.filter((zone) => zone.isActive));
        setVehicles(v.results);
      })
      // Silent: without these the "New rate card" button stays disabled and
      // says why, which is a better failure than an error banner over a page
      // whose main content loaded fine.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canEdit]);

  // Grouped by zone: rates are set per zone, so that is the unit an operator
  // reasons about, not a flat list.
  const byZone = (cards ?? []).reduce<Record<string, RateCard[]>>((acc, card) => {
    const key = `${card.zone.city} — ${card.zone.name}`;
    (acc[key] ??= []).push(card);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Rate cards"
          subtitle="What customers are charged, per zone and vehicle."
        />
        {canEdit && (
          <GhostButton
            onClick={() => setEditing("new")}
            disabled={editing === "new" || zones.length === 0 || vehicles.length === 0}
            title={
              zones.length === 0 || vehicles.length === 0
                ? "Zones and vehicle types could not be loaded."
                : undefined
            }
          >
            New rate card
          </GhostButton>
        )}
      </div>

      {editing === "new" && (
        <RateCardEditor
          current={null}
          zone={null}
          vehicle={null}
          zones={zones}
          vehicles={vehicles}
          liveCards={cards ?? []}
          onCancel={() => setEditing(null)}
          onPublished={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {/*
        These numbers came from the marketing site, not from unit economics.
        Saying so here is the difference between someone checking them and
        someone assuming they were already checked.
      */}
      <Card className="mb-8 border-l-2 border-l-warn px-4 py-3">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[2px] text-warn">
          Needs review before launch
        </p>
        <p className="text-[13px] leading-relaxed text-fg-mid">
          The live rates below were seeded from the figures published on
          mioryde.com. They have not been checked against fuel cost per km,
          partner commission, vehicle wear or platform margin. Confirm them with
          the client before taking real bookings.
        </p>
      </Card>

      {error ? (
        <EmptyState title="Could not load rate cards" hint={error} />
      ) : cards === null ? (
        <Card className="overflow-hidden">
          <SkeletonRows rows={4} />
        </Card>
      ) : cards.length === 0 ? (
        <EmptyState
          title="No rate cards configured"
          hint="Every zone needs one card per vehicle before it can take bookings."
        />
      ) : (
        Object.entries(byZone).map(([zone, zoneCards]) => (
          <section key={zone} className="mb-8">
            <SectionLabel>{zone}</SectionLabel>
            {typeof editing === "object" &&
              editing !== null &&
              zoneCards.some((card) => card.id === editing.id) && (
                // Inside the zone it belongs to, above the table rather than
                // in place of it: the other vehicles' rates are the context an
                // operator prices against.
                <RateCardEditor
                  // No `key` needed: the editor re-initialises itself when
                  // `current` changes. It used to be keyed here, which worked
                  // and put the fix at one call site rather than in the
                  // component that has the problem.
                  current={editing}
                  zone={editing.zone}
                  vehicle={editing.vehicle}
                  zones={zones}
                  vehicles={vehicles}
                  liveCards={cards ?? []}
                  onCancel={() => setEditing(null)}
                  onPublished={() => {
                    setEditing(null);
                    void load();
                  }}
                />
              )}
            <Card className="overflow-hidden">
              <DataTable
                caption={`Rate card for ${zone}`}
                columns={columnsFor(canEdit ? setEditing : null)}
                rows={zoneCards}
                rowKey={(card) => card.id}
                emptyTitle="No rate cards in this zone"
              />
            </Card>
          </section>
        ))
      )}

      <p className="text-[12px] leading-relaxed text-fg-faint">
        Publishing a new rate supersedes the old one rather than editing it, so
        past orders keep the price they were actually charged. Editing is
        restricted to finance and owner accounts, and every change is recorded
        in the audit log.
      </p>
    </div>
  );
}
