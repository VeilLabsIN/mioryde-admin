"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState, SectionLabel, SkeletonRows } from "@/components/ui";
import { type RateCard, api, formatMoney } from "@/lib/api";

export default function PricingPage() {
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .rateCards()
      .then((res) => {
        if (!cancelled) setCards(res.results);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load rate cards.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Grouped by zone: rates are set per zone, so that is the unit an operator
  // reasons about, not a flat list.
  const byZone = (cards ?? []).reduce<Record<string, RateCard[]>>((acc, card) => {
    const key = `${card.zone.city} — ${card.zone.name}`;
    (acc[key] ??= []).push(card);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="mb-1 font-sans text-2xl font-semibold">Rate cards</h1>
      <p className="mb-6 text-[13px] text-fg-muted">
        What customers are charged, per zone and vehicle.
      </p>

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
            <Card className="overflow-hidden">
              <div
                className="grid grid-cols-[1fr_110px_110px_110px_90px_70px] gap-3 border-b
                           border-line bg-panel px-4 py-2 font-mono text-[9px] uppercase
                           tracking-[2px] text-fg-muted"
              >
                <span>Vehicle</span>
                <span className="text-right">Base</span>
                <span className="text-right">Per km</span>
                <span className="text-right">Per min</span>
                <span className="text-right">Min fare</span>
                <span className="text-right">GST</span>
              </div>
              <ul className="stagger divide-y divide-line">
                {zoneCards.map((card) => (
                  <li
                    key={card.id}
                    className="grid grid-cols-[1fr_110px_110px_110px_90px_70px] items-center
                               gap-3 px-4 py-3 transition-colors duration-150 hover:bg-panel"
                  >
                    <span className="text-[13px] font-medium">
                      {card.vehicle.name}
                      {card.includedKm > 0 && (
                        <span className="ml-2 font-mono text-[11px] text-fg-faint">
                          {card.includedKm} km included
                        </span>
                      )}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums">
                      {formatMoney(card.baseFare, { alwaysShowDecimals: true })}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-accent">
                      {formatMoney(card.perKm, { alwaysShowDecimals: true })}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-fg-muted">
                      {formatMoney(card.perMinute, { alwaysShowDecimals: true })}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-fg-muted">
                      {formatMoney(card.minFare, { alwaysShowDecimals: true })}
                    </span>
                    <span className="text-right font-mono text-xs tabular-nums text-fg-muted">
                      {card.gstPercent}%
                    </span>
                  </li>
                ))}
              </ul>
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
