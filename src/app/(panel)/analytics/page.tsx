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
  /** Set only when a custom range is in force; presets clear it. */
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [series, setSeries] = useState<SeriesKey>("revenue");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Guards against a slow response for an old range landing after a newer one.
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setError(null);
    setData(null);

    api
      .analytics(custom ?? { days })
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
  }, [days, custom]);

  useEffect(load, [load]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await api.downloadDailyCsv(custom ?? { days });
      // Object URL and a synthetic click. Revoked immediately after — the blob
      // is held in memory until it is, and an operator exporting repeatedly
      // over a shift would otherwise accumulate every copy.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }

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
        subtitle={
          data
            ? `${data.range.from} to ${data.range.to} · against the previous ${data.days} days`
            : "Every figure is against the previous period of the same length."
        }
        actions={[
          ...RANGES.map((range) => (
          <GhostButton
            key={range}
            onClick={() => {
              // Choosing a preset clears any custom range, so the two controls
              // cannot both look selected while only one is in effect.
              setCustom(null);
              setDays(range);
            }}
            className={
              custom === null && days === range
                ? "border-accent text-fg"
                : "text-fg-faint"
            }
          >
            {range} days
          </GhostButton>
          )),
          <GhostButton
            key="export"
            onClick={() => void exportCsv()}
            disabled={exporting || data === null}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </GhostButton>,
        ]}
      />

      <RangePicker
        value={custom}
        onApply={(range) => setCustom(range)}
        onClear={() => setCustom(null)}
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

          <Card>
            <SectionLabel>Demand by hour</SectionLabel>
            <p className="text-fg-faint mb-3 text-xs">
              Orders placed, by hour of the business day, across the whole
              period. This is the staffing question — when to get partners
              online.
            </p>
            <TrendChart
              points={data.hourly.map((bucket) => ({
                // Two digits, so the axis reads as clock time rather than as
                // an index. "9" beside "10" invites reading it as a count.
                label: String(bucket.hour).padStart(2, "0"),
                value: bucket.placed,
              }))}
              format={(value) => String(Math.round(value))}
              mode="bar"
              height={180}
            />
            <PeakHour hourly={data.hourly} />
          </Card>

          <Card>
            <SectionLabel>Returning customers</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Repeat rate"
                value={`${(data.retention.repeatRate * 100).toFixed(0)}%`}
                hint="Of customers active in this period, the share who have ordered more than once"
              />
              <Stat
                label="Active customers"
                value={String(data.retention.activeCustomers)}
                hint={`${data.retention.repeatCustomers} have ordered before`}
              />
              <Stat
                label="First-time"
                value={String(data.retention.newCustomers)}
                hint="First ever order fell inside this period"
              />
              <Stat
                label="Orders per customer"
                value={data.retention.averageLifetimeOrders.toFixed(1)}
                hint="Lifetime average, not just this period"
              />
            </div>
            <p className="text-fg-faint mt-4 text-xs">
              Measured over each customer&apos;s whole history, not just this
              window — somebody who ordered in January and again this week is
              returning, not new.
            </p>
          </Card>

          <Card>
            <SectionLabel>Partners</SectionLabel>
            <p className="text-fg-faint mb-3 text-xs">
              Ranked by deliveries rather than revenue — revenue rewards
              whoever drew the long jobs, and the question here is who is
              turning up.
            </p>
            <PartnerTable partners={data.partners} rupees={rupees} />
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Names the busiest hour in words.
 *
 * A reader can find the tallest bar themselves, but not without doing it every
 * time they look. Stating it once turns the chart from something to study into
 * something to glance at.
 */
function PeakHour({ hourly }: { hourly: Analytics["hourly"] }) {
  const busiest = hourly.reduce(
    (best, bucket) => (bucket.placed > best.placed ? bucket : best),
    hourly[0] ?? { hour: 0, placed: 0 },
  );

  const total = hourly.reduce((sum, bucket) => sum + bucket.placed, 0);
  if (total === 0) return null;

  const label = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

  return (
    <p className="text-fg-faint mt-3 text-xs">
      Busiest hour {label(busiest.hour)}–{label((busiest.hour + 1) % 24)} with{" "}
      <span className="text-fg-mid tabular-nums">{busiest.placed}</span> orders,{" "}
      {((busiest.placed / total) * 100).toFixed(0)}% of the period.
    </p>
  );
}

function PartnerTable({
  partners,
  rupees,
}: {
  partners: Analytics["partners"];
  rupees: (minor: number) => string;
}) {
  if (partners.length === 0) {
    return <p className="text-fg-faint py-4 text-sm">Nobody delivered in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-line text-fg-muted border-b text-left font-mono text-[9px] uppercase tracking-[2px]">
            <th className="py-2 pr-3 font-normal">Partner</th>
            <th className="py-2 pr-3 text-right font-normal">Delivered</th>
            <th className="py-2 pr-3 text-right font-normal">Cancelled</th>
            <th className="py-2 pr-3 text-right font-normal">Earned</th>
            <th className="py-2 text-right font-normal">Fares</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {partners.map((partner) => (
            <tr key={partner.riderId}>
              <td className="max-w-[220px] truncate py-2 pr-3">
                {partner.name}
                {partner.rating !== null && (
                  <span className="text-fg-faint ml-2 text-xs tabular-nums">
                    {partner.rating.toFixed(1)}★
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">
                {partner.delivered}
              </td>
              {/* The rate, not just the count. Two cancellations out of three
                  jobs and two out of ninety are different partners. */}
              <td
                className={`py-2 pr-3 text-right font-mono tabular-nums ${
                  partner.cancellationRate > 0.1 ? "text-warn" : "text-fg-faint"
                }`}
              >
                {partner.cancelled}
                {partner.cancelled > 0 && (
                  <span className="ml-1 text-xs">
                    ({(partner.cancellationRate * 100).toFixed(0)}%)
                  </span>
                )}
              </td>
              {/* Earned before fares, because it is the partner's number and
                  this is a table about partners. Both are shown because they
                  are easy to confuse — see BUG-043. */}
              <td className="py-2 pr-3 text-right font-mono tabular-nums">
                {rupees(partner.earned.minor)}
              </td>
              <td className="text-fg-faint py-2 text-right font-mono tabular-nums">
                {rupees(partner.revenue.minor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * An explicit date range.
 *
 * Kept in local state until Apply, so a half-typed date does not fire a
 * request on every keystroke — and the presets above stay authoritative until
 * somebody deliberately chooses otherwise.
 */
function RangePicker({
  value,
  onApply,
  onClear,
}: {
  value: { from: string; to: string } | null;
  onApply: (range: { from: string; to: string }) => void;
  onClear: () => void;
}) {
  const [from, setFrom] = useState(value?.from ?? "");
  const [to, setTo] = useState(value?.to ?? "");

  const complete = from !== "" && to !== "";

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-fg-muted font-mono text-[9px] uppercase tracking-[2px]">
          From
        </span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border-edge bg-panel text-fg focus:border-accent h-9 border px-2 font-sans text-[13px] focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-fg-muted font-mono text-[9px] uppercase tracking-[2px]">
          To
        </span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border-edge bg-panel text-fg focus:border-accent h-9 border px-2 font-sans text-[13px] focus:outline-none"
        />
      </label>

      <GhostButton disabled={!complete} onClick={() => onApply({ from, to })}>
        Apply range
      </GhostButton>

      {value && (
        <GhostButton
          onClick={() => {
            setFrom("");
            setTo("");
            onClear();
          }}
        >
          Clear
        </GhostButton>
      )}
    </div>
  );
}
