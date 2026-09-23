"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Stat } from "@/components/charts";
import { ExportButton } from "@/components/ExportButton";
import { Freshness } from "@/components/Freshness";
import {
  DemandHeatmap,
  FunnelBar,
  MultiSeriesChart,
  SERIES_COLOURS,
  StackedShareBar,
  type Series,
} from "@/components/InsightCharts";
import { MetricTable } from "@/components/MetricTable";
import {
  Card,
  EmptyState,
  GhostButton,
  PageHeader,
  SectionLabel,
  SkeletonCards,
  SkeletonChart,
  SkeletonRows,
} from "@/components/ui";
import {
  type Analytics,
  api,
  type DemandGrid,
  formatMoney,
  type MoneyBreakdown,
  type OrderFunnel,
} from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { useUrlParam } from "@/lib/useUrlState";

/**
 * How the business is doing.
 *
 * ## What this page is for
 *
 * Deciding things. Every figure is shown against the previous period of the
 * same length, because a number on its own cannot tell anybody whether to act.
 *
 * ## Why it is four requests rather than one
 *
 * The headline figures, the demand grid, the funnel and the ledger read are
 * four questions with four different costs — the ledger scan is by far the
 * slowest. Loaded together, the slowest one decides when anything appears.
 * Loaded separately, each panel shows its own skeleton and a failure is
 * contained to the panel that failed.
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
  const [daysRaw, setDaysRaw, daysReady] = useUrlParam("days", "30");
  const [from, setFrom, fromReady] = useUrlParam("from");
  const [to, setTo, toReady] = useUrlParam("to");
  const [mix, setMix, mixReady] = useUrlParam("mix", "zones");

  const urlReady = daysReady && fromReady && toReady && mixReady;

  const parsedDays = Number.parseInt(daysRaw, 10);
  const days =
    Number.isFinite(parsedDays) && parsedDays >= 7 && parsedDays <= 180
      ? parsedDays
      : 30;

  // Memoised, not a fresh literal per render: it is a dependency of `range`,
  // which is a dependency of four requests. An object rebuilt every render
  // would refetch all four in a loop.
  const custom = useMemo(() => (from && to ? { from, to } : null), [from, to]);
  const range = useMemo(() => custom ?? { days }, [custom, days]);

  /*
   * `keepPrevious` everywhere, and the reason is the failure this page had:
   * on an error it rendered a red sentence *and* a full-page shimmer, forever,
   * with no way to retry. Keeping the last good answer means a blip shows the
   * previous numbers with a line saying they are stale — which is what an
   * operator actually needs mid-shift.
   */
  /*
   * The receive time is stamped inside the loader, not read during render.
   *
   * `Date.now()` in a render body is impure — React may run the same render
   * twice under concurrent rendering and must get the same tree both times —
   * and `react-hooks/purity` is right to refuse it. This is the same shape the
   * monitoring page uses, and the same class of defect BUG-034 found in the
   * order detail page.
   */
  const main = useAsync<{ analytics: Analytics; receivedAt: number }>(
    async () => ({
      analytics: await api.analytics(range),
      receivedAt: Date.now(),
    }),
    [days, custom?.from, custom?.to],
    {
      enabled: urlReady,
      keepPrevious: true,
      fallback: "Could not load analytics.",
    },
  );
  const demand = useAsync<DemandGrid>(
    () => api.analyticsDemand(range),
    [days, custom?.from, custom?.to],
    {
      enabled: urlReady,
      keepPrevious: true,
      fallback: "Could not load demand.",
    },
  );
  const funnel = useAsync<OrderFunnel>(
    () => api.analyticsFunnel(range),
    [days, custom?.from, custom?.to],
    {
      enabled: urlReady,
      keepPrevious: true,
      fallback: "Could not load the funnel.",
    },
  );
  const money = useAsync<MoneyBreakdown>(
    () => api.analyticsMoney(range),
    [days, custom?.from, custom?.to],
    {
      enabled: urlReady,
      keepPrevious: true,
      fallback: "Could not load the ledger.",
    },
  );

  const data = main.data?.analytics ?? null;
  const rupees = (minor: number) => formatMoney({ minor, currency: "INR" });

  const reloadAll = () => {
    main.reload();
    demand.reload();
    funnel.reload();
    money.reload();
  };

  return (
    // Capped and centred. Without this the page stretched edge to edge on a
    // 2560px dispatch display, which is why the chart needed a ResizeObserver
    // to stay sane in the first place.
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        title="Analytics"
        subtitle={
          data ? (
            <>
              {data.range.from} to {data.range.to} · against the previous{" "}
              {data.days} days
            </>
          ) : (
            "Loading the period…"
          )
        }
        actions={
          <>
            <ExportButton
              label="Daily CSV"
              fetcher={() => api.downloadDailyCsv(range)}
            />
            <ExportButton
              label="Partners CSV"
              fetcher={() => api.downloadPartnersCsv(range)}
            />
          </>
        }
      />

      <RangeBar
        days={days}
        custom={custom}
        onDays={(next) => {
          setFrom("");
          setTo("");
          setDaysRaw(String(next));
        }}
        onCustom={(next) => {
          setFrom(next?.from ?? "");
          setTo(next?.to ?? "");
        }}
        freshAt={main.data?.receivedAt ?? null}
        stale={main.error !== null && main.data !== null}
        onRetry={reloadAll}
        error={main.error}
      />

      {/* ── The headline four ─────────────────────────────────────────── */}
      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Revenue (delivered)"
            value={rupees(data.summary.revenue.now.minor)}
            current={data.summary.revenue.now.minor}
            previous={data.summary.revenue.previous.minor}
            hero
          />
          <Stat
            label="Orders placed"
            value={String(data.summary.orders.now)}
            current={data.summary.orders.now}
            previous={data.summary.orders.previous}
            hint={`${data.summary.delivered} delivered`}
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
            hint={`${(data.summary.averageDistanceMeters / 1000).toFixed(1)} km average`}
          />
        </div>
      ) : (
        <SkeletonCards />
      )}

      {/* ── The chart, and the period before it ───────────────────────── */}
      <Card tone="raised" size="lg" className="p-4">
        <SectionLabel>Per day, against the previous period</SectionLabel>
        {data ? (
          data.daily.length === 0 ? (
            <EmptyState
              title="Nothing was ordered in this period"
              hint="Try a wider range, or check that orders are reaching production."
            />
          ) : (
            <div className="mt-3">
              <MultiSeriesChart
                labels={data.daily.map((day) => day.date.slice(5))}
                series={buildSeries(data, rupees)}
              />
              <p className="text-fg-faint mt-3 text-meta">
                {data.dailyPrevious
                  ? `The dashed line is revenue over the ${data.days} days before this period.`
                  : "No comparison period was requested."}
              </p>
            </div>
          )
        ) : (
          <SkeletonChart height={260} />
        )}
      </Card>

      {/* ── When the work arrives, and where it stops ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <SectionLabel>Demand by day and hour</SectionLabel>
          <p className="text-fg-muted mt-1 text-meta">
            Orders placed. This is the shape a duty roster has to match.
          </p>
          <div className="mt-3">
            {demand.data ? (
              <DemandHeatmap cells={demand.data.cells} />
            ) : demand.error ? (
              <PanelProblem message={demand.error} onRetry={demand.reload} />
            ) : (
              <SkeletonChart height={200} />
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionLabel>Where orders stop</SectionLabel>
          <div className="mt-3">
            {funnel.data ? (
              <>
                <FunnelBar
                  steps={[
                    { label: "Placed", count: funnel.data.steps.placed },
                    {
                      label: "Assigned",
                      count: funnel.data.steps.assigned,
                      note: median(
                        "to assign",
                        funnel.data.medianSeconds.toAssign,
                      ),
                    },
                    {
                      label: "Picked up",
                      count: funnel.data.steps.pickedUp,
                      note: median(
                        "to collect",
                        funnel.data.medianSeconds.toPickup,
                      ),
                    },
                    {
                      label: "Delivered",
                      count: funnel.data.steps.delivered,
                      note: median(
                        "to deliver",
                        funnel.data.medianSeconds.toDeliver,
                      ),
                    },
                  ]}
                />
                <Cancellations funnel={funnel.data} />
              </>
            ) : funnel.error ? (
              <PanelProblem message={funnel.error} onRetry={funnel.reload} />
            ) : (
              <SkeletonRows rows={4} />
            )}
          </div>
        </Card>
      </div>

      {/* ── Mix, and what the platform actually kept ──────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Mix</SectionLabel>
            <div className="flex gap-1">
              {MIXES.map((option) => (
                <GhostButton
                  key={option.key}
                  onClick={() => setMix(option.key)}
                  // Pressed, not just bordered: a colour alone tells a screen
                  // reader nothing about which of the three is showing.
                  aria-pressed={mix === option.key}
                  className={mix === option.key ? "border-accent" : ""}
                >
                  {option.label}
                </GhostButton>
              ))}
            </div>
          </div>
          <div className="mt-3">
            {data ? (
              <StackedShareBar
                segments={segmentsFor(data, mix).map((segment, index) => ({
                  ...segment,
                  colour: SERIES_COLOURS[index % SERIES_COLOURS.length]!,
                }))}
                format={(value) =>
                  mix === "payments" ? String(value) : rupees(value)
                }
              />
            ) : (
              <SkeletonRows rows={4} />
            )}
          </div>
          <p className="text-fg-faint mt-3 text-meta">
            {mix === "payments"
              ? "Orders by how they were paid."
              : "Revenue from delivered orders."}
          </p>
        </Card>

        <Card className="p-4">
          <SectionLabel>Ledger movement</SectionLabel>
          <p className="text-fg-muted mt-1 text-meta">
            What the books recorded in this period — not turnover.
          </p>
          <div className="mt-3">
            {money.data ? (
              <LedgerMovement breakdown={money.data} />
            ) : money.error ? (
              <PanelProblem message={money.error} onRetry={money.reload} />
            ) : (
              <SkeletonRows rows={5} />
            )}
          </div>
        </Card>
      </div>

      {/* ── Fleet and customers ───────────────────────────────────────── */}
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricTable
            label="Fleet"
            metrics={[
              { label: "Active partners", value: String(data.fleet.active) },
              {
                label: "Utilisation",
                value: `${Math.round(data.fleet.utilisation * 100)}%`,
              },
              {
                label: "Cash outstanding",
                value: rupees(data.fleet.cashOutstanding.minor),
              },
              {
                label: "Waiting on us",
                value: String(
                  data.fleet.pendingKyc + data.fleet.bankChecksPending,
                ),
              },
            ]}
            note={`${data.fleet.docExpired} with expired papers · ${data.fleet.suspended} suspended`}
          />
          <MetricTable
            label="Customers"
            metrics={[
              {
                label: "Repeat rate",
                value: `${Math.round(
                  (data.retention.activeCustomers === 0
                    ? 0
                    : data.retention.repeatCustomers /
                      data.retention.activeCustomers) * 100,
                )}%`,
              },
              {
                label: "Active",
                value: String(data.retention.activeCustomers),
              },
              {
                label: "First-time",
                value: String(data.retention.newCustomers),
              },
              {
                label: "Orders per customer",
                value: data.retention.averageLifetimeOrders.toFixed(1),
              },
            ]}
          />
        </div>
      ) : null}

      {/* ── Partners ──────────────────────────────────────────────────── */}
      <Card className="p-4">
        <SectionLabel>Partners</SectionLabel>
        <div className="mt-3">
          {data ? (
            data.partners.length === 0 ? (
              <EmptyState
                title="Nobody delivered in this period"
                hint={
                  <>
                    A partner appears here once one of their deliveries is
                    marked delivered in the selected range. Try a wider range,
                    or see what state the work is in on{" "}
                    <Link href="/orders" className="text-accent underline-offset-2 hover:underline">
                      deliveries
                    </Link>
                    .
                  </>
                }
              />
            ) : (
              <PartnerTable partners={data.partners} rupees={rupees} />
            )
          ) : (
            <SkeletonRows rows={6} />
          )}
        </div>
      </Card>
    </div>
  );
}

