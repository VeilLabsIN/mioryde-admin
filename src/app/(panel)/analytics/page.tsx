"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarList, Stat, TrendChart } from "@/components/charts";
import { Card, GhostButton, SectionLabel, SkeletonRows } from "@/components/ui";
import { ApiError, type Analytics, api, formatMoney } from "@/lib/api";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/**
 * How the business is doing.
 *
 * ## What this page is for
 *
 * Deciding things. Every figure is shown against the previous period of the
 * same length, because a number on its own cannot tell anybody whether to act.
 *
 * ## The two figures that are not vanity
 *
 * **Cash outstanding** is the platform's uncollected float — money partners
 * are holding right now. It is a real exposure and it does not appear in
 * revenue.
 *
 * **Fleet utilisation** is the share of approved partners who actually
 * delivered anything. A large gap means people were onboarded and never
 * worked, which is acquisition spend with nothing behind it.
 */
export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response for an old range landing after a newer one.
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setError(null);
    setData(null);

    api
      .analytics(days)
      .then((result) => {
        if (id === requestId.current) setData(result);
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load analytics.",
        );
      });
  }, [days]);

  useEffect(load, [load]);

  const rupees = (minor: number) => formatMoney({ minor, currency: "INR" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-fg-faint mt-1 text-sm">
            Every figure is against the previous period of the same length.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <GhostButton
              key={range.days}
              onClick={() => setDays(range.days)}
              className={
                days === range.days ? "border-accent text-fg" : "text-fg-faint"
              }
            >
              {range.label}
            </GhostButton>
          ))}
        </div>
      </div>

      {error ? (
        <Card>
          <p className="text-warn text-sm">{error}</p>
        </Card>
      ) : null}

      {data === null ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Revenue (delivered)"
              value={rupees(data.summary.revenue.now.minor)}
              current={data.summary.revenue.now.minor}
              previous={data.summary.revenue.previous.minor}
            />
            <Stat
              label="Orders placed"
              value={String(data.summary.orders.now)}
              current={data.summary.orders.now}
              previous={data.summary.orders.previous}
            />
            <Stat
              label="Cancellation rate"
              value={`${(data.summary.cancellationRate.now * 100).toFixed(1)}%`}
              current={data.summary.cancellationRate.now}
              previous={data.summary.cancellationRate.previous}
              // Down is good here.
              inverse
            />
            <Stat
              label="Average fare"
              value={rupees(data.summary.averageFare.minor)}
              hint={`${(data.summary.averageDistanceMeters / 1000).toFixed(1)} km average trip`}
            />
          </div>

          <Card>
            <SectionLabel>Revenue per day</SectionLabel>
            <div className="mt-3">
              <TrendChart
                points={data.daily.map((day) => ({
                  label: day.date.slice(5),
                  value: day.revenue.minor,
                }))}
                format={(minor) => rupees(minor)}
              />
            </div>
          </Card>

          <Card>
            <SectionLabel>Deliveries per day</SectionLabel>
            <div className="mt-3">
              <TrendChart
                points={data.daily.map((day) => ({
                  label: day.date.slice(5),
                  value: day.delivered,
                }))}
                height={120}
                format={(value) => String(Math.round(value))}
              />
            </div>
          </Card>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <SectionLabel>Revenue by zone</SectionLabel>
              <div className="mt-3">
                <BarList
                  points={data.breakdowns.zones.map((zone) => ({
                    label: zone.label,
                    value: zone.revenue.minor,
                  }))}
                  format={(minor) => rupees(minor)}
                />
              </div>
            </Card>
            <Card>
              <SectionLabel>Revenue by vehicle</SectionLabel>
              <div className="mt-3">
                <BarList
                  points={data.breakdowns.vehicles.map((vehicle) => ({
                    label: vehicle.label,
                    value: vehicle.revenue.minor,
                  }))}
                  format={(minor) => rupees(minor)}
                />
              </div>
            </Card>
            <Card>
              <SectionLabel>Orders by payment</SectionLabel>
              <div className="mt-3">
                <BarList
                  points={data.breakdowns.payments.map((payment) => ({
                    label: payment.label === "cod" ? "Cash" : "Prepaid",
                    value: payment.orders,
                  }))}
                  format={(value) => String(Math.round(value))}
                />
              </div>
              <p className="text-fg-faint mt-3 text-xs">
                Every cash order adds to the float partners carry.
              </p>
            </Card>
          </div>

          <Card>
            <SectionLabel>Fleet</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Active partners"
                value={String(data.fleet.active)}
                hint={`${data.fleet.online} online now`}
              />
              <Stat
                label="Utilisation"
                value={`${(data.fleet.utilisation * 100).toFixed(0)}%`}
                hint={`${data.fleet.earning} delivered in period`}
              />
              <Stat
                label="Cash outstanding"
                value={rupees(data.fleet.cashOutstanding.minor)}
                hint={`${data.fleet.holdingCash} partner${data.fleet.holdingCash === 1 ? "" : "s"} holding`}
              />
              <Stat
                label="Waiting on us"
                value={String(
                  data.fleet.pendingKyc + data.fleet.bankChecksPending,
                )}
                hint={`${data.fleet.pendingKyc} KYC · ${data.fleet.bankChecksPending} bank checks`}
              />
            </div>

            {data.fleet.docExpired > 0 || data.fleet.suspended > 0 ? (
              <p className="text-fg-faint mt-4 text-xs">
                {data.fleet.docExpired} partner
                {data.fleet.docExpired === 1 ? "" : "s"} off duty with expired
                documents · {data.fleet.suspended} suspended
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
