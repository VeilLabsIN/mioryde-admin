"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarList, Stat, TrendChart } from "@/components/charts";
import {
  Card,
  GhostButton,
  PageHeader,
  SectionLabel,
  SkeletonRows,
} from "@/components/ui";
import { ApiError, type Analytics, api, formatMoney } from "@/lib/api";

const RANGES = [7, 30, 90] as const;

/**
 * The series a reader can put on the main chart.
 *
 * Four separate charts would take four screens of scrolling to compare two
 * numbers. One chart with a selector puts them in the same frame, which is
 * where a comparison actually happens.
 *
 * Revenue draws as a line — it is a continuous quantity and the shape is the
 * point. Counts draw as bars, because a day with two deliveries and a day with
 * none are two facts, and a line invents the values in between.
 */
const SERIES = [
  { key: "revenue", label: "Revenue", money: true, mode: "line" as const },
  { key: "delivered", label: "Delivered", money: false, mode: "bar" as const },
  { key: "placed", label: "Placed", money: false, mode: "bar" as const },
  { key: "cancelled", label: "Cancelled", money: false, mode: "bar" as const },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

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
 * are holding right now. A real exposure, and it appears nowhere in revenue.
 *
 * **Fleet utilisation** is the share of approved partners who actually
 * delivered. A large gap is acquisition spend with nothing behind it.
 */
export default function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [series, setSeries] = useState<SeriesKey>("revenue");
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
  const active = SERIES.find((option) => option.key === series)!;

  const points = useMemo(() => {
    if (!data) return [];
    return data.daily.map((day) => ({
      label: day.date.slice(5),
      value:
        series === "revenue"
          ? day.revenue.minor
          : series === "delivered"
            ? day.delivered
            : series === "placed"
              ? day.placed
              : day.cancelled,
    }));
  }, [data, series]);

  // Said out loud, because a chart of thirty mostly-empty days looks broken
  // rather than quiet — a reader cannot otherwise tell "no trade" from "no
  // data", and those need very different reactions.
  const activeDays = points.filter((point) => point.value > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Every figure is against the previous period of the same length."
        actions={RANGES.map((range) => (
          <GhostButton
            key={range}
            onClick={() => setDays(range)}
            className={
              days === range ? "border-accent text-fg" : "text-fg-faint"
            }
          >
            {range} days
          </GhostButton>
        ))}
      />

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
              inverse
            />
            <Stat
              label="Average fare"
              value={rupees(data.summary.averageFare.minor)}
              hint={`${(data.summary.averageDistanceMeters / 1000).toFixed(1)} km average trip`}
            />
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <SectionLabel>Per day</SectionLabel>
                <p className="text-fg-faint mt-1 text-xs">
                  {activeDays === 0
                    ? "Nothing recorded in this period."
                    : `${activeDays} of ${points.length} days had activity.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SERIES.map((option) => (
                  <GhostButton
                    key={option.key}
                    onClick={() => setSeries(option.key)}
                    className={
                      series === option.key
                        ? "border-accent text-fg"
                        : "text-fg-faint"
                    }
                  >
                    {option.label}
                  </GhostButton>
                ))}
              </div>
            </div>

            <TrendChart
              points={points}
              mode={active.mode}
              format={(value) =>
                active.money ? rupees(value) : String(Math.round(value))
              }
            />
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
                  format={rupees}
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
                  format={rupees}
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
                {data.fleet.docExpired} off duty with expired documents ·{" "}
                {data.fleet.suspended} suspended
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