const MIXES = [
  { key: "zones", label: "Zone" },
  { key: "vehicles", label: "Vehicle" },
  { key: "goods", label: "Goods" },
  { key: "payments", label: "Payment" },
] as const;

function segmentsFor(data: Analytics, mix: string) {
  if (mix === "vehicles") {
    return data.breakdowns.vehicles.map((v) => ({
      label: v.label,
      value: v.revenue.minor,
    }));
  }
  if (mix === "goods") {
    return data.breakdowns.goods.map((g) => ({
      label: g.label,
      value: g.revenue.minor,
    }));
  }
  if (mix === "payments") {
    return data.breakdowns.payments.map((p) => ({
      // The wire value is the column; the reader wants the word.
      label: p.label === "cod" ? "Cash" : "Prepaid",
      value: p.orders,
    }));
  }
  return data.breakdowns.zones.map((z) => ({
    label: z.label,
    value: z.revenue.minor,
  }));
}

function buildSeries(
  data: Analytics,
  rupees: (minor: number) => string,
): Series[] {
  const previous = data.dailyPrevious;
  const count = (value: number) => String(value);

  return [
    {
      key: "revenue",
      label: "Revenue",
      colour: SERIES_COLOURS[0],
      line: true,
      format: rupees,
      values: data.daily.map((d) => d.revenue.minor),
      comparison: previous?.map((d) => d.revenue.minor),
    },
    {
      key: "delivered",
      label: "Delivered",
      colour: SERIES_COLOURS[1],
      format: count,
      values: data.daily.map((d) => d.delivered),
    },
    {
      key: "cancelled",
      label: "Cancelled",
      colour: SERIES_COLOURS[3],
      format: count,
      values: data.daily.map((d) => d.cancelled),
    },
  ];
}

/** "median 7 min to assign", or nothing when there is nothing to say. */
function median(what: string, seconds: number | null): string | undefined {
  if (seconds === null) return undefined;
  if (seconds < 90) return `median ${seconds}s ${what}`;
  return `median ${Math.round(seconds / 60)} min ${what}`;
}

/**
 * The one control for the period.
 *
 * It was two: preset buttons inside the page header and a separate date picker
 * below it, neither indicating which was in force. One row, one answer.
 */
function RangeBar({
  days,
  custom,
  onDays,
  onCustom,
  freshAt,
  stale,
  error,
  onRetry,
}: {
  days: number;
  custom: { from: string; to: string } | null;
  onDays: (days: number) => void;
  onCustom: (range: { from: string; to: string } | null) => void;
  freshAt: number | null;
  stale: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(custom?.from ?? "");
  const [end, setEnd] = useState(custom?.to ?? "");

  // 180 is the server's cap and the page's own parser already accepts it; it
  // was previously reachable only by editing the URL by hand.
  const presets = [7, 30, 90, 180];

  const span =
    start && end
      ? Math.round(
          (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
            86_400_000,
        )
      : 0;
  const tooWide = Math.abs(span) > 180;

  return (
    <Card tone="inset" className="p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <GhostButton
              key={preset}
              onClick={() => onDays(preset)}
              aria-pressed={custom === null && days === preset}
              className={
                custom === null && days === preset ? "border-accent" : ""
              }
            >
              {preset} days
            </GhostButton>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <input
            type="date"
            value={start}
            max={today}
            onChange={(event) => setStart(event.target.value)}
            className="border-line bg-surface text-body rounded border px-2 py-1"
            aria-label="From date"
          />
          <span className="text-fg-faint text-meta">to</span>
          <input
            type="date"
            value={end}
            max={today}
            onChange={(event) => setEnd(event.target.value)}
            className="border-line bg-surface text-body rounded border px-2 py-1"
            aria-label="To date"
          />
          <GhostButton
            onClick={() => onCustom({ from: start, to: end })}
            disabled={!start || !end || tooWide}
            className={custom !== null ? "border-accent" : ""}
          >
            Apply
          </GhostButton>
          {custom && (
            <GhostButton
              onClick={() => {
                setStart("");
                setEnd("");
                onCustom(null);
              }}
            >
              Clear
            </GhostButton>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Said before the request is sent, rather than surfaced as a 400
              from the server through the generic error card. */}
          {tooWide && (
            <span className="text-warn text-meta">
              That is {Math.abs(span)} days. The most this page charts is 180.
            </span>
          )}
          <span className="text-fg-faint text-meta">Business day, IST</span>
          <Freshness at={freshAt} />
        </div>
      </div>

      {stale && error && (
        // The monitoring page's pattern: the numbers on screen are the last
        // good ones, said plainly, with a way to try again.
        <p role="status" className="text-fg-muted mt-2 text-meta">
          Showing the last successful load — {error}.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="text-accent underline"
          >
            Try again
          </button>
        </p>
      )}
    </Card>
  );
}

/** A panel that could not load, without taking the page with it. */
function PanelProblem({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="py-6 text-center">
      <p className="text-fg-mid text-body">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-accent mt-1 text-meta underline"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Cancellations, counted and quoted.
 *
 * `orders.cancellation_reason` is free text, so there is no honest pie chart
 * to draw here: grouping it would invent categories out of whatever words
 * people typed. The count is the fact; the reasons are quoted as written.
 */
function Cancellations({ funnel }: { funnel: OrderFunnel }) {
  if (funnel.steps.cancelled === 0) return null;

  return (
    <div className="border-line mt-4 border-t pt-3">
      <p className="text-body">
        <span className="font-mono tabular-nums">{funnel.steps.cancelled}</span>{" "}
        cancelled
      </p>
      {funnel.cancellationReasons.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {funnel.cancellationReasons.slice(0, 5).map((reason) => (
            <li
              key={reason.reason}
              className="text-fg-muted flex justify-between gap-2 text-meta"
            >
              <span className="truncate">{reason.reason}</span>
              <span className="font-mono tabular-nums">{reason.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ledger account purposes, in the words an operator uses. */
const PURPOSES: Record<string, string> = {
  commission: "Platform commission",
  gst_payable: "GST payable",
  earnings: "Partner earnings",
  payouts_paid: "Payouts settled",
  cash_in_hand: "Cash with partners",
  wallet: "Customer wallets",
  gateway_clearing: "In flight at the gateway",
};

function LedgerMovement({ breakdown }: { breakdown: MoneyBreakdown }) {
  if (breakdown.accounts.length === 0) {
    return (
      <EmptyState
        title="No postings in this period"
        hint={
          <>
            The ledger moves when an order is paid for, a refund is issued or a
            payout settles. None of those happened in this range — try a wider
            one, or check{" "}
            <Link href="/payments" className="text-accent underline-offset-2 hover:underline">
              payments
            </Link>{" "}
            and{" "}
            <Link href="/payouts" className="text-accent underline-offset-2 hover:underline">
              payouts
            </Link>
            .
          </>
        }
      />
    );
  }

  return (
    <>
      <ul className="divide-line divide-y">
        {breakdown.accounts.map((account) => (
          <li
            key={`${account.ownerType}-${account.purpose}`}
            className="flex items-baseline justify-between gap-2 py-2"
          >
            <span className="text-body">
              {PURPOSES[account.purpose] ?? account.purpose}
              {/*
                The same purpose can exist for more than one owner type, and
                two rows with one label would read as a duplicate rather than
                as two different accounts. Named only when it is ambiguous, so
                the common case stays uncluttered.
              */}
              {breakdown.accounts.filter(
                (other) => other.purpose === account.purpose,
              ).length > 1 && (
                <span className="text-fg-faint text-meta">
                  {" "}
                  · {account.ownerType}
                </span>
              )}
            </span>
            <span className="font-mono text-body tabular-nums">
              {formatMoney(account.amount)}
            </span>
          </li>
        ))}
      </ul>
      {/*
        Said rather than assumed. These are net movements of double-entry
        accounts over the window, which is not the same thing as profit, and
        labelling them "revenue" would be the kind of small lie that ends up in
        a board pack.
      */}
      <p className="text-fg-faint mt-3 text-meta">
        Net movement of each account over the period, from the ledger. Not a
        profit and loss statement.
      </p>
    </>
  );
}

function PartnerTable({
  partners,
  rupees,
}: {
  partners: Analytics["partners"];
  rupees: (minor: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-body">
        <thead>
          <tr className="text-fg-faint text-micro">
            <th className="py-1 text-left font-normal">Partner</th>
            <th className="py-1 text-right font-normal">Delivered</th>
            <th className="py-1 text-right font-normal">Cancelled</th>
            <th className="py-1 text-right font-normal">Earned</th>
            <th className="py-1 text-right font-normal">Fares</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {partners.map((partner) => (
            <tr key={partner.riderId}>
              <td className="py-2">
                {/* Every row leads somewhere. The overview page has done this
                    since it was written; this page linked nowhere at all. */}
                <Link
                  href={`/riders/${partner.riderId}`}
                  className="hover:text-accent underline-offset-2 hover:underline"
                >
                  {partner.name}
                </Link>
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {partner.delivered}
              </td>
              <td
                className={`py-2 text-right font-mono tabular-nums ${
                  partner.cancellationRate > 0.1 ? "text-warn" : ""
                }`}
              >
                {partner.cancelled}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {rupees(partner.earned.minor)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {rupees(partner.revenue.minor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
